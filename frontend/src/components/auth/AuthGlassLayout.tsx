import { Box, MantineProvider, createStyles } from "@mantine/core";
import { ReactNode } from "react";
import { HEADER_HEIGHT, MOBILE_MENU_SPACER_HEIGHT } from "../header/Header";
import BrandPanel from "../upload/BrandPanel";
import GlintBorder from "../upload/GlintBorder";
import LiquidGlassKeyframes from "../upload/liquidGlassKeyframes";
import glassFormTheme from "../upload/glassFormTheme";

const CARD_RADIUS = 28;

// Mobile breathing room around the centered card — preferred, minimum,
// and the nominal card height the first gives way against. Same mechanism
// and same reasoning as SplitTransferLayout's own trio (see the fuller
// comments there): a hard top+bottom margin is height the card's floor
// carries into the page whether the screen can spare it or not, and
// min-height can only grow a box, so on a short screen that margin alone
// makes the page scroll. The nominal height is the taller of the two auth
// forms as measured at rest (sign-up 400px, sign-in 388px) — it only
// decides when the gap starts giving way, so erring high just means
// shedding margin a little early.
const CARD_MOBILE_VERTICAL_MARGIN = 40;
const CARD_MOBILE_MIN_VERTICAL_MARGIN = 8;
const CARD_MOBILE_SIDE_MARGIN = 16;
const CARD_MOBILE_AT_REST_HEIGHT = 400;

// The visible band the mobile card is centered in — the viewport minus
// the fixed header, the header's in-flow mobile menu spacer, the fixed
// footer, and whatever floats above it. Written once, used as both the
// band's min-height and the input to the gap that shrinks with it, so the
// two always describe the same space.
const MOBILE_BAND = `calc(100dvh - ${HEADER_HEIGHT}px - ${MOBILE_MENU_SPACER_HEIGHT}px - var(--footer-height, 40px) - var(--cookie-notice-clearance, 0px))`;

