// Minimal ambient types for the File System Access API — not part of
// TypeScript's bundled lib.dom.d.ts as of this project's TS version.
// Only the small subset DownloadAllButton.tsx actually uses (save a
// stream straight to a user-picked file, without ever buffering it whole
// in page memory) — not the full spec surface (directory access, read
// permissions queries, etc.), which this app has no use for.
// Support: Chromium-based browsers only (Chrome, Edge, Opera, ...) as of
// this writing — never shipped in Safari or Firefox. Always feature-
// detect ("showSaveFilePicker" in window) before calling any of this.

interface FileSystemWritableFileStream extends WritableStream {
  // Spelled out as ArrayBufferView | ArrayBuffer rather than the DOM lib's
  // own BufferSource alias: BufferSource is a type-only name with no
  // runtime counterpart, which this project's ESLint config (no-undef,
  // unaware of TS type space) flags as an undefined global in a .d.ts file.
  // ArrayBufferView/ArrayBuffer are real runtime globals too, so they don't
  // hit the same false positive — and a Uint8Array chunk (what this file's
  // only caller actually passes) satisfies ArrayBufferView either way.
  write(data: ArrayBufferView | ArrayBuffer | Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: SaveFilePickerAcceptType[];
}

interface Window {
  showSaveFilePicker?(
    options?: SaveFilePickerOptions,
  ): Promise<FileSystemFileHandle>;
}
