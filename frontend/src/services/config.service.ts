import Config, { AdminConfig, UpdateConfig } from "../types/config.type";
import api from "./api.service";
import { stringToTimespan } from "../utils/date.util";

const categories = [
  "general",
  "email",
  "share",
  "verification",
  "smtp",
  "oauth",
  "ldap",
  "s3",
  "legal",
  "cache",
  "clamav",
];

const list = async (): Promise<Config[]> => {
  return (await api.get("/configs")).data;
};

const getByCategory = async (categoryInput: string): Promise<AdminConfig[]> => {
  let category: string;
  if (categories.indexOf(categoryInput.trim()) === -1) {
    category = "general";
  } else {
    category = categoryInput.trim();
  }

  return (await api.get(`/configs/admin/${category}`)).data;
};

const updateMany = async (data: UpdateConfig[]): Promise<AdminConfig[]> => {
  return (await api.patch("/configs/admin", data)).data;
};

const get = (
  key: string,
  configVariables: Config[],
  returnDefault: boolean = false,
): any => {
  if (!configVariables) return null;

  const configVariable = configVariables.filter(
    (variable) => variable.key == key,
  )[0];

  if (!configVariable) throw new Error(`Config variable ${key} not found`);

  const value = returnDefault
    ? configVariable.defaultValue
    : (configVariable.value ?? configVariable.defaultValue);

  if (configVariable.type == "number" || configVariable.type == "filesize")
    return parseInt(value);
  if (configVariable.type == "boolean") return value == "true";
  if (configVariable.type == "string" || configVariable.type == "text")
    return value;
  if (configVariable.type == "timespan") return stringToTimespan(value);
};

const finishSetup = async (): Promise<AdminConfig[]> => {
  return (await api.post("/configs/admin/finishSetup")).data;
};

const sendTestEmail = async (email: string) => {
  await api.post("/configs/admin/testEmail", { email });
};

const testRedisConnection = async () => {
  return (await api.post("/configs/admin/testRedis")).data as {
    ok: boolean;
    enabled: boolean;
  };
};

const getClamavStatus = async (): Promise<{
  enabled: boolean;
  connected: boolean;
  version: string | null;
  engineVersion: string | null;
  database: { revision: number; builtAt: string } | null;
}> => {
  return (await api.get("/configs/admin/clamav/status")).data;
};

export type ClamavScan = {
  id: string;
  createdAt: string;
  shareId: string | null;
  shareName: string | null;
  status: "clean" | "infected" | "error";
  fileCount: number;
  infectedCount: number;
  infectedFileNames: string | null;
  errorMessage: string | null;
  // Matches clamav.infectedFileAction's own values ("delete"/"quarantine"/
  // "none") exactly — this is that config's value at the time THIS scan
  // ran, not necessarily what it's set to now.
  action: "delete" | "quarantine" | "none" | null;
};

const getClamavScans = async (
  take: number,
  skip: number,
): Promise<{ scans: ClamavScan[]; total: number }> => {
  return (
    await api.get("/configs/admin/clamav/scans", { params: { take, skip } })
  ).data;
};

export default {
  list,
  getByCategory,
  updateMany,
  get,
  finishSetup,
  sendTestEmail,
  testRedisConnection,
  getClamavStatus,
  getClamavScans,
};
