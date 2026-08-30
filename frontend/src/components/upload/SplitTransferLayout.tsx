import { Box, createStyles } from "@mantine/core";
import { ReactNode } from "react";
import { HEADER_HEIGHT, MOBILE_MENU_SPACER_HEIGHT } from "../header/Header";
import BrandPanel from "./BrandPanel";
import GlintBorder from "./GlintBorder";
import LiquidGlassKeyframes from "./liquidGlassKeyframes";

const CARD_RADIUS = 28;
// Guaranteed breathing room between the card and the header above / viewport
// bottom below, on top of just clearing the header's own height. Without
// this, a card that's tall enough to hit its own maxHeight cap sits flush
// against the header (0px gap) while still leaving a visible gap at the
// bottom — because the header is opaque and "eats" its own reserved space,
// while the bottom's reservation is empty space nothing else occupies. This
// margin is applied identically top and bottom (see cardSlot's padding and
// .card's maxHeight below) so the two visible gaps are always equal,
// independent of window size or how tall the card's content is.
const CARD_VERTICAL_MARGIN = 24;
// Breathing room around the card on mobile, now that it floats over a
// fixed photo backdrop instead of sitting flush opaque against the page —
// edge-to-edge left the photo fully covered by the card with nothing
// visible around it.
const CARD_MOBILE_SIDE_MARGIN = 16;
// Mobile's own equivalent of CARD_VERTICAL_MARGIN above: not a fixed
// offset, but the *guaranteed minimum* top/bottom gap once cardSlot
// centers the card within the header-to-footer band (see cardSlot's
// mobile rule below) — only visibly binds when the card is tall enough
// (post file-selection) to nearly fill that band; a compact at-rest card
// gets a much larger gap for free from the centering itself.
const CARD_MOBILE_VERTICAL_MARGIN = 40;

