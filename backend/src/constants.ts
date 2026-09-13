import { LogLevel } from "@nestjs/common";

// Used to be admin-configurable (general.appName) — now a fixed constant,
// like the accent color and radius in the frontend's mantine.style.ts.
// Changing it ships through a normal build/deploy instead of the admin UI.
export const APP_NAME = "Transfer";

// Where ContactService forwards the public contact form's messages — same
// fixed-constant reasoning as APP_NAME above, not admin-configurable.
export const CONTACT_EMAIL = "transfer@majid.film";

// Baked in at image-build time from the release tag (see APP_VERSION in
// .github/workflows/docker-build-push.yml's build-args) — exposed at
// runtime via AppController's /version endpoint so the admin panel can
// show which release is actually running. Deploy-time infra like the
// constants below, not admin-editable. "dev" outside that pipeline (local
// dev, or a manual workflow_dispatch build with no release tag).
export const APP_VERSION = process.env.APP_VERSION || "dev";

// Used by AppController to check the latest GitHub release against
// APP_VERSION — a fixed constant like APP_NAME, not deploy-time infra,
// since it names this fork's own repo rather than anything environment-
// specific.
export const GITHUB_REPO = "Djoko-cli/transfer-majid-film";

// The branch a release is measured against, for the admin panel's
// "unreleased work" badge. Same fixed-constant reasoning as GITHUB_REPO
// above: this fork releases from main and nothing deploys from anywhere
// else, so it is not deploy-time infrastructure worth a config key.
export const GITHUB_DEFAULT_BRANCH = "main";

export const CONFIG_FILE = process.env.CONFIG_FILE || "../config.yaml";

// Same resolution convention as CONFIG_FILE above, deliberately a separate
// file from it — see ConfigService's envValueFor comment for why secrets
// never live in config.yaml. Read-only: ConfigService watches this one for
// hot-reload like config.yaml, but (also unlike config.yaml) never writes
// to it — see loadSecretsFile's own comment.
export const SECRETS_FILE = process.env.SECRETS_FILE || "../secrets.env";

// Root directory an admin can import existing files from (NasImportService)
// instead of uploading a duplicate copy — a deploy-time infra decision like
// CONFIG_FILE/SECRETS_FILE, not admin-editable at runtime. null (unset)
// means the feature is structurally unavailable regardless of the
// share.enableNasImport config toggle, even if that's accidentally on.
export const NAS_IMPORT_ROOT = process.env.NAS_IMPORT_ROOT || null;

// Root of majid.film's own deployed output on the same NAS (read-only
// mount) — BrandSyncService reads brand-manifest.json and assets/img/
// derived/ from here to keep BrandPanel's rotation in sync. Same
// deploy-time-infra, null-means-structurally-disabled convention as
// NAS_IMPORT_ROOT above, and for the same reason: not admin-editable at
// runtime, since it names a mount that either exists or doesn't.
export const MAJIDFILM_SOURCE_ROOT = process.env.MAJIDFILM_SOURCE_ROOT || null;

export const DATA_DIRECTORY = process.env.DATA_DIRECTORY || "./data";
export const SHARE_DIRECTORY = `${DATA_DIRECTORY}/uploads/shares`;
// Where BrandSyncService symlinks each synced (slug, still, width, format)
// image — never copied, same reasoning as NasImportService's own symlinks
// into SHARE_DIRECTORY: the real bytes stay on the read-only NAS mount,
// this directory only ever holds links into it.
export const BRAND_IMAGE_DIRECTORY = `${DATA_DIRECTORY}/brand-images`;
// Where a share's files land when clamav.infectedFileAction is
// "quarantine" instead of "delete" — moved here rather than removed, so
// an admin can inspect a false positive (or confirm a real one) before
// it's gone for good, at the cost of leaving the bytes on disk until
// someone manually clears this directory out. Same volume as
// SHARE_DIRECTORY (both resolve under DATA_DIRECTORY), which matters:
// quarantining moves rather than copies, and a same-filesystem rename is
// what makes that atomic and cheap regardless of how large the share is.
export const QUARANTINE_DIRECTORY = `${DATA_DIRECTORY}/uploads/quarantine`;
export const DATABASE_URL =
  process.env.DATABASE_URL || "file:../data/transfer.db?connection_limit=1";
export const CLAMAV_HOST =
  process.env.CLAMAV_HOST ||
  (process.env.NODE_ENV == "docker" ? "clamav" : "127.0.0.1");
export const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT) || 3310;

export const LOG_LEVEL_AVAILABLE: LogLevel[] = [
  "verbose",
  "debug",
  "log",
  "warn",
  "error",
  "fatal",
];
export const LOG_LEVEL_DEFAULT: LogLevel =
  process.env.NODE_ENV === "development" ? "verbose" : "log";
export const LOG_LEVEL_ENV = `${process.env.PV_LOG_LEVEL || ""}`;
