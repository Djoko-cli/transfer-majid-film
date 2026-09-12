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
// offset, but the *preferred* top/bottom gap once cardSlot centers the
// card within the header-to-footer band (see cardSlot's mobile rule
// below) — only visibly binds when the card is tall enough (post
// file-selection) to nearly fill that band; a compact at-rest card gets
// a much larger gap for free from the centering itself.
const CARD_MOBILE_VERTICAL_MARGIN = 40;
// ...but preferred, not guaranteed, which is the whole point: a hard
// 40px top AND bottom is 80px the card's own floor carries into the page
// whether the screen can spare it or not. min-height can only ever grow
// a box, so once the band gets shorter than card + 80, the band stops
// binding, the page locks at that floor and scrolls — 80px of decorative
// margin forcing exactly the pointless scroll the band exists to
// prevent. Measured: 40px of scroll on an iPhone 17 while the cookie
// notice was up, 57px at 375x600, 89px at 320x568. Below this floor the
// gap gives way instead, down to 8px — small enough to buy back every
// case that can be bought back, big enough that the card never sits
// flush against the notice or the menu spacer in the cases that
// genuinely cannot fit.
const CARD_MOBILE_MIN_VERTICAL_MARGIN = 8;
// Roughly how tall the at-rest card is, and the only part of this that
// CSS cannot measure for itself: the gap is half of whatever the band
// has left over after the card, and nothing in CSS can read the card's
// own height from its parent. Deliberately a plain approximation rather
// than a ResizeObserver — drift is graceful in both directions (a taller
// real card just starts shedding margin slightly late, a shorter one
// slightly early, neither breaks anything), and measuring it live would
// mean a box whose height feeds a parent that feeds the box back.
const CARD_MOBILE_AT_REST_HEIGHT = 380;

// The visible band the mobile card is centered in: everything the
// viewport has left once the fixed header, the header's own in-flow
// mobile menu spacer, the fixed footer and whatever is floating above it
// have taken their share. Written once and used twice below — as the
// band's own min-height, and as the input to the gap that shrinks with
// it — because the two must describe the same space to stay in step.
const MOBILE_BAND = `calc(100dvh - ${HEADER_HEIGHT}px - ${MOBILE_MENU_SPACER_HEIGHT}px - var(--footer-height, 40px) - var(--cookie-notice-clearance, 0px))`;

// How the band settles when what's floating at the bottom of the screen
// appears or leaves (today: the cookie notice). Matches the card's own
// Collapse duration in UploadPage, and the easing this codebase already
// uses wherever something travels to a new resting place (BrandPanel's
// slides, LanguageToggle's thumb) — a strong ease-out, so the card leaves
// immediately and eases into position rather than drifting the whole way.
export const BAND_SETTLE_MS = 300;
export const BAND_SETTLE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

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
      // Takes back BOTH halves of what _app.tsx reserves at the page's
      // bottom: the footer's own height, and the room it also holds for
      // the cookie notice floating above it. The footer half is the
      // original reason for this line; the notice half was 124px of page
      // height this layout paid for nothing, and it showed up as exactly
      // that much scroll on a desktop page whose content otherwise fit
      // the viewport precisely. Nothing here can be trapped under that
      // notice for the reservation to protect: `.bleed` has no in-flow
      // children at all (the backdrop is fixed, the card slot absolute),
      // and the notice is anchored bottom-RIGHT at max 320px wide while
      // this card sits at the left edge — they never overlap on a
      // desktop viewport, so the card needs no room made for it either.
      // Mobile is a different story and deliberately keeps the
      // reservation: there the card is centred in flow and the notice
      // does sit over it, so that page height is what lets the card be
      // scrolled clear (see the mobile rule just below, which subtracts
      // the same term from its band).
      marginBottom:
        "calc(-1 * (var(--footer-height, 40px) + var(--cookie-notice-clearance, 0px)))",
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
        //
        // --cookie-notice-clearance is subtracted for exactly the same
        // reason, and was the other half of that same pointless scroll:
        // _app.tsx already ADDS it to the page wrapper's own padding-
        // bottom (so in-flow content clears the notice floating above the
        // footer), but this band only ever subtracted --footer-height, so
        // the two disagreed and the page came out precisely one notice
        // taller than the viewport — measured at 106px on a 390px-wide
        // phone, 124px on a 412px one, for every visitor who hadn't
        // dismissed the notice yet. Subtracting it here makes the band
        // the genuinely free space again: the card centres in what's left
        // between the header and whatever is actually floating at the
        // bottom, and the page total lands back on exactly 100dvh. Falls
        // back to 0px once the notice is dismissed (see CookieNotice.tsx,
        // which publishes 0px on unmount), so the band grows back on its
        // own with no extra bookkeeping here.
        minHeight: MOBILE_BAND,
        // Half of whatever the band has left over once the card has taken
        // its share, capped at the preferred gap and floored at the
        // minimum one (see both constants above). On any phone with room
        // to spare this resolves to the cap and nothing changes visually
        // from a plain 40px; it only gives way on the screens where the
        // alternative was scrolling the whole page past a margin.
        padding: `clamp(${CARD_MOBILE_MIN_VERTICAL_MARGIN}px, calc((${MOBILE_BAND} - ${CARD_MOBILE_AT_REST_HEIGHT}px) / 2), ${CARD_MOBILE_VERTICAL_MARGIN}px) ${CARD_MOBILE_SIDE_MARGIN}px`,
        // Both values above are read off --cookie-notice-clearance, so
        // both step the moment the cookie notice unmounts and publishes
        // 0px — the band grows by a whole notice at once and the card,
        // centred in it, teleports half that distance down. Measured on
        // the real phone: a ~53px jump landing inside a single frame,
        // right after the notice had finished fading, which reads as the
        // card being knocked rather than settling. Transitioning the two
        // properties that actually changed lets the card travel that
        // distance instead, on one box, with no JS, no measurement and
        // nothing to keep in sync — the same duration as the card's own
        // Collapse (UploadPage) so a disclosure and a re-centre that
        // happen to coincide move together rather than at two speeds.
        transition: `min-height ${BAND_SETTLE_MS}ms ${BAND_SETTLE_EASING}, padding ${BAND_SETTLE_MS}ms ${BAND_SETTLE_EASING}`,
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
        // The spacer subtracted above is invisible flow space, not a
        // visual obstruction — BrandPanel's fixed photo backdrop shows
        // straight through it. So centering the card *within* this
        // (correctly shortened) box alone visually reads as centered in
        // [header+spacer, footer], not the actually-visible
        // [header, footer] band the eye judges it against — off by half
        // the spacer's own height, downward. A transform (not a layout
        // property — doesn't touch this box's real flow footprint, so
        // the page-height fix above stays exactly intact) shifts the
        // *painted* box up by that same half, with no dependency on
        // header/footer height or the card's own (variable) size.
        transform: `translateY(-${MOBILE_MENU_SPACER_HEIGHT / 2}px)`,
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
