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
import { CONFIG_FILE, SECRETS_FILE } from "src/constants";
import { hasAnySignInMethod } from "../utils/signInMethod.util";
import { redactObscured } from "./obscuredValue.util";

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

  // The last write attempt's outcome for each mirror file - null once it
  // succeeds (or there was nothing to write), the OS error message while
  // it's failing. Read by getByCategory() so the admin panel can show a
  // real warning instead of the silent, log-only failure this used to be:
  // the DB write it's paired with always succeeds regardless, so an admin
  // who just changed a setting would see it "saved" with nothing wrong,
  // right up until a restart re-read the still-stale file and quietly put
  // the old value back - exactly what happened to this app's own SMTP
  // config once already (a file-permission ACL blocking the write, found
  // and fixed 2026-09-06, but any future cause of the same failure mode
  // would have been just as invisible without this).
  private yamlWriteError: string | null = null;
  private secretsWriteError: string | null = null;

  // null until a secrets.env is actually found (mirrors yamlConfig above) —
  // only needed to distinguish "no file" for initialize()'s watcher gating
  // and getByCategory's mirroredToSecretsFile flag; the DB is what get()
  // actually reads once applySecretsToConfig has run (see below), same as
  // config.yaml. Same write<->watch echo-guard role as lastWrittenYaml.
  private secretsFromFile: Record<string, string> | null = null;
  private lastSecretsRaw: string | null = null;

  constructor(
    @Inject("CONFIG_VARIABLES") private configVariables: Config[],
    private prisma: PrismaService,
  ) {
    super();
  }

  // secrets.env mirrors every obscured: true field (smtp.password,
  // ldap.bindPassword, s3.key/secret, oauth.*-clientSecret,
  // cache.redis-url, ...) the same way config.yaml mirrors everything else
  // (see loadSecretsFile/writeSecretsFile/applySecretsToConfig below) —
  // just as its own file, serialized KEY=value, so it can be permissioned
  // tighter (chmod 600) independently of the rest of the config. Naming
  // mirrors this app's own pre-DB-config history (SMTP_PASSWORD,
  // JWT_SECRET, ...): CATEGORY_NAME, name's own camelCase/dashes turned
  // into more underscores.
  private envVarNameFor(category: string, name: string): string {
    const snake = name
      .replace(/-/g, "_")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toUpperCase();
    return `${category.toUpperCase()}_${snake}`;
  }

  // Last-resort default for a secret field that's never been set through
  // either the admin panel or secrets.env — lets a bare `docker run -e` /
  // Kubernetes-secret-as-env-var still work for anyone not adopting the
  // file. Once a real value exists in the DB (set via either surface),
  // get()'s own `??` chain never reaches this again. undefined (not "")
  // when unset, so callers can `??` past it cleanly.
  private processEnvFallback(variable: Config): string | undefined {
    if (!variable.obscured) return undefined;
    const raw =
      process.env[this.envVarNameFor(variable.category, variable.name)];
    return raw ? raw : undefined;
  }

  // Initialize gets called by the ConfigModule
  async initialize() {
    await this.loadYamlConfig();
    await this.loadSecretsFile();

    if (this.yamlConfig) {
      await this.migrateInitUser();
      this.startYamlWatcher();
    }
    if (this.secretsFromFile) {
      this.startSecretsWatcher();
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

  // Bidirectional mirror for every obscured field, same idea as
  // loadYamlConfig above — applySecretsToConfig pushes the file's values
  // into the DB through the normal update() path (so a value set in the
  // file is indistinguishable from one set via the admin panel), and
  // writeSecretsFile at the end backfills the file with any obscured field
  // it didn't have yet, so a minimal or empty file, once mounted, grows
  // into a full mirror on its own — exactly like config.yaml does.
  private async loadSecretsFile() {
    let raw: string;
    try {
      raw = fs.readFileSync(SECRETS_FILE, "utf8");
    } catch {
      this.logger.log(
        "secrets.env is not set. Secret fields fall back to the admin panel.",
      );
      return;
    }
    this.lastSecretsRaw = raw;
    this.secretsFromFile = this.parseSecretsFile(raw);
    await this.applySecretsToConfig(this.secretsFromFile);
    await this.writeSecretsFile();
  }

  // Triggered by startSecretsWatcher() below on every change to
  // SECRETS_FILE. Never logs a value, only how many were found — same
  // spirit as never sending one to the admin panel in getByCategory below.
  private async reloadSecretsFile() {
    let raw: string;
    try {
      raw = fs.readFileSync(SECRETS_FILE, "utf8");
    } catch (e) {
      this.logger.warn(
        `Could not read ${SECRETS_FILE} after a change event: `,
        e,
      );
      return;
    }
    if (raw === this.lastSecretsRaw) return; // Our own write echoing back.

    this.secretsFromFile = this.parseSecretsFile(raw);
    await this.applySecretsToConfig(this.secretsFromFile);
  }

  // Deliberately minimal KEY=value parsing rather than pulling in a real
  // dotenv-style library: no multi-line values, no variable expansion, no
  // `export` prefix — writeSecretsFile below is the only writer this file
  // ever needs to round-trip through, and a parser this small has nowhere
  // to hide a security bug. `#` starts a full-line comment, blank lines
  // are ignored, and one malformed line is simply skipped rather than
  // failing the whole file. Undoes escapeSecretValue's escaping for a
  // double-quoted value; a single-quoted one is taken literally (no
  // escaping) — convenient for a hand-typed value that itself contains a
  // literal backslash.
  private parseSecretsFile(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        value = value.slice(1, -1).replace(/\\(.)/g, "$1");
      } else if (
        value.startsWith("'") &&
        value.endsWith("'") &&
        value.length >= 2
      ) {
        value = value.slice(1, -1);
      }

      if (key) result[key] = value;
    }
    return result;
  }

  // Read-through half of the secrets.env mirror, same role as
  // applyYamlToConfig below: a value present in the file is pushed into
  // the DB via the normal update() path, so it's validated, persisted,
  // and live immediately — indistinguishable from an admin-panel edit.
  // Unlike applyYamlToConfig, this only ever looks at obscured fields; a
  // key in the file with no matching one (a typo, or one left over from
  // a field that no longer exists) is silently ignored rather than
  // surfaced — there's no admin-panel-visible field it could sensibly
  // warn against.
  private async applySecretsToConfig(parsed: Record<string, string>) {
    for (const variable of this.configVariables) {
      if (!variable.obscured) continue;
      const varName = this.envVarNameFor(variable.category, variable.name);
      if (!(varName in parsed)) continue;

      const newValue = parsed[varName];
      // A blank value means "not set yet" (see secrets.env.example), same
      // as the key being absent — never "explicitly clear this". Without
      // this, a secrets.env freshly copied from the example (every line
      // blank) would wipe every real secret already sitting in the DB the
      // moment it's first mounted on an instance that predates this file.
      // Confirmed live: without this guard, that's exactly what happens.
      // To actually clear one, use the admin panel — unambiguous there.
      if (newValue === "") continue;
      const currentValue = variable.value ?? variable.defaultValue;
      if (newValue === currentValue) continue;

      try {
        await this.update(`${variable.category}.${variable.name}`, newValue);
      } catch (e) {
        this.logger.warn(
          `Skipped invalid value for ${variable.category}.${variable.name} from ${SECRETS_FILE}: ${e.message || e}`,
        );
      }
    }
  }

  // Write-through half of the secrets.env mirror — same idea as
  // writeYamlConfig below, scoped to just the obscured fields and
  // serialized as KEY=value. Only does anything once a secrets.env was
  // actually found at boot (this.secretsFromFile set), same gating as
  // writeYamlConfig itself.
  private async writeSecretsFile() {
    if (!this.secretsFromFile) return;

    const lines: string[] = [];
    for (const variable of this.configVariables) {
      if (!variable.obscured) continue;
      const varName = this.envVarNameFor(variable.category, variable.name);
      const value = variable.value ?? variable.defaultValue;
      lines.push(`${varName}=${this.escapeSecretValue(value)}`);
    }
    const content = lines.join("\n") + (lines.length ? "\n" : "");
    if (content === this.lastSecretsRaw) return;

    try {
      fs.writeFileSync(SECRETS_FILE, content);
      this.lastSecretsRaw = content;
      this.secretsWriteError = null;
    } catch (e) {
      this.secretsWriteError = e.message || String(e);
      this.logger.error(
        `Failed to write ${SECRETS_FILE} — the change above is still saved to the database and live, just not mirrored to the file until this is fixed (check the mounted file's permissions): `,
        e,
      );
    }
  }

  // Always double-quoted, regardless of content — simpler and more
  // robust than conditionally deciding whether a value "needs" it (a
  // password with a leading/trailing space, or one that happens to start
  // with #, would otherwise round-trip wrong or look like a comment).
  private escapeSecretValue(value: string): string {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
      // Same reasoning as applySecretsToConfig's own guard: a blank
      // string is "not filled in yet", never "explicitly clear this" —
      // otherwise a config.yaml started from config.example.yaml (full of
      // "" placeholders, e.g. smtp.host) would wipe real values already
      // configured through the admin panel the moment it's first mounted
      // on an instance that predates this file. No type value other than
      // string/text ever legitimately serializes as "" in this app's
      // convention, so this is safe unconditionally.
      if (newValue === "") continue;
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
    if (type === "number" || type === "filesize")
      return parseInt(String(rawValue));
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
      this.yamlWriteError = null;
    } catch (e) {
      this.yamlWriteError = e.message || String(e);
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
  //
  // Shared with startSecretsWatcher below — each call closes over its own
  // debounce timer, so the two files' watchers never interfere with each
  // other despite sharing this one implementation.
  private watchFile(filePath: string, onChange: () => void) {
    let debounce: ReturnType<typeof setTimeout>;
    try {
      fs.watch(
        path.dirname(filePath),
        { persistent: false },
        (_eventType, filename) => {
          if (filename && filename !== path.basename(filePath)) return;
          clearTimeout(debounce);
          debounce = setTimeout(onChange, 300);
        },
      );
    } catch (e) {
      this.logger.error(
        `Failed to watch ${path.dirname(filePath)} for changes to ${filePath}: `,
        e,
      );
    }
  }

  private startYamlWatcher() {
    this.watchFile(CONFIG_FILE, () => this.reloadFromYamlFile());
  }

  // Read-through hot-reload for secrets.env, exactly like startYamlWatcher
  // above — no write-back counterpart, see loadSecretsFile's comment.
  private startSecretsWatcher() {
    this.watchFile(SECRETS_FILE, () => this.reloadSecretsFile());
  }

  private async reloadFromYamlFile() {
    let raw: string;
    try {
      raw = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch (e) {
      this.logger.warn(
        `Could not read ${CONFIG_FILE} after a change event: `,
        e,
      );
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
      configVariable.value ??
      this.processEnvFallback(configVariable) ??
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
      return {
        ...redactObscured(variable),
        key: `${variable.category}.${variable.name}`,
        // Every field mirrors the DB in both directions now, config.yaml
        // and secrets.env alike (see writeYamlConfig/applyYamlToConfig and
        // writeSecretsFile/applySecretsToConfig) — nothing left that's
        // admin-panel-locked besides the `locked` fields already filtered
        // out above.
        allowEdit: true,
        // Lets the admin UI show an informational note when config.yaml
        // is actually mounted and being synced.
        mirroredToFile: !!this.yamlConfig,
        // Same idea, scoped to the obscured fields and secrets.env.
        mirroredToSecretsFile: variable.obscured && !!this.secretsFromFile,
        // The OS error from the last attempt to write this variable's
        // mirror file, or null if that attempt succeeded (or nothing is
        // mounted for it to begin with - a variable whose file isn't
        // mounted was never attempted, so it can't be failing). One of
        // yamlWriteError/secretsWriteError, never both, since a variable
        // is mirrored to exactly one of the two files.
        mirrorWriteError: variable.obscured
          ? this.secretsFromFile
            ? this.secretsWriteError
            : null
          : this.yamlConfig
            ? this.yamlWriteError
            : null,
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
    // Judged on the batch, before any of it is written, because the batch is
    // the only place the final state is visible. The admin page sends every
    // changed setting at once, so "turn the password form off and switch the
    // OIDC provider on" arrives as one request; checking key by key inside
    // the loop below would refuse it on the first half of a change that is
    // perfectly safe as a whole.
    await this.assertAdminsKeepASignInMethod(data);

    const response: Config[] = [];

    for (const variable of data) {
      response.push(await this.update(variable.key, variable.value));
    }

    return response;
  }

  /**
   * Refuses a settings change that would leave no administrator able to sign
   * in.
   *
   * Two switches on the OAuth page can do it, and neither looks dangerous.
   * `oauth.disablePassword` closes the password form for everyone at once —
   * including LDAP, which goes through the same form. `oauth.<name>-enabled`
   * turned off closes that provider's route, and a link to a switched-off
   * provider is not a way in: ProviderGuard refuses it while the account
   * page still displays the account as linked.
   *
   * Only a change that CLOSES something is examined. Opening a door can
   * never lock anyone out, and paying for a user query on every unrelated
   * settings save would be a tax on the common case.
   */
  private async assertAdminsKeepASignInMethod(
    data: { key: string; value: string | number | boolean }[],
  ) {
    const proposed = new Map(data.map((variable) => [variable.key, variable.value]));

    const touchesSignIn = [...proposed.keys()].some(
      (key) =>
        key === "oauth.disablePassword" || /^oauth\..+-enabled$/.test(key),
    );
    if (!touchesSignIn) return;

    // A proposed value wins over the stored one; anything the batch does not
    // mention keeps what it has. Values arrive as real booleans from the
    // admin API and as strings from the YAML mirror, so both are accepted.
    const resolveBoolean = (key: string) => {
      if (!proposed.has(key))
        return !!this.get(key as `${string}.${string}`);

      const value = proposed.get(key);
      return value === true || value === "true";
    };

    const passwordDisabled = resolveBoolean("oauth.disablePassword");
    const enabledProviders = this.configVariables
      .filter(
        (variable) =>
          variable.category === "oauth" && variable.name.endsWith("-enabled"),
      )
      .map((variable) => variable.name.slice(0, -"-enabled".length))
      .filter((provider) => resolveBoolean(`oauth.${provider}-enabled`));

    const admins = await this.prisma.user.findMany({
      where: { isAdmin: true },
      select: {
        password: true,
        ldapDN: true,
        oAuthUsers: { select: { provider: true } },
      },
    });

    // Nothing to strand. An instance in this state is already broken, and
    // refusing a settings change would only take away a tool for repairing
    // it.
    if (admins.length === 0) return;

    const someoneGetsIn = admins.some((admin) =>
      hasAnySignInMethod({
        hasPassword: !!admin.password,
        isLdap: !!admin.ldapDN,
        linkedProviders: admin.oAuthUsers.map((link) => link.provider),
        passwordDisabled,
        enabledProviders,
      }),
    );

    if (!someoneGetsIn)
      throw new BadRequestException(
        this.t(
          "config.wouldLockOutAdmins",
          "This change would leave no administrator able to sign in. Link a provider to an admin account, or keep password sign-in enabled.",
        ),
      );
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

    // Both no-ops unless the respective file is actually mounted — see
    // their own comments.
    await this.writeYamlConfig();
    await this.writeSecretsFile();

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
