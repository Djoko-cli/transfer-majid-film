import { getCookie } from "cookies-next";

// This is a plain utility, called from 15+ components that otherwise have
// no reason to know the current language - reading the same cookie
// useTranslate.hook.ts's own translateOutsideContext already reads for
// the identical reason keeps every one of those call sites correctly
// localized for free, rather than threading a locale argument through
// each of them individually. Still correct after a live language switch:
// _app.tsx's switchLanguage writes this cookie before the state update
// that re-renders whatever called this, so by the time that re-render
// happens (and re-calls this), the cookie already holds the new value.
// undefined (SSR, no document) falls back to English, matching this
// app's own defaultLocale elsewhere.
const isFrench = () =>
  typeof document !== "undefined" &&
  (getCookie("language")?.toString() ?? "").toLowerCase().startsWith("fr");

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
