import { createGetInitialProps } from "@mantine/next";
import Document, { Head, Html, Main, NextScript } from "next/document";

const getInitialProps = createGetInitialProps();

export default class _Document extends Document {
  static getInitialProps = getInitialProps;

  render() {
    return (
      <Html>
        <Head>
          {/* The manifest, favicon and apple-touch-icon links live in
              components/BrandHead.tsx: which files they point at depends on
              an admin setting, and this document renders outside every
              context that could tell it. */}
          <meta name="robots" content="noindex" />
          <meta name="theme-color" content="#ff7a00" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
