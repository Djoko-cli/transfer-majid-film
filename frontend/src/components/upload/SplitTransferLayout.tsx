import { Box, createStyles } from "@mantine/core";
import { ReactNode } from "react";
import { HEADER_HEIGHT } from "../header/Header";
import BrandPanel from "./BrandPanel";
import GlintBorder from "./GlintBorder";
import LiquidGlassKeyframes from "./liquidGlassKeyframes";

const CARD_RADIUS = 28;

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
      // Pulls the panel back up underneath the fixed, translucent header
      // (see _app.tsx's compensating paddingTop) so the image reaches the
      // very top of the viewport instead of starting below the navbar.
      marginTop: -HEADER_HEIGHT,
      minHeight: "calc(100vh - 90px)",
      overflow: "hidden",

      [theme.fn.smallerThan("sm")]: {
        marginTop: 0,
        minHeight: "auto",
        overflow: "visible",
      },
    },

    cardWrapper: {
      position: "absolute",
      // Auto height, sized to its content — anchored near the top instead
      // of stretched to fill the panel, so short forms don't leave a huge
      // empty lower half on tall viewports. maxHeight is only a safety net
      // for very short viewports with a lot of expanded content.
      top: `calc(${HEADER_HEIGHT}px + clamp(24px, 5vh, 64px))`,
      left: "clamp(20px, 4vw, 56px)",
      width: 440,
      maxWidth: "calc(100vw - 40px)",
      maxHeight: `calc(100vh - ${HEADER_HEIGHT}px - clamp(48px, 10vh, 128px))`,
      zIndex: 2,
      borderRadius: CARD_RADIUS,

      [theme.fn.smallerThan("sm")]: {
        position: "relative",
        top: "auto",
        left: "auto",
        width: "100%",
        maxWidth: "none",
        maxHeight: "none",
      },
    },

    card: {
      position: "relative",
      height: "auto",
      maxHeight: "100%",
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
        height: "auto",
        borderRadius: 0,
        border: "none",
        background: dark ? theme.colors.dark[7] : theme.white,
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        boxShadow: "none",
        padding: theme.spacing.md,
      },
    },

    // Sits exactly over .card's own box (same parent, same size) so the
    // traced outline coincides with the card's real border instead of
    // floating as a separate ring.
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

const SplitTransferLayout = ({ children }: { children: ReactNode }) => {
  const { classes } = useStyles();

  return (
    <Box className={classes.bleed}>
      <LiquidGlassKeyframes />
      <BrandPanel />
      <Box className={classes.cardWrapper}>
        <Box className={classes.glint}>
          <GlintBorder radius={CARD_RADIUS} />
        </Box>
        <Box className={classes.card}>{children}</Box>
      </Box>
    </Box>
  );
};

export default SplitTransferLayout;
