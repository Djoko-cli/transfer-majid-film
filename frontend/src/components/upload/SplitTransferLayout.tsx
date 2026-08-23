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
      // Reserves exactly the footer's real, live-measured height (published
      // as a CSS var by Footer.tsx) rather than a guessed pixel figure —
      // the footer isn't a fixed height, it grows when legal links wrap to
      // a second line at narrow-but-not-mobile widths. Getting this wrong
      // let the card below grow taller than the space actually available
      // and get visually cut off by the footer painting over it.
      minHeight: "calc(100vh - var(--footer-height, 40px))",
      overflow: "hidden",

      [theme.fn.smallerThan("sm")]: {
        marginTop: 0,
        minHeight: "auto",
        overflow: "visible",
      },
    },

    // Spans the full visible height below the header and centers the
    // (auto-height, content-sized) card slot vertically within it — rather
    // than anchoring the card to a fixed offset, which read as floating too
    // close to the header on tall viewports.
    cardSlot: {
      position: "absolute",
      top: HEADER_HEIGHT,
      bottom: 0,
      left: "clamp(20px, 4vw, 56px)",
      width: 440,
      maxWidth: "calc(100vw - 40px)",
      zIndex: 2,
      display: "flex",
      alignItems: "center",

      [theme.fn.smallerThan("sm")]: {
        position: "relative",
        top: "auto",
        bottom: "auto",
        left: "auto",
        width: "100%",
        maxWidth: "none",
        display: "block",
      },
    },

    cardWrapper: {
      position: "relative",
      width: "100%",
      borderRadius: CARD_RADIUS,
    },

    card: {
      position: "relative",
      height: "auto",
      // A direct viewport-relative cap (rather than a percentage against
      // cardWrapper) since cardWrapper's own height is itself auto/content
      // driven — a percentage there wouldn't have anything definite to
      // resolve against. Only ever bites on short viewports with a lot of
      // expanded content; overflowY is the actual safety net. Must reserve
      // the exact same footer space as cardSlot's band above (`.bleed`'s
      // minHeight) — a smaller reservation here than there let the card
      // grow taller than the band it's centered in and overflow past it,
      // straight into the footer.
      maxHeight: `calc(100vh - ${HEADER_HEIGHT}px - var(--footer-height, 40px))`,
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
      <Box className={classes.cardSlot}>
        <Box className={classes.cardWrapper}>
          <Box className={classes.glint}>
            <GlintBorder radius={CARD_RADIUS} />
          </Box>
          <Box className={classes.card}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
};

export default SplitTransferLayout;
