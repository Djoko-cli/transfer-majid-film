import Upload from "../components/upload/UploadPage";
import Meta from "../components/Meta";

export default function Home() {
  return (
    <>
      <Meta title="Home" />
      <Upload isReverseShare={false} simplified={false} />
    </>
  );
}
