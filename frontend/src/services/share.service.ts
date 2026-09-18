import mime from "mime-types";
import axios from "axios";
import { translateOutsideContext } from "../hooks/useTranslate.hook";
import { FileUploadResponse } from "../types/File.type";
import {
  CreateShare,
  MyReverseShare,
  MyShare,
  Share,
  ShareDownload,
  ShareMetaData,
  UpdateShare,
} from "../types/share.type";
import api from "./api.service";

const isValidId = (id: string) => {
  return /^[a-zA-Z0-9_-]+$/.test(id);
};

const list = async (): Promise<MyShare[]> => {
  return (await api.get(`shares/all`)).data;
};

const create = async (share: CreateShare) => {
  return (await api.post("shares", share)).data;
};

const completeShare = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.post(`shares/${id}/complete`)).data;
};

const revertComplete = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.delete(`shares/${id}/complete`)).data;
};

const get = async (id: string): Promise<Share> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}`)).data;
};

const getFromOwner = async (id: string): Promise<Share> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}/from-owner`)).data;
};

const getMetaData = async (id: string): Promise<ShareMetaData> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}/metaData`)).data;
};

const getDownloads = async (id: string): Promise<ShareDownload[]> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}/downloads`)).data;
};

const remove = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.delete(`shares/${id}`);
};

const update = async (id: string, share: UpdateShare): Promise<MyShare> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.patch(`shares/${id}`, share)).data;
};

const expire = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.post(`shares/${id}/expire`);
};

const getMyShares = async (): Promise<MyShare[]> => {
  return (await api.get("shares")).data;
};

const getReceivedShares = async (): Promise<any[]> => {
  return (await api.get("shares/received")).data;
};

const getShareToken = async (id: string, password?: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.post(`/shares/${id}/token`, { password });
};

const isShareIdAvailable = async (id: string): Promise<boolean> => {
  if (!isValidId(id)) throw new Error("Invalid Share ID");
  return (await api.get(`/shares/isShareIdAvailable/${id}`)).data.isAvailable;
};

const doesFileSupportPreview = (fileName: string) => {
  const mimeType = (mime.contentType(fileName) || "").split(";")[0];

  if (!mimeType) return false;

  const supportedMimeTypes = [
    mimeType.startsWith("video/"),
    mimeType.startsWith("image/"),
    mimeType.startsWith("audio/"),
    mimeType.startsWith("text/"),
    mimeType == "application/pdf",
  ];

  return supportedMimeTypes.some((isSupported) => isSupported);
};

const isShareTextFile = (fileName: string) => {
  const mimeType = (mime.contentType(fileName) || "").split(";")[0];

  if (!mimeType) return false;

  return mimeType.startsWith("text/");
};

// Shared by downloadFile below (plain navigation) and
// DownloadAllButton's own streaming path (a fetch() to this same URL) —
// one place computing the URL either one actually downloads.
const getFileUrl = (shareId: string, fileId: string, recipientId?: string) => {
  const recipientQuery = recipientId
    ? `?recipient=${encodeURIComponent(recipientId)}`
    : "";
  return `${window.location.origin}/api/shares/${shareId}/files/${fileId}${recipientQuery}`;
};

const downloadFile = async (
  shareId: string,
  fileId: string,
  recipientId?: string,
) => {
  window.location.href = getFileUrl(shareId, fileId, recipientId);
};

const getThumbnailUrl = (
  shareId: string,
  fileId: string,
  recipientId?: string,
) => {
  const recipientQuery = recipientId
    ? `?recipient=${encodeURIComponent(recipientId)}`
    : "";
  return `${window.location.origin}/api/shares/${shareId}/files/${fileId}/thumbnail${recipientQuery}`;
};

const removeFile = async (shareId: string, fileId: string) => {
  if (!isValidId(shareId)) throw new Error("Invalid Share ID");
  await api.delete(`shares/${shareId}/files/${fileId}`);
};

interface S3UploadSession {
  uploadId: string;
  urls: string[];
  parts: Array<{ ETag: string; PartNumber: number }>;
  fileId: string;
}

const s3UploadSessions: Record<string, S3UploadSession> = {};
const s3UploadSupportedShares: Record<string, boolean> = {};

