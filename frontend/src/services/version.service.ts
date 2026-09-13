import api from "./api.service";

export type VersionInfo = {
  version: string;
  latest: string | null;
  upToDate: boolean | null;
  // Commits on the default branch that the newest release does not contain.
  // null whenever the lookup could not run or did not apply — never 0 as a
  // stand-in for "unknown", since 0 is a real and meaningful answer here.
  drift: number | null;
};

const get = async (): Promise<VersionInfo> => {
  return (await api.get("/version")).data;
};

export default { get };
