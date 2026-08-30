export type NasEntry = {
  name: string;
  // Relative to the configured NAS import root — the value to send back
  // to browse()/preview()/commit() for this entry, not a real filesystem
  // path the client should ever construct or display raw.
  path: string;
  isDirectory: boolean;
  // null for a directory — its total size is only known after preview().
  size: number | null;
};

export type NasImportPreview = {
  fileCount: number;
  totalSize: number;
};

export type NasImportBatchResult = {
  importedThisBatch: number;
  skippedCollisions: string[];
  cursor: number | null;
  done: boolean;
};
