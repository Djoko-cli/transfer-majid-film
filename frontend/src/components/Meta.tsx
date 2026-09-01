import Head from "next/head";
import { APP_NAME } from "../constants";
import useConfig from "../hooks/config.hook";

const DEFAULT_DESCRIPTION =
  "Envoyez de gros fichiers avec un lien, sans compte.";

const Meta = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => {
  const config = useConfig();
  const metaTitle = `${title} - ${APP_NAME}`;
  const metaDescription = description ?? DEFAULT_DESCRIPTION;
  // og:image/twitter:image need a real absolute URL - a crawler (not a
  // browser) is what actually fetches this, and relative paths resolve
  // inconsistently, or not at all, without a browsing context to resolve
  // them against. general.appUrl is already this app's one source of
  // truth for "the real, configured address of this instance" (every
  // email/share link already builds off it) - not the returnDefault
  // variant, this wants the actual configured value, same as those do.
  const ogImageUrl = `${config.get("general.appUrl")}/img/og-image.png`;

  return (
    <Head>
      <title>{metaTitle}</title>
      {
        // property, not name - name="og:*" (this file's own previous
        // version) is silently ignored by every crawler that actually
        // reads Open Graph tags (Facebook, WhatsApp, iMessage, Slack,
        // Discord, LinkedIn all specifically look for the property
        // attribute; name="og:*" simply isn't part of the spec they
        // read). twitter:* tags are the one family that genuinely does
        // use name, per Twitter/X's own Card spec - left as-is below.
      }
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={APP_NAME} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImageUrl} />
    </Head>
  );
};

export default Meta;
