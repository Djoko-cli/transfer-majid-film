import { Box, MantineProvider, createStyles } from "@mantine/core";
import { ReactNode } from "react";
import { HEADER_HEIGHT } from "../header/Header";
import BrandPanel from "../upload/BrandPanel";
import GlintBorder from "../upload/GlintBorder";
import LiquidGlassKeyframes from "../upload/liquidGlassKeyframes";
import glassFormTheme from "../upload/glassFormTheme";

const CARD_RADIUS = 28;

// Same full-bleed brand-carousel background as the main transfer page (see
// SplitTransferLayout), but the card floats centered instead of anchored
// left — auth/account flows have no second "image stays visible" reason to
// keep it off-center.
const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";

  return {
    bleed: {
      position: "relative",
      left: "50%",
      right: "50%",
      marginLeft: "-50vw",
      marginRight: "-50vw",
      width: "100vw",
      marginTop: -HEADER_HEIGHT,
      marginBottom: -1,
      // Reserves whichever is larger: the header's height (so the bottom
      // gap to the viewport edge matches the top gap under the navbar) or
      // the footer's real, live-measured height (published as a CSS var by
      // Footer.tsx — it isn't constant, it grows when legal links wrap to
      // a second line). See the matching, more detailed comment in
      // SplitTransferLayout.
      minHeight: `calc(100vh - max(${HEADER_HEIGHT}px, var(--footer-height, 40px)))`,
      overflow: "hidden",

      [theme.fn.smallerThan("sm")]: {
        marginTop: 0,
        minHeight: "auto",
        overflow: "visible",
      },
    },

    cardSlot: {
      position: "absolute",
      top: HEADER_HEIGHT,
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 20px",

      [theme.fn.smallerThan("sm")]: {
        position: "relative",
        top: "auto",
        bottom: "auto",
        display: "block",
        padding: 0,
      },
    },

    cardWrapper: {
      position: "relative",
      width: "100%",
      borderRadius: CARD_RADIUS,
    },

    card: {
      position: "relative",
      // Must reserve the exact same space as cardSlot's band above (`.bleed`'s
      // minHeight plus cardSlot's own 48px vertical padding) — otherwise an
      // unusually tall auth card (e.g. TOTP with an error message) could
      // grow past the space actually available and get cut off by the
      // footer; overflowY is the safety net if it does hit the cap. See the
      // matching, more detailed comment in SplitTransferLayout.
      maxHeight: `calc(100vh - ${HEADER_HEIGHT}px - max(${HEADER_HEIGHT}px, var(--footer-height, 40px)) - 96px)`,
      overflowY: "auto",
      padding: theme.spacing.xl,
      borderRadius: CARD_RADIUS,
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.5)"}`,
      background: dark
        ? "linear-gradient(160deg, rgba(255, 255, 255, 0.14) 0%, rgba(18, 18, 18, 0.55) 55%, rgba(255, 255, 255, 0.06) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.32) 55%, rgba(255, 255, 255, 0.45) 100%)",
      backdropFilter: "blur(22px) saturate(160%)",
      WebkitBackdropFilter: "blur(22px) saturate(160%)",
      boxShadow: dark
        ? "0 24px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)"
        : "0 24px 60px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.7)",

      [theme.fn.smallerThan("sm")]: {
        maxHeight: "none",
        borderRadius: 0,
        border: "none",
        background: dark ? theme.colors.dark[7] : theme.white,
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        boxShadow: "none",
        padding: theme.spacing.md,
      },
    },

    glint: {
      position: "absolute",
      inset: 0,
      borderRadius: CARD_RADIUS,

      [theme.fn.smallerThan("sm")]: {
        display: "none",
      },
    },
  };
});

const AuthGlassLayout = ({
  children,
  width = 440,
}: {
  children: ReactNode;
  width?: number;
}) => {
  const { classes } = useStyles();

  return (
    <Box className={classes.bleed}>
      <LiquidGlassKeyframes />
      <BrandPanel />
      <Box className={classes.cardSlot}>
        <Box className={classes.cardWrapper} style={{ maxWidth: width }}>
          <Box className={classes.glint}>
            <GlintBorder radius={CARD_RADIUS} />
          </Box>
          <Box className={classes.card}>
            <MantineProvider inherit theme={glassFormTheme}>
              {children}
            </MantineProvider>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default AuthGlassLayout;
