/** @type {import('next').NextConfig} */
const { version } = require("./package.json");

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkOnly",
    },
  ],
});

module.exports = withPWA({
  transpilePackages: ["@uiw/react-md-editor", "@uiw/react-markdown-preview"],
  output: "standalone",
  images: {
    unoptimized: true,
  },
  env: {
    VERSION: version,
  },
  async redirects() {
    return [
      // The admin dashboard page was removed — its 3 cards just duplicated
      // the admin sidebar's own nav. "Administration" is now a section
      // label in that sidebar instead (see AdminNavBar).
      {
        source: "/admin",
        destination: "/admin/users",
        permanent: false,
      },
    ];
  },
});
