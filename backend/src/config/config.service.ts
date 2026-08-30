import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Config } from "@prisma/client";
import * as argon from "argon2";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "src/prisma/prisma.service";
import { stringToTimespan } from "src/utils/date.util";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { I18nContext } from "nestjs-i18n";
import { YamlConfig } from "../../prisma/seed/config.seed";
import { CONFIG_FILE } from "src/constants";

/**
 * ConfigService extends EventEmitter to allow listening for config updates,
 * now only `update` event will be emitted.
 */
@Injectable()
export class ConfigService extends EventEmitter {
  yamlConfig?: YamlConfig;
  logger = new Logger(ConfigService.name);

  // Guards the write<->watch loop below: writeYamlConfig() remembers the
  // exact content it last put on disk, and the fs.watch handler in
  // startYamlWatcher() compares against it before reacting — so the file
  // rewriting itself (e.g. into canonical formatting right after a hand
  // edit) never gets mistaken for a second external change and reprocessed.
  private lastWrittenYaml: string | null = null;
  private yamlWatchDebounce: ReturnType<typeof setTimeout>;

  constructor(
    @Inject("CONFIG_VARIABLES") private configVariables: Config[],
    private prisma: PrismaService,
  ) {
    super();
  }

  // The env-var-secrets escape hatch, alongside config.yaml above: a
  // secret-shaped field (obscured: true — smtp.password, ldap.bindPassword,
  // s3.key/secret, oauth.*-clientSecret) can be set via a real environment
  // variable instead of ever being persisted in a casually-readable form.
  // Deliberately NOT wired into the yaml mirror at all (writeYamlConfig/
  // applyYamlToConfig below both skip every obscured field, whether or not
  // an env var is actually set for it) — the whole point is that a secret
  // never has to sit in that flat, easily-`cat`-able file. Naming mirrors
  // this app's own pre-DB-config history (SMTP_PASSWORD, JWT_SECRET, ...):
  // CATEGORY_NAME, name's own camelCase/dashes turned into more underscores.
  private envVarNameFor(category: string, name: string): string {
    const snake = name
      .replace(/-/g, "_")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toUpperCase();
    return `${category.toUpperCase()}_${snake}`;
  }

  // undefined (not "") when unset, so callers can `??` past it cleanly.
  private envValueFor(variable: Config): string | undefined {
    if (!variable.obscured) return undefined;
    const raw = process.env[this.envVarNameFor(variable.category, variable.name)];
    return raw ? raw : undefined;
  }

  // Initialize gets called by the ConfigModule
  async initialize() {
    await this.loadYamlConfig();

    if (this.yamlConfig) {
      await this.migrateInitUser();
      this.startYamlWatcher();
    }
  }

