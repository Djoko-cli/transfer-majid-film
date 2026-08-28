export const getNormalizedFileName = (file: File): string => {
  const pathName = file.webkitRelativePath || file.name;
  return pathName.replace(/\\/g, "/").replace(/^\//, "");
};

// Mirrors the backend's CreateShareDTO `@Length(3, 30)` on `name` (see
// backend/src/share/dto/createShare.dto.ts) — that constraint only runs
// once this derived value is already on its way to the API, past the
// form's own yup validation (which only ever sees the *original*, blank
// value the user left the field at). A derived name outside these bounds
// silently 400s at submit time instead of failing anywhere visible.
const MIN_SHARE_NAME_LENGTH = 3;
const MAX_SHARE_NAME_LENGTH = 30;

// A filename cut at exactly the backend's 30-char ceiling with nothing
// marking it as cut reads as an arbitrary, broken-looking stop rather
// than an intentional shortening ("MAJID_FILM_kalou_master_v3_Pr" for
// instance). One ellipsis character (not three dots, to spend as little
// of that same 30-char budget as possible) signals the truncation
// itself, only added when truncation actually happened.
const truncateForShareName = (value: string): string =>
  value.length > MAX_SHARE_NAME_LENGTH
    ? value.slice(0, MAX_SHARE_NAME_LENGTH - 1) + "…"
    : value;

// A share left unnamed has no identity of its own — the recipient sees a
// raw random ID, and the owner can't tell it apart from any other row in
// their share list. Deriving a real name from what's actually being sent
// (rather than falling back to the ID after the fact, in every place that
// displays it) means a share is effectively never nameless in practice.
export const getDefaultShareName = (
  files: { name: string }[],
  t: (id: string, values?: Record<string, string | number>) => string,
): string => {
  if (files.length === 0) return "";
  if (files.length === 1) {
    const fullName = files[0].name.split(/[/\\]/).pop() || files[0].name;
    const lastDot = fullName.lastIndexOf(".");
    const stem = lastDot > 0 ? fullName.slice(0, lastDot) : fullName;
    // A short stem (e.g. "a.png" -> "a") would clear naming but not the
    // backend's minimum — the full filename, extension included, almost
    // always clears it instead. The generic fallback only fires for the
    // near-impossible case of a filename under 3 characters with no
    // extension at all.
    const candidate =
      stem.length >= MIN_SHARE_NAME_LENGTH
        ? stem
        : fullName.length >= MIN_SHARE_NAME_LENGTH
          ? fullName
          : null;
    return candidate
      ? truncateForShareName(candidate)
      : t("upload.transfer.name.default-generic");
  }
  return truncateForShareName(
    t("upload.transfer.name.default-multiple", {
      count: files.length,
    }),
  );
};

export const filterDuplicateFiles = <T extends File>(
  newFiles: T[],
  existingFilesList: Array<{
    name: string;
    webkitRelativePath?: string;
    deleted?: boolean;
  }>,
  onDuplicateDetected: (name: string) => void,
): T[] => {
  const existingNames = new Set(
    existingFilesList
      .filter((file) => !file.deleted)
      .map((file) => {
        const pathName = file.webkitRelativePath || file.name;
        return pathName.replace(/\\/g, "/").replace(/^\//, "");
      }),
  );

  const filtered: T[] = [];
  const seenInBatch = new Set<string>();

  for (const file of newFiles) {
    const normalizedName = getNormalizedFileName(file);
    if (existingNames.has(normalizedName) || seenInBatch.has(normalizedName)) {
      onDuplicateDetected(normalizedName);
    } else {
      seenInBatch.add(normalizedName);
      filtered.push(file);
    }
  }
  return filtered;
};
