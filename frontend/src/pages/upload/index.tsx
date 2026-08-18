import { GetServerSidePropsContext } from "next";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    redirect: {
      destination: "/",
      permanent: true,
    },
  };
}

export default function UploadRedirect() {
  return null;
}
