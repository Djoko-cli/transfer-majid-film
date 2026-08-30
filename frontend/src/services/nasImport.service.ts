import {
  NasEntry,
  NasImportBatchResult,
  NasImportPreview,
} from "../types/nasImport.type";
import api from "./api.service";

const browse = async (path: string): Promise<NasEntry[]> => {
  return (await api.get("admin/nas-import/browse", { params: { path } })).data;
};

const preview = async (paths: string[]): Promise<NasImportPreview> => {
  return (await api.post("admin/nas-import/preview", { paths })).data;
};

const commit = async (
  shareId: string,
  paths: string[],
  cursor?: number,
): Promise<NasImportBatchResult> => {
  return (
    await api.post(`shares/${shareId}/nas-import`, { paths, cursor })
  ).data;
};

export default { browse, preview, commit };
