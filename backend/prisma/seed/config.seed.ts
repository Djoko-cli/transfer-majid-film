import { Prisma, PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// The three legal pages' real content lives as plain .md files at the repo
// root (mentionslegales.md, conditionsutilisation.md,
// politiqueconfidentialite.md) rather than as string literals in here -
// one source of truth, editable directly, diffable in its own right.
// Baked in as defaultValue (not value): migrateConfigVariables() below
// always overwrites defaultValue from this file but explicitly preserves
// whatever's already in the DB's own `value` column (see its own
// comment) - so this can never clobber a change made through the admin
// panel's own Markdown editor, it only supplies what a fresh install (or
// a since-cleared field) falls back to.
//
// __dirname resolves differently in dev (ts-node running prisma/seed/
// config.seed.ts straight from source, three levels below the repo root)
// than in the built image (dist/prisma/seed/config.seed.js, three levels
// below /opt/app/backend, with the .md files copied to /opt/app/backend/
// legal instead — see the Dockerfile) - same existsSync-first-then-
// fall-back-to-source idiom already used for i18nPath in app.module.ts,
// for the same reason (one compiled path, one dev path, no way to know
// which without checking).
const legalContentDir = fs.existsSync(path.join(__dirname, "../../../legal"))
  ? path.join(__dirname, "../../../legal")
  : path.join(__dirname, "../../..");

// Missing/unreadable is a real possibility worth tolerating rather than
// crashing the whole seed over (a checkout without the .md files, a typo
// in a future rename) - falls back to "" as the field already had before
// this, exactly as if this whole mechanism didn't exist.
function readLegalMarkdown(filename: string): string {
  try {
    return fs
      .readFileSync(path.join(legalContentDir, filename), "utf8")
      .trimEnd();
  } catch (e) {
    console.warn(`Could not read ${filename} for legal.* defaults:`, e.message);
    return "";
  }
}

export const configVariables = {
  internal: {
    jwtSecret: {
      type: "string",
      value: crypto.randomBytes(256).toString("base64"),
      locked: true,
    },
  },
  general: {
    appUrl: {
      type: "string",
      defaultValue: "http://localhost:3000",
      secret: false,
    },
    secureCookies: {
      type: "boolean",
      defaultValue: "false",
    },
    sessionDuration: {
      type: "timespan",
      defaultValue: "3 months",
      secret: false,
    },
    defaultLanguage: {
      type: "string",
      defaultValue: "fr-FR",
      secret: false,
    },
    // Fine-grained GitHub PAT, read-only, scoped to just this repo's
    // Releases — lets AppController's /version endpoint tell the admin
    // panel whether the running build is the latest release. The repo is
    // private, so an unauthenticated check would always 404; the badge
    // simply doesn't render (see AppController.getLatestRelease) until
    // this is set.
    versionCheckToken: {
      type: "string",
      defaultValue: "",
      secret: true,
      obscured: true,
    },
  },
  share: {
    allowRegistration: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    allowUnauthenticatedShares: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    requireEmailVerificationForAnonymousShares: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    maxExpiration: {
      type: "timespan",
      defaultValue: "30 days",
      secret: false,
    },
    defaultExpiration: {
      type: "timespan",
      defaultValue: "3 days",
      secret: false,
    },
    shareIdLength: {
      type: "number",
      defaultValue: "8",
      secret: false,
    },
    maxSize: {
      type: "filesize",
      defaultValue: "15000000000",
      secret: false,
    },
    zipCompressionLevel: {
      type: "number",
      defaultValue: "9",
    },
    chunkSize: {
      type: "filesize",
      defaultValue: "10000000",
      secret: false,
    },
    allowAdminAccessAllShares: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    enableUserRecipients: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    // Gates ReverseShareService.create() only — existing links (and their
    // albums, contributions, archive and expiry) keep working regardless.
    // True by default: the feature already exists and runs, so shipping it
    // off would surprise anyone already using it.
    enableReverseShares: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    // Lets an admin create a share from files already on the NAS
    // (NasImportService) instead of uploading a duplicate copy — see
    // NAS_IMPORT_ROOT in constants.ts, which must also be set (a mounted
    // directory) for this to actually do anything even when true.
    enableNasImport: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    // Gates ThumbnailService.generate() — see thumbnail.service.ts. On by
    // default; an instance without ffmpeg installed just gets every video
    // file's thumbnailStatus stuck at "failed"/"unsupported", same
    // fail-open shape as every other best-effort toggle in this category.
    enableVideoThumbnails: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    // Gates the HTTP Range handling in LocalFileService.get() — see
    // range.util.ts. Off reverts a local video/audio file to always
    // streaming from byte 0 (no 206, no seeking in the inline preview
    // player), same "instant full revert" shape as every other toggle
    // here. Doesn't affect S3 shares, which already get Range for free
    // from S3 itself regardless of this setting.
    enableVideoRangeRequests: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    fileRetentionPeriod: {
      type: "timespan",
      defaultValue: "0 days",
      secret: false,
    },
  },
  // Deliberately its own tiny category rather than folded into `share` —
  // not surfaced on the generic /admin/config/[category] settings page at
  // all (that page and config.service.ts's own frontend both hardcode
  // their own category allowlists; adding a whole settings page for one
  // toggle isn't worth it). useConfig().get("brand.enableSync") already
  // works with zero extra wiring via the generic, unfiltered config list
  // every page already receives — the switch itself lives directly on
  // pages/admin/brand.tsx, next to the "Sync now" button, a more
  // discoverable spot for it than a settings page anyway.
  brand: {
    // Gates BrandSyncService's actual sync/write path only (cron + the
    // manual admin trigger) — see MAJIDFILM_SOURCE_ROOT in constants.ts
    // for the paired deploy-time gate. Already-synced catalog/image data
    // keeps serving regardless of this flag's later value.
    enableSync: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
  },
  // Settings that trade a visual detail against frame rate on the devices
  // that cannot afford it. Public (secret: false) because the surfaces they
  // govern are public — the upload card and the sign-in card are rendered
  // for signed-out visitors, so the value has to reach them.
  performance: {
    // Stands the card's glint ring down while the card is changing height —
    // in practice while "Advanced options" opens or closes. Measured on an
    // iPhone 14 Pro against the real app, interleaved rounds, the animating
    // area verified on screen: 36ms between painted frames with the ring
    // left alone, 17ms with it stood down. See GlintBorder.tsx for why the
    // mechanism is the resize rather than the sweep.
    //
    // On by default, and a toggle rather than a fixed choice because it is
    // not free: the comet visibly leaves and comes back across the
    // disclosure. That is a fair trade on a phone and an unnecessary one on
    // a machine that was holding 60fps anyway, so it is left to whoever
    // runs the instance.
    pauseGlintOnCardResize: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
  },
  verification: {
    // The only thing worth deciding about a one-time code: how long it
    // lives. Read in two places that must never disagree —
    // VerificationService stamps expiresAt from it, and the email prints it
    // as {expires} — so the sentence cannot outlive the setting. It used to
    // be a constant of 10 alongside copy that said "10 minutes" in its own
    // words, which is two truths waiting to diverge.
    codeExpiration: {
      type: "timespan",
      defaultValue: "10 minutes",
      secret: false,
    },
  },
  clamav: {
    enabled: {
      type: "boolean",
      defaultValue: "true",
    },
    // "delete" preserves the exact behavior this app always had, for
    // anyone who never visits this setting. "quarantine" moves the
    // share's files aside (see QUARANTINE_DIRECTORY) instead of removing
    // them, so a false positive can still be recovered — at the cost of
    // an admin needing to clear that directory out themselves over time.
    // "none" takes no action at all: the share stays exactly as uploaded,
    // fully accessible — only the scan history and server log record the
    // detection (see ClamScanService.checkAndRemove).
    infectedFileAction: {
      type: "string",
      defaultValue: "delete",
    },
  },
  cache: {
    "redis-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "redis-url": {
      type: "string",
      defaultValue: "redis://redis:6379",
      secret: true,
      obscured: true,
    },
    ttl: {
      type: "number",
      defaultValue: "60",
    },
    maxItems: {
      type: "number",
      defaultValue: "1000",
    },
  },
  email: {
    sendHtmlEmails: {
      type: "boolean",
      defaultValue: "false",
    },
    enableShareEmailRecipients: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    enableShareDownloadNotifications: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    enableNewAccountNotifications: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    // Reminds the owner (signed-in creator or anonymous senderEmail) of a
    // share that's about to expire — see JobsService.notifyExpiringSenders.
    // Per-user opt-out for a registered creator lives on User itself
    // (account.notifications), not here — this only gates the feature
    // globally.
    enableExpiringSenderNotification: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    expiringSenderNotificationWindow: {
      type: "timespan",
      defaultValue: "24 hours",
      secret: false,
    },
    // Same idea, for a named Email-mode recipient who hasn't downloaded
    // yet — see JobsService.notifyExpiringRecipients. No per-user
    // opt-out: most recipients are plain email addresses with no account
    // at all, same reasoning as shareRecipientsMessage having none either.
    enableExpiringRecipientNotification: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    expiringRecipientNotificationWindow: {
      type: "timespan",
      defaultValue: "24 hours",
      secret: false,
    },
    enableEmailVerification: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
  },
  smtp: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    allowUnauthorizedCertificates: {
      type: "boolean",
      defaultValue: "false",

      secret: false,
    },
    host: {
      type: "string",
      defaultValue: "",
    },
    port: {
      type: "number",
      defaultValue: "0",
    },
    email: {
      type: "string",
      defaultValue: "",
    },
    username: {
      type: "string",
      defaultValue: "",
    },
    password: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
  },
  ldap: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },

    url: {
      type: "string",
      defaultValue: "",
    },

    bindDn: {
      type: "string",
      defaultValue: "",
    },
    bindPassword: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },

    searchBase: {
      type: "string",
      defaultValue: "",
    },
    searchQuery: {
      type: "string",
      defaultValue: "",
    },

    adminGroups: {
      type: "string",
      defaultValue: "",
    },

    fieldNameMemberOf: {
      type: "string",
      defaultValue: "memberOf",
    },
    fieldNameEmail: {
      type: "string",
      defaultValue: "userPrincipalName",
    },
  },
  oauth: {
    allowRegistration: {
      type: "boolean",
      defaultValue: "true",
    },
    ignoreTotp: {
      type: "boolean",
      defaultValue: "true",
    },
    disablePassword: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    "github-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "github-clientId": {
      type: "string",
      defaultValue: "",
    },
    "github-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "google-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "google-clientId": {
      type: "string",
      defaultValue: "",
    },
    "google-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "microsoft-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "microsoft-tenant": {
      type: "string",
      defaultValue: "common",
    },
    "microsoft-clientId": {
      type: "string",
      defaultValue: "",
    },
    "microsoft-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "discord-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "discord-limitedGuild": {
      type: "string",
      defaultValue: "",
    },
    "discord-limitedUsers": {
      type: "string",
      defaultValue: "",
    },
    "discord-clientId": {
      type: "string",
      defaultValue: "",
    },
    "discord-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "oidc-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "oidc-discoveryUri": {
      type: "string",
      defaultValue: "",
    },
    // Optional escape hatch: Pocket ID (and possibly other providers) has
    // no sign-up option on its OIDC *authorization* screen even once its
    // own login page offers one - confirmed by reading its source, the
    // unauthenticated /authorize redirect lands on /interaction, a
    // component with only a sign-in button, never on /login (which does
    // conditionally render "Sign up"). When set, SignUpForm's "Sign up
    // with OpenID" button links straight to this URL (the provider's own
    // sign-up page) instead of through the normal /api/oauth/auth/oidc
    // flow; blank (default) keeps today's behavior for providers where
    // that flow already handles sign-up fine.
    // secret: false (like disablePassword above) - SignUpForm reads this
    // through the generic public /configs list, same as every other
    // config useConfig() exposes to a signed-out visitor; it's just a URL,
    // nothing sensitive about it being world-readable.
    "oidc-signUpUrl": {
      type: "string",
      defaultValue: "",
      secret: false,
    },
    // True by default: without it, "Se déconnecter" only ever clears
    // Transfer's own session, never the identity provider's - anyone
    // else using the same browser afterward inherits whatever OIDC
    // session is still active there instead of getting a real sign-in
    // screen of their own (see AuthService.signOut's own end_session_endpoint
    // redirect for the actual single-logout mechanics this enables).
    // migrateConfigVariables() only ever overwrites defaultValue, never
    // an admin-set value, so this is safe to flip without touching any
    // instance that already has its own explicit choice here.
    "oidc-signOut": {
      type: "boolean",
      defaultValue: "true",
    },
    "oidc-scope": {
      type: "string",
      defaultValue: "openid email profile",
    },
    "oidc-usernameClaim": {
      type: "string",
      defaultValue: "",
    },
    "oidc-rolePath": {
      type: "string",
      defaultValue: "",
    },
    "oidc-roleGeneralAccess": {
      type: "string",
      defaultValue: "",
    },
    "oidc-roleAdminAccess": {
      type: "string",
      defaultValue: "",
    },
    "oidc-clientId": {
      type: "string",
      defaultValue: "",
    },
    "oidc-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
  },
  s3: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
    },
    endpoint: {
      type: "string",
      defaultValue: "",
    },
    region: {
      type: "string",
      defaultValue: "",
    },
    bucketName: {
      type: "string",
      defaultValue: "",
    },
    bucketPath: {
      type: "string",
      defaultValue: "",
    },
    key: {
      type: "string",
      defaultValue: "",
      secret: true,
      obscured: true,
    },
    secret: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    useChecksum: {
      type: "boolean",
      defaultValue: "true",
    },
  },
  legal: {
    // Defaults to on now that there's real content to show by default
    // (see readLegalMarkdown above) - an instance with working legal
    // pages baked in has no reason to also ship them switched off,
    // unlike when this only ever defaulted to three empty text fields.
    enabled: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    imprintText: {
      type: "text",
      defaultValue: readLegalMarkdown("mentionslegales.md"),
      secret: false,
    },
    termsText: {
      type: "text",
      defaultValue: readLegalMarkdown("conditionsutilisation.md"),
      secret: false,
    },
    privacyPolicyText: {
      type: "text",
      defaultValue: readLegalMarkdown("politiqueconfidentialite.md"),
      secret: false,
    },
  },
} satisfies ConfigVariables;