const uploadFileDirectS3 = async (
  shareId: string,
  chunk: Blob,
  file: { id?: string; name: string },
  chunkIndex: number,
  totalChunks: number,
  onUploadProgress?: (progressEvent: any) => void,
): Promise<FileUploadResponse> => {
  const sessionKey = `${shareId}:${file.id || file.name}`;

  try {
    if (chunkIndex === 0 && !s3UploadSessions[sessionKey]) {
      const initResponse = await api.post(
        `shares/${shareId}/files/upload-init`,
        {
          id: file.id,
          name: file.name,
          totalChunks,
        },
      );

      s3UploadSessions[sessionKey] = {
        uploadId: initResponse.data.uploadId,
        urls: initResponse.data.urls,
        parts: [],
        fileId: file.id || "",
      };
    }

    const session = s3UploadSessions[sessionKey];
    if (!session) {
      throw new Error(
        translateOutsideContext()(
          "upload.modal.link.error.s3-session-not-found",
        ),
      );
    }

    const url = session.urls[chunkIndex];
    const response = await axios.put(url, chunk, {
      headers: { "Content-Type": "application/octet-stream" },
      onUploadProgress,
    });

    const etag = response.headers["etag"];
    if (!etag) {
      throw new Error(
        translateOutsideContext()("upload.modal.link.error.s3-etag-missing"),
      );
    }

    session.parts.push({
      ETag: etag,
      PartNumber: chunkIndex + 1,
    });

    if (chunkIndex === totalChunks - 1) {
      const completeResponse = await api.post(
        `shares/${shareId}/files/upload-complete`,
        {
          id: session.fileId || undefined,
          name: file.name,
          uploadId: session.uploadId,
          parts: session.parts,
        },
      );
      delete s3UploadSessions[sessionKey];
      return completeResponse.data;
    }

    return {
      id: session.fileId || "s3-upload-in-progress",
    } as FileUploadResponse;
  } catch (error) {
    const session = s3UploadSessions[sessionKey];
    if (session) {
      try {
        await api.post(`shares/${shareId}/files/upload-abort`, {
          name: file.name,
          uploadId: session.uploadId,
        });
      } catch (abortError) {
        console.error("Failed to abort multipart S3 upload:", abortError);
      }
      delete s3UploadSessions[sessionKey];
    }
    throw error;
  }
};

const uploadFileProxied = async (
  shareId: string,
  chunk: Blob,
  file: { id?: string; name: string },
  chunkIndex: number,
  totalChunks: number,
  onUploadProgress?: (progressEvent: any) => void,
): Promise<FileUploadResponse> => {
  return (
    await api.post(`shares/${shareId}/files`, chunk, {
      headers: { "Content-Type": "application/octet-stream" },
      params: {
        id: file.id,
        name: file.name,
        chunkIndex,
        totalChunks,
      },
      onUploadProgress,
    })
  ).data;
};

const uploadFile = async (
  shareId: string,
  chunk: Blob,
  file: {
    id?: string;
    name: string;
  },
  chunkIndex: number,
  totalChunks: number,
  onUploadProgress?: (progressEvent: any) => void,
): Promise<FileUploadResponse> => {
  if (!isValidId(shareId))
    throw new Error(
      translateOutsideContext()("upload.modal.link.error.invalid"),
    );

  const sessionKey = `${shareId}:${file.id || file.name}`;

  if (s3UploadSessions[sessionKey]) {
    return uploadFileDirectS3(
      shareId,
      chunk,
      file,
      chunkIndex,
      totalChunks,
      onUploadProgress,
    );
  }

  if (s3UploadSupportedShares[shareId] === false) {
    return uploadFileProxied(
      shareId,
      chunk,
      file,
      chunkIndex,
      totalChunks,
      onUploadProgress,
    );
  }

  if (chunkIndex === 0) {
    try {
      const initResponse = await api.post(
        `shares/${shareId}/files/upload-init`,
        {
          id: file.id,
          name: file.name,
          totalChunks,
        },
      );

      if (initResponse.data && initResponse.data.directToS3) {
        s3UploadSupportedShares[shareId] = true;
        s3UploadSessions[sessionKey] = {
          uploadId: initResponse.data.uploadId,
          urls: initResponse.data.urls,
          parts: [],
          fileId: file.id || "",
        };
        return uploadFileDirectS3(
          shareId,
          chunk,
          file,
          chunkIndex,
          totalChunks,
          onUploadProgress,
        );
      } else {
        s3UploadSupportedShares[shareId] = false;
      }
    } catch (err) {
      console.warn(
        "Direct S3 upload init failed. Falling back to proxied upload.",
        err,
      );
      s3UploadSupportedShares[shareId] = false;
    }
  }

  return uploadFileProxied(
    shareId,
    chunk,
    file,
    chunkIndex,
    totalChunks,
    onUploadProgress,
  );
};

