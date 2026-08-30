import { LogLevel } from "@nestjs/common";

// Used to be admin-configurable (general.appName) — now a fixed constant,
// like the accent color and radius in the frontend's mantine.style.ts.
// Changing it ships through a normal build/deploy instead of the admin UI.
export const APP_NAME = "Transfer";

export const CONFIG_FILE = process.env.CONFIG_FILE || "../config.yaml";

// Same resolution convention as CONFIG_FILE above, deliberately a separate
// file from it — see ConfigService's envValueFor comment for why secrets
// never live in config.yaml. Read-only: ConfigService watches this one for
// hot-reload like config.yaml, but (also unlike config.yaml) never writes
// to it — see loadSecretsFile's own comment.
export const SECRETS_FILE = process.env.SECRETS_FILE || "../secrets.env";

export const DATA_DIRECTORY = process.env.DATA_DIRECTORY || "./data";
export const SHARE_DIRECTORY = `${DATA_DIRECTORY}/uploads/shares`;
export const DATABASE_URL =
  process.env.DATABASE_URL || "file:../data/transfer.db?connection_limit=1";
export const CLAMAV_HOST =
  process.env.CLAMAV_HOST ||
  (process.env.NODE_ENV == "docker" ? "clamav" : "127.0.0.1");
export const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT) || 3310;

export const LOG_LEVEL_AVAILABLE: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
export const LOG_LEVEL_DEFAULT: LogLevel = process.env.NODE_ENV === 'development' ? "verbose" : "log";
export const LOG_LEVEL_ENV = `${process.env.PV_LOG_LEVEL || ""}`;