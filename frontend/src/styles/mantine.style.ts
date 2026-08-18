import { MantineThemeOverride } from "@mantine/core";
import rubik from "../fonts/rubik.font";

export default <MantineThemeOverride>{
  fontFamily: `${rubik.style.fontFamily}, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`,
  colors: {
    victoria: [
      "#E2E1F1",
      "#C2C0E7",
      "#A19DE4",
      "#7D76E8",
      "#544AF4",
      "#4940DE",
      "#4239C8",
      "#463FA8",
      "#47428E",
      "#464379",
    ],
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5C5F66",
      "#2E2E2E",
      "#1F1F1F",
      "#141414",
      "#050505",
      "#030303",
      "#000000",
    ],
  },
  primaryColor: "victoria",
  components: {
    Modal: {
      styles: (theme) => ({
        title: {
          fontSize: theme.fontSizes.lg,
          fontWeight: 700,
        },
      }),
    },
    // Mantine's built-in disabled-button colors (dark[4] bg / dark[6] text)
    // assume its own default dark palette. This app's "dark" scale is
    // redefined much closer to near-black for the branding, which collapses
    // those two shades to near-identical grays — a disabled button read as
    // indistinguishable from an enabled one. A light-grey chip (rather than
    // a dark one) reads clearly as "off" against this app's near-black
    // surroundings in both color schemes.
    Button: {
      styles: (theme) => ({
        root: {
          "&:disabled, &[data-disabled]": {
            opacity: 1,
            backgroundColor: theme.colors.gray[3],
            color: theme.colors.gray[7],
            border: "none",
          },
        },
      }),
    },
  },
};