// Opens a contribution against a collection — POST /shares/:id/contributions
// (task 3). Identity is never sent here: the guard behind this route reads
// it off the session (a signed-in account) or off the verification cookie
// a prior verify-code call already set, exactly like ShareService.create()
// for an anonymous sender. `name` is the only thing this call actually
// carries.
const openContribution = async (
  shareId: string,
  name?: string,
): Promise<{ id: string }> => {
  if (!isValidId(shareId)) throw new Error("Invalid ID");
  return (await api.post(`shares/${shareId}/contributions`, { name })).data;
};

// The chunked-upload counterpart of uploadFile above, aimed at a
// contribution instead of a plain share. Deliberately not folded into
// uploadFile itself: the contribution route (task 3) has no S3-direct-
// upload variant, so this only ever needs uploadFileProxied's shape, not
// the fallback/session bookkeeping uploadFile carries for the plain path.
const uploadContributionFile = async (
  shareId: string,
  contributionId: string,
  chunk: Blob,
  file: { id?: string; name: string },
  chunkIndex: number,
  totalChunks: number,
  onUploadProgress?: (progressEvent: any) => void,
): Promise<FileUploadResponse> => {
  if (!isValidId(shareId) || !isValidId(contributionId))
    throw new Error("Invalid ID");
  return (
    await api.post(
      `shares/${shareId}/contributions/${contributionId}/files`,
      chunk,
      {
        headers: { "Content-Type": "application/octet-stream" },
        params: {
          id: file.id,
          name: file.name,
          chunkIndex,
          totalChunks,
        },
        onUploadProgress,
      },
    )
  ).data;
};

const completeContribution = async (
  shareId: string,
  contributionId: string,
) => {
  if (!isValidId(shareId) || !isValidId(contributionId))
    throw new Error("Invalid ID");
  return (
    await api.post(
      `shares/${shareId}/contributions/${contributionId}/complete`,
    )
  ).data;
};

const isReverseShareTokenAvailable = async (
  token: string,
): Promise<boolean> => {
  if (!isValidId(token))
    throw new Error(
      translateOutsideContext()("upload.modal.link.error.invalid"),
    );
  return (await api.get(`/reverseShares/isReverseShareTokenAvailable/${token}`))
    .data.isAvailable;
};

const createReverseShare = async (
  shareExpiration: string,
  maxShareSize: number,
  maxUseCount: number,
  sendEmailNotification: boolean,
  publicAccess: boolean,
  token?: string,
  name?: string,
  description?: string,
  password?: string,
  maxViews?: number,
) => {
  return (
    await api.post("reverseShares", {
      shareExpiration,
      maxShareSize: maxShareSize.toString(),
      maxUseCount,
      sendEmailNotification,
      publicAccess,
      token,
      name,
      description,
      password,
      maxViews,
    })
  ).data;
};

const getMyReverseShares = async (): Promise<MyReverseShare[]> => {
  return (await api.get("reverseShares")).data;
};

const removeReverseShare = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.delete(`/reverseShares/${id}`);
};

export default {
  list,
  create,
  completeShare,
  revertComplete,
  getShareToken,
  get,
  getFromOwner,
  update,
  remove,
  expire,
  getMetaData,
  getDownloads,
  doesFileSupportPreview,
  isShareTextFile,
  getMyShares,
  getReceivedShares,
  isShareIdAvailable,
  isReverseShareTokenAvailable,
  downloadFile,
  getFileUrl,
  getThumbnailUrl,
  removeFile,
  uploadFile,
  openContribution,
  uploadContributionFile,
  completeContribution,
  createReverseShare,
  getMyReverseShares,
  removeReverseShare,
};
