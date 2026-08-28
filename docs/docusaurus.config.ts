import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Transfer",
  tagline:
    "Transfer is a self-hosted file sharing platform and an alternative for WeTransfer.",
  favicon: "img/logo.png",

  url: "https://djoko-cli.github.io",
  baseUrl: "/transfer/",
  organizationName: "Djoko-cli",
  projectName: "transfer",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/Djoko-cli/transfer-majid-film/edit/main/docs",
          lastVersion: "v1",
          versions: {
            v1: {
              label: "v1.x.x",
              banner: "none",
            },
            current: {
              label: "v2.x.x",
              path: "v2",
              banner: "unreleased",
            },
          },
        },
        blog: false,
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/logo.png",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Transfer",
      logo: {
        alt: "Transfer Logo",
        src: "img/logo.png",
      },
      items: [
        {
          type: "docsVersionDropdown",
          position: "right",
        },
        {
          href: "https://github.com/Djoko-cli/transfer-majid-film",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
