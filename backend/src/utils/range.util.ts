// Deliberately narrow: resolves only a single "bytes=<start>-<end>" /
// "bytes=<start>-" / "bytes=-<suffixLength>" request. Everything else
// (missing header, malformed syntax, a multi-range request like
// "bytes=0-99,200-299", or a genuinely out-of-bounds range: start >=
// fileSize, or end < start) returns null, meaning "serve the whole file as
// a normal 200." A server MAY ignore a Range header per RFC 7233 — full 416
// semantics would be real added complexity for a case no real browser
// triggers against this endpoint.
//
// `end` is inclusive on both sides this value touches — HTTP
// Range/Content-Range semantics and Node's fs.createReadStream(path,
// {start, end}) option are both inclusive-of-end — so it passes straight
// through with no off-by-one translation at either call site. A requested
// end past the real file size is clamped to fileSize-1 rather than
// rejected (browsers commonly send an oversized end when they don't know
// the exact size yet — normal, not an error).
export function parseRangeHeader(
  header: string | undefined,
  fileSize: number,
): { start: number; end: number } | null {
  if (!header || !header.startsWith("bytes=")) return null;

  const value = header.slice("bytes=".length);
  // A comma means a multi-range request — out of scope, fall back to 200.
  if (value.includes(",")) return null;

  const match = /^(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;

  let start: number;
  let end: number;

  if (startStr === "") {
    // Suffix range: "bytes=-500" -> last 500 bytes.
    const suffixLength = parseInt(endStr, 10);
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = parseInt(startStr, 10);
    end =
      endStr === ""
        ? fileSize - 1
        : Math.min(parseInt(endStr, 10), fileSize - 1);
  }

  if (start >= fileSize || end < start) return null;

  return { start, end };
}
