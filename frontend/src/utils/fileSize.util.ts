// This is a plain utility, called from 15+ components that otherwise have
// no reason to know the current language - a single shared value set from
// outside keeps every one of those call sites correctly localized for
// free, rather than threading a locale argument through each of them
// individually.
//
// Not read from document.cookie directly (an earlier version of this did,
// matching useTranslate.hook.ts's translateOutsideContext) - that reads
// `document`, which doesn't exist during SSR, so it silently fell back to
// English there while the client correctly read "fr". Both the server and
// the client render this exact text into the page (e.g. Dropzone's own
// size caption), so that divergence was a real, reproducible hydration
// mismatch ("Jusqu'à 15.0 GB" from the server vs "Jusqu'à 15.0 Go" from
// the client) on every French visitor's very first page load, confirmed
// live via Next's own hydration-error overlay - not just a cosmetic
// flash, since a hydration mismatch can cascade into React discarding and
// rebuilding a mismatched subtree, silently taking sibling content down
// with it (traced to this after another feature's admin-only button
// stopped rendering for a French user, with every other explanation for
// that ruled out first).
//
// _app.tsx's App component sets currentLanguage synchronously in its own
// function body (not in a useEffect) from its `language` state, which is
// itself seeded from pageProps.language - resolved server-side from the
// request's own cookies (see its own getInitialProps). Since React renders
// top-down and a page's classic getInitialProps-based SSR pass is one
// uninterrupted synchronous renderToString call (no other request's code
// can interleave mid-render), _app.tsx's own render always sets this
// before any descendant (Dropzone included) reads it - server and client
// alike, from the exact same source value.
let currentLanguage = "en";

export function setCurrentLanguage(language: string | undefined) {
  // pageProps.language is only ever populated when ctx.req exists (see
  // _app.tsx's own getInitialProps) - falsy on the few render paths
  // without a real request behind them. Keeps whatever was already
  // resolved rather than overwriting it with a blank value in that case.
  if (language) currentLanguage = language;
}

const isFrench = () => currentLanguage.toLowerCase().startsWith("fr");

export function byteToHumanSizeString(bytes: number) {
  // French uses "o" (octet) as its base unit, not "B" - matching
  // upload.termsGate.perks.size's own already-correct "Go", which this
  // was inconsistent with before (this function's own hardcoded "GB"
  // showing in an otherwise-French UI, e.g. the dropzone's own size
  // caption right next to that "Go" text).
  const sizes = isFrench()
    ? ["o", "Ko", "Mo", "Go", "To"]
    : ["B", "KB", "MB", "GB", "TB"];
  if (bytes == 0) return isFrench() ? "0 octet" : "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1000)).toString());
  return (bytes / Math.pow(1000, i)).toFixed(1).toString() + " " + sizes[i];
}

export function byteToUnitAndSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  if (bytes == 0) return { unit: "B", size: 0 };
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1000)).toString());

  return {
    size: parseFloat((bytes / Math.pow(1000, i)).toFixed(1)),
    unit: units[i],
  };
}

export function unitAndSizeToByte(unit: string, size: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = units.indexOf(unit);
  return Math.pow(1000, i) * size;
}
