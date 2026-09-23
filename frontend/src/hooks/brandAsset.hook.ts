import useConfig from "./config.hook";

// The versions of the mark an admin can pick under Appearance, and the
// folder under public/img/ each is rendered into by
// scripts/brand/generate-icons.mjs (its VARIANTES name the same folders; the
// backend's email.service.ts keeps the same map). Renaming one side without
// the other would serve images that do not exist. The first is the default.
export const LOGO_VERSIONS = [
  "original",
  "flat",
  "standalone",
  "standalone-flat",
] as const;

const FOLDERS: Record<string, string> = {
  original: "",
  flat: "flat/",
  standalone: "standalone/",
  "standalone-flat": "standalone-flat/",
};

// Resolves the brand's images (logo, favicon, icons, share preview,
// manifest) to the version picked under Admin → Appearance. Every place the
// mark appears goes through here, so the choice cannot leave one behind.
const useBrandAsset = () => {
  const config = useConfig();

  // Read defensively. configService.get THROWS on an unknown key, and a key
  // added to the config seed does not exist until that seed has actually
  // run — which is true of every local database until someone runs it, and
  // of any instance between a deploy's code and its seed. The header is on
  // every page: the original mark is the right answer until then, a crash
  // is not. An unknown value falls back the same way.
  let folder = "";
  try {
    folder = FOLDERS[config.get("appearance.logo")] ?? "";
  } catch {
    // key not seeded yet — keep the original mark
  }

  return {
    // `path` is relative to /img/, e.g. "logo.png" or "icons/icon-192x192.png".
    asset: (path: string) => `/img/${folder}${path}`,
    // The original manifest is hand-written at the root; the others are
    // derived from it by the generator, next to their own icons.
    manifest: folder ? `/img/${folder}manifest.json` : "/manifest.json",
  };
};

export default useBrandAsset;
