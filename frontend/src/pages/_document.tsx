import { createGetInitialProps } from "@mantine/next";
import Document, { Head, Html, Main, NextScript } from "next/document";

const getInitialProps = createGetInitialProps();

export default class _Document extends Document {
  static getInitialProps = getInitialProps;

  render() {
    return (
      <Html>
        <Head>
          <link rel="manifest" href="/manifest.json" />
          <link rel="icon" type="image/x-icon" href="/img/favicon.ico" />
          {/* 180 px et un fond opaque, les deux exigences d'iOS pour un
              raccourci sur l'écran d'accueil : il pointait jusqu'ici vers
              l'icône PWA de 128 px, qui est transparente — et iOS remplace
              la transparence par du noir. */}
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/img/icons/apple-touch-icon.png"
          />

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