  // Config.yaml and the admin panel are two sides of the same state now —
  // this brings the DB up to date with whatever's on disk at boot, exactly
  // like a value changed through the admin panel would be (see update()),
  // rather than the old approach of layering yaml values in memory only.
  // writeYamlConfig() at the end backfills the file with any config key
  // it didn't have yet (a fresh install, or a key added since — this
  // session added several), so a minimal or even empty file, once
  // mounted, grows into a full mirror on its own.
  private async loadYamlConfig() {
    let raw: string;
    try {
      raw = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch {
      this.logger.log(
        "Config.yaml is not set. Falling back to UI configuration.",
      );
      return;
    }
    try {
      const parsed = yamlParse(raw) || {};
      this.yamlConfig = parsed;
      this.lastWrittenYaml = raw;
      await this.applyYamlToConfig(parsed);
      await this.writeYamlConfig();
    } catch (e) {
      this.logger.error(
        "Failed to parse config.yaml. Falling back to UI configuration: ",
        e,
      );
    }
  }

  // Shared by the initial boot-time load above and every live reload
  // triggered by startYamlWatcher() below — applies each key present in a
  // parsed config.yaml through the exact same path an admin panel edit
  // takes (update(), a few lines down), so a value set via the file is
  // indistinguishable from one set via the UI: persisted, validated, and
  // immediately live. A key the file doesn't mention is left exactly as
  // the DB already had it — only present keys are authoritative.
  private async applyYamlToConfig(parsed: YamlConfig) {
    for (const variable of this.configVariables) {
      // Secrets never round-trip through the file in either direction —
      // see the constructor's envVarNameFor comment. Enforced here too,
      // not just by writeYamlConfig() never emitting the key: a hand-typed
      // secret pasted into an otherwise-legitimate config.yaml (e.g. from
      // an old example file) must not get quietly picked up either.
      if (variable.locked || variable.obscured) continue;
      const category = (parsed as any)[variable.category];
      if (!category || !(variable.name in category)) continue;

      const newValue = category[variable.name];
      const currentValue = variable.value ?? variable.defaultValue;
      if (String(newValue) === String(currentValue)) continue;

      try {
        await this.update(
          `${variable.category}.${variable.name}`,
          this.coerceYamlValue(variable.type, newValue),
        );
      } catch (e) {
        this.logger.warn(
          `Skipped invalid value for ${variable.category}.${variable.name} from ${CONFIG_FILE}: ${e.message || e}`,
        );
      }
    }
  }

  // update()'s own type check (below) only tolerates a JS type that
  // matches `type` exactly for number/filesize/boolean — the admin panel
  // always sends one, since Mantine's NumberInput/Switch produce a real
  // number/boolean in JS. A YAML value doesn't reliably arrive that way:
  // config.example.yaml quotes every value (`shareIdLength: "8"`), as does
  // writeYamlConfig()'s own output, and yamlParse() dutifully hands those
  // back as strings — which update() would otherwise reject outright.
  // string/text/timespan already accept a bare string with no coercion.
  private coerceYamlValue(
    type: string,
    rawValue: unknown,
  ): string | number | boolean {
    if (type === "number" || type === "filesize") return parseInt(String(rawValue));
    if (type === "boolean") return rawValue === true || rawValue === "true";
    return String(rawValue);
  }

  // Regenerates the whole file from the current DB-backed state whenever
  // it changes (called from update() below) — the write-through half of
  // the mirror. Only does anything once a config.yaml was actually found
  // at boot (this.yamlConfig set): installs that never mount one are
  // completely unaffected, no file appears out of nowhere. Locked fields
  // are left out, matching them being hidden from the admin panel too —
  // neither surface is meant to touch them.
  //
  // This rewrites the entire file, not just the changed key, so any
  // comments or hand formatting in a manually edited file get replaced by
  // this canonical layout the first time anything changes after that edit
  // — an accepted tradeoff of true two-way sync rather than a partial,
  // structure-preserving patch.
  private async writeYamlConfig() {
    if (!this.yamlConfig) return;

    const grouped: Record<string, Record<string, string>> = {};
    for (const variable of this.configVariables) {
      // See applyYamlToConfig's comment just above — same exclusion, same
      // reason, kept symmetric on the write-out side.
      if (variable.locked || variable.obscured) continue;
      grouped[variable.category] ??= {};
      grouped[variable.category][variable.name] =
        variable.value ?? variable.defaultValue;
    }

    const content = yamlStringify(grouped, { lineWidth: 0 });
    if (content === this.lastWrittenYaml) return;

    try {
      fs.writeFileSync(CONFIG_FILE, content);
      this.lastWrittenYaml = content;
    } catch (e) {
      this.logger.error(
        `Failed to write ${CONFIG_FILE} — the change above is still saved to the database and live, just not mirrored to the file until this is fixed (check the mounted file's permissions): `,
        e,
      );
    }
  }

  // The read-through half of the mirror: picks up an external hand edit to
  // config.yaml without a restart. fs.watch can fire more than once per
  // save (most editors write in several steps), hence the debounce; the
  // lastWrittenYaml comparison in reloadFromYamlFile() is what actually
  // prevents this from reacting to writeYamlConfig()'s own writes (a plain
  // "did the event fire" guard can't tell those apart, content can).
  //
  // Watches the containing directory, not the file itself: many editors
  // (vim, nano's default, `sed -i` on macOS/BSD) save by writing a temp
  // file and renaming it over the original rather than editing in place.
  // A watch on the file's own path survives that fine on Linux (inotify
  // re-resolves the path), but on some platforms/filesystems a handle
  // bound to the original inode goes silently stale the moment it's
  // replaced — confirmed while testing this locally. A directory watch,
  // filtered to this one filename, doesn't have that failure mode.
  private startYamlWatcher() {
    try {
      fs.watch(
        path.dirname(CONFIG_FILE),
        { persistent: false },
        (_eventType, filename) => {
          if (filename && filename !== path.basename(CONFIG_FILE)) return;
          clearTimeout(this.yamlWatchDebounce);
          this.yamlWatchDebounce = setTimeout(
            () => this.reloadFromYamlFile(),
            300,
          );
        },
      );
    } catch (e) {
      this.logger.error(
        `Failed to watch ${path.dirname(CONFIG_FILE)} for changes to ${CONFIG_FILE}: `,
        e,
      );
    }
  }

  private async reloadFromYamlFile() {
    let raw: string;
    try {
      raw = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch (e) {
      this.logger.warn(`Could not read ${CONFIG_FILE} after a change event: `, e);
      return;
    }
    if (raw === this.lastWrittenYaml) return; // Our own write echoing back.

    let parsed: YamlConfig;
    try {
      parsed = yamlParse(raw) || {};
    } catch (e) {
      this.logger.error(
        `${CONFIG_FILE} is no longer valid YAML — ignoring it until it's fixed: `,
        e,
      );
      return;
    }

    this.yamlConfig = parsed;
    await this.applyYamlToConfig(parsed);
  }

  private async migrateInitUser(): Promise<void> {
    if (!this.yamlConfig.initUser?.enabled) return;

    const userCount = await this.prisma.user.count({
      where: { isAdmin: true },
    });
    if (userCount === 1) {
      this.logger.log(
        "Skip initial user creation. Admin user is already existent.",
      );
      return;
    }
    await this.prisma.user.create({
      data: {
        email: this.yamlConfig.initUser.email,
        username: this.yamlConfig.initUser.username,
        password: this.yamlConfig.initUser.password
          ? await argon.hash(this.yamlConfig.initUser.password)
          : null,
        isAdmin: this.yamlConfig.initUser.isAdmin,
      },
    });
  }

  get(key: `${string}.${string}`): any {
    const configVariable = this.configVariables.filter(
      (variable) => `${variable.category}.${variable.name}` == key,
    )[0];

    if (!configVariable) throw new Error(`Config variable ${key} not found`);

    const value =
      this.envValueFor(configVariable) ??
      configVariable.value ??
      configVariable.defaultValue;

    if (configVariable.type == "number" || configVariable.type == "filesize")
      return parseInt(value);
    if (configVariable.type == "boolean") return value == "true";
    if (configVariable.type == "string" || configVariable.type == "text")
      return value;
    if (configVariable.type == "timespan") return stringToTimespan(value);
  }

  async getByCategory(category: string) {
    const configVariables = this.configVariables
      .filter((c) => !c.locked && category == c.category)
      .sort((a, b) => a.order - b.order);

    return configVariables.map((variable) => {
      const envValue = this.envValueFor(variable);
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        // An env-managed secret is never sent to the browser at all, even
        // the admin's — there's nothing to prefill an edit form with when
        // editing is disabled anyway (see allowEdit below), so it's simply
        // withheld rather than echoed back the way every other field's
        // current value already is.
        value: envValue !== undefined ? "" : (variable.value ?? variable.defaultValue),
        // Editing used to be locked out entirely once a config.yaml was
        // present — now the file and the admin panel mirror each other
        // (see writeYamlConfig/applyYamlToConfig), so both stay editable.
        // An env-managed secret is the one exception: the environment
        // variable is authoritative, so an admin-panel edit would just be
        // silently overridden by it again on the next read via get().
        allowEdit: envValue === undefined,
        // Lets the admin UI show an informational note (not a lock, see
        // above) when a config.yaml is actually mounted and being synced.
        mirroredToFile: !!this.yamlConfig,
        // Same idea, for the env-var escape hatch on secret fields — lets
        // the admin UI explain *why* the field above is disabled.
        envManaged: envValue !== undefined,
      };
    });
  }

  async list() {
    const configVariables = this.configVariables.filter((c) => !c.secret);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
      };
    });
  }

  async updateMany(data: { key: string; value: string | number | boolean }[]) {
    const response: Config[] = [];

    for (const variable of data) {
      response.push(await this.update(variable.key, variable.value));
    }

    return response;
  }

  async update(key: string, value: string | number | boolean) {
    const configVariable = await this.prisma.config.findUnique({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
    });

    if (!configVariable || configVariable.locked)
      throw new NotFoundException(
        this.t("config.variableNotFound", "Config variable not found"),
      );

    if (this.envValueFor(configVariable) !== undefined)
      throw new BadRequestException(
        this.t(
          "config.envManaged",
          "{key} is set via the {envVar} environment variable and can't be edited here",
          {
            key,
            envVar: this.envVarNameFor(
              configVariable.category,
              configVariable.name,
            ),
          },
        ),
      );

    if (value === "") {
      value = null;
    } else if (
      typeof value != configVariable.type &&
      typeof value == "string" &&
      configVariable.type != "text" &&
      configVariable.type != "timespan"
    ) {
      throw new BadRequestException(
        this.t("config.invalidType", "Config variable must be of type {type}", {
          type: configVariable.type,
        }),
      );
    }

    this.validateConfigVariable(key, value);

    const updatedVariable = await this.prisma.config.update({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
      data: { value: value === null ? null : value.toString() },
    });

    this.configVariables = await this.prisma.config.findMany();

    this.emit("update", key, value);

    // No-op unless a config.yaml is actually mounted — see its own comment.
    await this.writeYamlConfig();

    return updatedVariable;
  }

  validateConfigVariable(key: string, value: string | number | boolean) {
    const validations = [
      {
        key: "share.shareIdLength",
        condition: (value: number) => value >= 2 && value <= 50,
        message: this.t(
          "config.shareIdLengthValidation",
          "Share ID length must be between 2 and 50",
        ),
      },
      {
        key: "share.zipCompressionLevel",
        condition: (value: number) => value >= 0 && value <= 9,
        message: this.t(
          "config.zipCompressionLevelValidation",
          "Zip compression level must be between 0 and 9",
        ),
      },
      // TODO add validation for timespan type
    ];

    const validation = validations.find((validation) => validation.key == key);
    if (validation && !validation.condition(value as any)) {
      throw new BadRequestException(validation.message);
    }
  }

  private t(
    key: string,
    fallback: string,
    args?: Record<string, string | number | boolean>,
  ) {
    const translated = I18nContext.current()?.t(key, { args });
    if (translated && translated !== key) return translated;

    return Object.entries(args ?? {}).reduce(
      (message, [argKey, value]) =>
        message.replaceAll(`{${argKey}}`, String(value)),
      fallback,
    );
  }
}
