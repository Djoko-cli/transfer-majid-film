import Head from "next/head";
import { APP_NAME } from "../constants";

const Meta = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => {
  const metaTitle = `${title} - ${APP_NAME}`;

  return (
    <Head>
      <title>{metaTitle}</title>
      <meta name="og:title" content={metaTitle} />
      <meta
        name="og:description"
        content={
          description ?? "An open-source and self-hosted sharing platform."
        }
      />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={description} />
    </Head>
  );
};

export default Meta;
