import Head from "next/head";
import useBrandAsset from "../hooks/brandAsset.hook";

// The page-wide brand links, rendered from the app rather than from
// _document: _document renders once, outside every context, and cannot know
// which version of the mark the admin picked. `key` makes next/head keep a
// single copy of each, whatever else asks for one.
const BrandHead = () => {
  const { asset, manifest } = useBrandAsset();

  return (
    <Head>
      <link key="manifest" rel="manifest" href={manifest} />
      <link
        key="icon"
        rel="icon"
        type="image/x-icon"
        href={asset("favicon.ico")}
      />
      {/* 180 px et un fond opaque, les deux exigences d'iOS pour un
          raccourci sur l'écran d'accueil : il pointait jusqu'ici vers
          l'icône PWA de 128 px, qui est transparente — et iOS remplace
          la transparence par du noir. */}
      <link
        key="apple-touch-icon"
        rel="apple-touch-icon"
        sizes="180x180"
        href={asset("icons/apple-touch-icon.png")}
      />
    </Head>
  );
};

export default BrandHead;
