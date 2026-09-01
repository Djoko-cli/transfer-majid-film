import Upload from "../components/upload/UploadPage";

export default function Home() {
  // No <Meta> here - UploadPage already renders its own (translated,
  // "Envoyer"/"Upload" rather than a hardcoded, un-translated "Home"),
  // and next/head doesn't dedupe two independently-rendered og:*/
  // twitter:* tag sets with different content - this page used to
  // render both, so the actual served HTML carried two conflicting
  // og:title/og:description pairs at once.
  return <Upload isReverseShare={false} />;
}