export type YamlConfig = {
  [Category in keyof typeof configVariables]: {
    [Key in keyof (typeof configVariables)[Category]]: string;
  };
} & {
  initUser: {
    enabled: string;
    username: string;
    email: string;
    password: string;
    isAdmin: boolean;
    ldapDN: string;
  };
};

type ConfigVariables = {
  [category: string]: {
    [variable: string]: Omit<
      Prisma.ConfigCreateInput,
      "name" | "category" | "order"
    >;
  };
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "file:../data/transfer.db?connection_limit=1",
    },
  },
});

async function seedConfigVariables() {
  for (const [category, configVariablesOfCategory] of Object.entries(
    configVariables,
  )) {
    let order = 0;
    for (const [name, properties] of Object.entries(
      configVariablesOfCategory,
    )) {
      const existingConfigVariable = await prisma.config.findUnique({
        where: { name_category: { name, category } },
      });

      // Create a new config variable if it doesn't exist
      if (!existingConfigVariable) {
        await prisma.config.create({
          data: {
            order,
            name,
            ...properties,
            category,
          },
        });
      }
      order++;
    }
  }
}

async function migrateConfigVariables() {
  const existingConfigVariables = await prisma.config.findMany();
  const orderMap: { [category: string]: number } = {};

  for (const existingConfigVariable of existingConfigVariables) {
    const configVariable =
      configVariables[existingConfigVariable.category]?.[
        existingConfigVariable.name
      ];

    // Delete the config variable if it doesn't exist in the seed
    if (!configVariable) {
      await prisma.config.delete({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
      });

      // Update the config variable if it exists in the seed
    } else {
      const variableOrder = Object.keys(
        configVariables[existingConfigVariable.category],
      ).indexOf(existingConfigVariable.name);
      await prisma.config.update({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
        data: {
          ...configVariable,
          name: existingConfigVariable.name,
          category: existingConfigVariable.category,
          value: existingConfigVariable.value,
          order: variableOrder,
        },
      });
      orderMap[existingConfigVariable.category] = variableOrder + 1;
    }
  }
}

seedConfigVariables()
  .then(() => migrateConfigVariables())
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
