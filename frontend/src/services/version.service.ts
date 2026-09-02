import api from "./api.service";

export type VersionInfo = {
  version: string;
  latest: string | null;
  upToDate: boolean | null;
};

const get = async (): Promise<VersionInfo> => {
  return (await api.get("/version")).data;
};

export default { get };
