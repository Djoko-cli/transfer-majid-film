export type FileUpload = File & { uploadingProgress: number };

export type FileUploadResponse = { id: string; name: string };

export type FileMetaData = {
  id: string;
  name: string;
  size: string;
  thumbnailStatus?: string | null;
  // Which contribution this file arrived with — undefined for a share
  // that isn't a collection, null for a file a collection's own owner
  // added through the plain upload route (see share.type.ts's
  // ShareCollection comment). FileList groups by this when present.
  contributionId?: string | null;
};

export type FileListItem = FileUpload | (FileMetaData & { deleted?: boolean });
