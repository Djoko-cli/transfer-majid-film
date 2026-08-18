import localFont from "next/font/local";

const rubik = localFont({
  src: [
    {
      path: "../../public/fonts/rubik/rubik-300-latin.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/rubik/rubik-400-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/rubik/rubik-500-latin.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/rubik/rubik-600-latin.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
});

export default rubik;
