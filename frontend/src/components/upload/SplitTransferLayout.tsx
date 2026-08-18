import { Box, createStyles } from "@mantine/core";
import { ReactNode } from "react";
import BrandPanel from "./BrandPanel";
import GlintBorder from "./GlintBorder";

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
      minHeight: "calc(100vh - 180px)",
      overflow: "hidden",

      [theme.fn.smallerThan("sm")]: {
        minHeight: "auto",
        overflow: "visible",
      },
    },

    cardWrapper: {
      position: "absolute",
      top: "clamp(24px, 5vh, 64px)",
      bottom: "clamp(24px, 5vh, 64px)",
      left: "clamp(20px, 4vw, 56px)",
      width: 440,
      maxWidth: "calc(100vw - 40px)",
      zIndex: 2,
      borderRadius: CARD_RADIUS,

      [theme.fn.smallerThan("sm")]: {
        position: "relative",
        top: "auto",
        bottom: "auto",
        left: "auto",
        width: "100%",
        maxWidth: "none",
      },
    },

    card: {
      position: "relative",
      height: "100%",
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

    glint: {
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
