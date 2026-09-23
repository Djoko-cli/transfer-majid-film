import useConfig from "./config.hook";

// The flat version of the mark is rendered into its own folder under
// public/img/ by scripts/brand/generate-icons.mjs, whose VARIANTES names
// the same folder. Renaming one without the other would serve images that
// do not exist.
const FLAT_FOLDER = "flat";

// Resolves the brand's images (logo, favicon, icons, share preview,
// manifest) to the version picked under Admin → Appearance. Every place the
// mark appears goes through here, so the switch cannot leave one behind.
const useBrandAsset = () => {
  const config = useConfig();

  // Read defensively. configService.get THROWS on an unknown key, and a key
  // added to the config seed does not exist until that seed has actually
  // run — which is true of every local database until someone runs it, and
  // of any instance between a deploy's code and its seed. The header is on
  // every page: the original mark is the right answer until then, a crash
  // is not.
  let flat = false;
  try {
    flat = config.get("appearance.flatLogo") === true;
  } catch {
    // key not seeded yet — keep the original mark
  }

  return {
    // `path` is relative to /img/, e.g. "logo.png" or "icons/icon-192x192.png".
    asset: (path: string) =>
      flat ? `/img/${FLAT_FOLDER}/${path}` : `/img/${path}`,
    // The original manifest is hand-written at the root; the flat one is
    // derived from it by the generator, next to its own icons.
    manifest: flat ? `/img/${FLAT_FOLDER}/manifest.json` : "/manifest.json",
  };
};

export default useBrandAsset;