// How the band settles when the cookie notice appears or leaves — same
// duration and easing as SplitTransferLayout's own (see there): without
// it the band steps by a whole notice at once and the card, centred in
// it, teleports half that distance.
const BAND_SETTLE_MS = 300;
const BAND_SETTLE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

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
      // Pulls the panel up under the fixed header, and down under the
      // fixed footer (see Footer.tsx and _app.tsx's compensating
      // paddingTop/paddingBottom), so the image spans the true full
      // viewport and shows through both bars' translucent glass instead of
      // stopping short to leave flow space for them. See the matching,
      // more detailed comment in SplitTransferLayout.
      marginTop: -HEADER_HEIGHT,
      // Takes back both halves of _app.tsx's bottom reservation — the
      // footer's height and the room held for the cookie notice above it
      // — for the same reason as SplitTransferLayout's identical line
      // (see there): this layout has no in-flow children for the notice
      // to trap, and the notice is anchored bottom-right at max 320px
      // while the card is centred, so on desktop they never meet. It was
      // 124px of page height bought for nothing, and it scrolled.
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

    cardSlot: {
      position: "absolute",
      top: HEADER_HEIGHT,
      // Mirrors `top` — reserves room to stay clear of the now-floating
      // footer instead of relying on `.bleed`'s own box stopping short of
      // it. Uses the footer's real height directly, not padded up to match
      // the header's. See the matching, more detailed comment in
      // SplitTransferLayout.
      bottom: "var(--footer-height, 40px)",
      left: 0,
      right: 0,
      zIndex: 2,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 20px",

      // Same fix as SplitTransferLayout's own mobile cardSlot (see its
      // fuller comment) — this used to be a plain top/bottom margin with
      // no real centering mechanism at all, invisible for a card tall
      // enough to fill most of the screen (every auth form until now) but
      // measurably wrong (129px off true center, on a real measurement,
      // not eyeballed) for a short one, which is exactly what the reverse
      // -share flow's at-rest dropzone is once it started using this same
      // layout. min-height (not a fixed height) plus flex-centering
      // reproduces the header-to-footer band via normal flow instead of
      // desktop's absolute positioning; 100dvh instead of 100vh because
      // mobile's 100vh is defined against the largest possible viewport
      // (chrome collapsed), not the one actually visible; subtracting
      // MOBILE_MENU_SPACER_HEIGHT accounts for the real, uncollapsed flow
      // space Header.tsx's own mobile menu spacer reserves below itself;
      // and the translateY shift re-centers within the *visible* band
      // rather than the band minus that same spacer, which is invisible
      // flow space, not a visual obstruction — BrandPanel's fixed photo
      // backdrop shows straight through it. All four pieces are load-
      // bearing together; dropping any one reproduces a version of this
      // same bug. Padding, not margin, for the same reason as
      // SplitTransferLayout: margin would collapse into that spacer's own
      // (zero) margin exactly the way this file's old comment describes,
      // which is fine for a fixed offset but wrong once a min-height band
      // needs a deterministic size to center within.
      [theme.fn.smallerThan("sm")]: {
        position: "relative",
        top: "auto",
        bottom: "auto",
        display: "flex",
        alignItems: "center",
        // --cookie-notice-clearance subtracted for the same reason as
        // --footer-height, and for the same reason SplitTransferLayout's
        // own band subtracts it (see there): _app.tsx already adds it to
        // the page wrapper's padding-bottom, so a band that doesn't
        // subtract it makes the page exactly one notice taller than the
        // viewport — pointless scroll on every auth page for any visitor
        // who hasn't dismissed the notice yet. 0px once dismissed.
        minHeight: MOBILE_BAND,
        // Half of whatever the band has left once the card has taken its
        // share, capped at the preferred gap and floored at the minimum
        // one — see the constants above. Resolves to the cap on any phone
        // with room to spare, so nothing changes visually there; it only
        // gives way where the alternative was scrolling the page past a
        // margin.
        padding: `clamp(${CARD_MOBILE_MIN_VERTICAL_MARGIN}px, calc((${MOBILE_BAND} - ${CARD_MOBILE_AT_REST_HEIGHT}px) / 2), ${CARD_MOBILE_VERTICAL_MARGIN}px) ${CARD_MOBILE_SIDE_MARGIN}px`,
        // Lets the card travel to its new centre when the notice comes or
        // goes, instead of stepping there — see SplitTransferLayout's own
        // matching transition for the fuller reasoning.
        transition: `min-height ${BAND_SETTLE_MS}ms ${BAND_SETTLE_EASING}, padding ${BAND_SETTLE_MS}ms ${BAND_SETTLE_EASING}`,
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
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
      // Must reserve the exact same space as cardSlot's band above (`.bleed`'s
      // minHeight plus cardSlot's own 48px vertical padding) — otherwise an
      // unusually tall auth card (e.g. TOTP with an error message) could
      // grow past the space actually available and get cut off by the
      // footer; overflowY is the safety net if it does hit the cap. See the
      // matching, more detailed comment in SplitTransferLayout.
      maxHeight: `calc(100vh - ${HEADER_HEIGHT}px - var(--footer-height, 40px) - 96px)`,
      overflowY: "auto",
      padding: theme.spacing.xl,
      borderRadius: CARD_RADIUS,
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.5)"}`,
      // Same tint recipe as Header/Footer/PageDropOverlay/SplitTransferLayout
      // (see Header.tsx) — this card sits directly over BrandPanel's photo
      // too, holding every form label the visitor actually reads.
      background: dark
        ? "linear-gradient(160deg, rgba(10, 10, 10, 0.5) 0%, rgba(10, 10, 10, 0.6) 55%, rgba(10, 10, 10, 0.54) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.6) 55%, rgba(255, 255, 255, 0.54) 100%)",
      backdropFilter: "blur(22px) saturate(160%)",
      WebkitBackdropFilter: "blur(22px) saturate(160%)",
      boxShadow: dark
        ? "0 24px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)"
        : "0 24px 60px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.7)",

      // Was flat opaque here — matches the same fix in SplitTransferLayout:
      // now that the photo behind it is a fixed backdrop (BrandPanel) that
      // no longer scrolls away, the same translucent recipe above reads
      // correctly at this size too.
      [theme.fn.smallerThan("sm")]: {
        maxHeight: "none",
        padding: theme.spacing.md,
      },
    },

    // Used to be hidden below "sm" back when the mobile card was flat
    // opaque with no real glass edge to catch — see the matching comment
    // in SplitTransferLayout.
    glint: {
      position: "absolute",
      inset: 0,
      borderRadius: CARD_RADIUS,
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