const useStyles = createStyles((theme, { width }: { width: number }) => {
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
      // marginBottom does the same for the fixed, translucent footer (see
      // Footer.tsx and _app.tsx's compensating paddingBottom) — without it,
      // the image would stop short of the true viewport bottom, leaving a
      // gap the footer's own translucency would have nothing to show
      // through.
      marginTop: -HEADER_HEIGHT,
      marginBottom: "calc(-1 * var(--footer-height, 40px))",
      minHeight: "100vh",
      overflow: "hidden",

      [theme.fn.smallerThan("sm")]: {
        marginTop: 0,
        marginBottom: 0,
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
      // Mirrors `top` — now that `.bleed` spans the full viewport (see
      // above), the card needs its own explicit reservation to stay clear
      // of the footer instead of relying on `.bleed`'s own box stopping
      // short of it. Uses the footer's real, live-measured height directly
      // (not padded up to match the header's) — the header and footer
      // aren't the same height (60px vs. ~32px), so reserving the larger
      // of the two here would leave visibly *more* breathing room below
      // the card than above it: the visible gap is what's left after the
      // real bar's own height is subtracted, and a taller reservation than
      // the bar itself just inflates that leftover on one side only.
      bottom: "var(--footer-height, 40px)",
      left: "clamp(20px, 4vw, 56px)",
      width,
      maxWidth: "calc(100vw - 40px)",
      zIndex: 2,
      display: "flex",
      alignItems: "center",
      padding: `${CARD_VERTICAL_MARGIN}px 0`,

      // Desktop centers the card by sizing this box to exactly the visible
      // header-to-footer band via absolute top/bottom, then flex-centering
      // within it. Mobile can't use absolute positioning here (the page
      // needs to scroll normally once the card grows taller than the
      // viewport), so it reproduces the same band as a min-height instead:
      // still flex-centered, but free to grow past it when content needs
      // more room. Was a fixed top/bottom margin with no centering at all
      // — invisible while the card was tall enough to fill most of the
      // screen on its own, but left it sitting high once the at-rest card
      // became compact (see TransferCard's progressive disclosure).
      [theme.fn.smallerThan("sm")]: {
        position: "relative",
        top: "auto",
        bottom: "auto",
        left: "auto",
        width: "auto",
        maxWidth: "none",
        display: "flex",
        alignItems: "center",
        // 100dvh, not 100vh: on mobile, 100vh is defined against the
        // *largest* possible viewport (browser chrome collapsed), not the
        // one actually visible on load (address bar still showing) — so
        // this band came out taller than the real visible area. 100dvh
        // tracks the real, current visible viewport instead.
        //
        // MOBILE_MENU_SPACER_HEIGHT: Header renders its own real (not
        // transformed) spacer box directly below itself on mobile — see
        // Header.tsx's mobileSpacer — genuine flow height this band sits
        // below, on top of the header bar itself. Omitting it (as a first
        // pass at this centering band did) left the total page a full
        // MOBILE_MENU_SPACER_HEIGHT taller than the real viewport, i.e.
        // exactly that much pointless scroll even at rest, compact card.
        minHeight: `calc(100dvh - ${HEADER_HEIGHT}px - ${MOBILE_MENU_SPACER_HEIGHT}px - var(--footer-height, 40px))`,
        padding: `${CARD_MOBILE_VERTICAL_MARGIN}px ${CARD_MOBILE_SIDE_MARGIN}px`,
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
      // the exact same space as cardSlot's own band (its top/bottom
      // reservations plus its vertical padding) — a smaller reservation
      // here than there let the card grow taller than the band it's
      // centered in and overflow past it.
      maxHeight: `calc(100vh - ${HEADER_HEIGHT}px - var(--footer-height, 40px) - ${2 * CARD_VERTICAL_MARGIN}px)`,
      overflowY: "auto",
      padding: theme.spacing.xl,
      borderRadius: CARD_RADIUS,
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.5)"}`,
      // Same tint recipe as Header/Footer/PageDropOverlay (see Header.tsx)
      // — this card sits directly over BrandPanel's photo too, holding
      // every form label the visitor actually reads. Left at its original
      // opacity by explicit request — two passes at raising it (0.82/0.9/
      // 0.84, then a smaller 0.56/0.68/0.6 bump) both read as too opaque
      // and lost the glass identity. Legibility for dimmed/placeholder
      // text now leans entirely on their own halo/color treatment
      // (glassFormTheme.ts) instead of the card's own tint.
      background: dark
        ? "linear-gradient(160deg, rgba(10, 10, 10, 0.5) 0%, rgba(10, 10, 10, 0.6) 55%, rgba(10, 10, 10, 0.54) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.6) 55%, rgba(255, 255, 255, 0.54) 100%)",
      backdropFilter: "blur(22px) saturate(160%)",
      WebkitBackdropFilter: "blur(22px) saturate(160%)",
      boxShadow: dark
        ? "0 24px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)"
        : "0 24px 60px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.7)",

      // Was flat opaque here — the glass identity (and the photo it's
      // meant to sit over) simply didn't exist on mobile. Now that the
      // photo is a fixed backdrop (see BrandPanel.tsx) rather than a
      // banner that scrolls away, the same translucent recipe above reads
      // correctly at this size too — only the internal-scroll cap and
      // padding still need to differ, since the whole page scrolls here
      // instead of the card scrolling internally.
      [theme.fn.smallerThan("sm")]: {
        height: "auto",
        maxHeight: "none",
        padding: theme.spacing.md,
      },
    },

    // Sits exactly over .card's own box (same parent, same size) so the
    // traced outline coincides with the card's real border instead of
    // floating as a separate ring. Used to be hidden below "sm" back when
    // the mobile card was flat opaque with no real glass edge to catch —
    // now that it's glass again (with room around it to actually see the
    // edge), the comet reads the same way it does on desktop.
    glint: {
      position: "absolute",
      inset: 0,
      borderRadius: CARD_RADIUS,
    },
  };
});

const SplitTransferLayout = ({
  children,
  width = 440,
}: {
  children: ReactNode;
  width?: number;
}) => {
  const { classes } = useStyles({ width });

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
