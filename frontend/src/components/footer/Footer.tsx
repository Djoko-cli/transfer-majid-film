import {
  Anchor,
  Box,
  Footer as MFooter,
  Text,
  createStyles,
} from "@mantine/core";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";
import { RUNWAY_BLEED_PX, useBottomBarSlot } from "../core/FullBleedShell";
import { Fragment, useEffect, useRef } from "react";
import { APP_NAME } from "../../constants";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";

// Mirrors Header's own `.root` glass treatment (see Header.tsx): fixed,
// floating over the page rather than sitting in normal document flow, so
// the brand-photo carousel behind it (see SplitTransferLayout/
// AuthGlassLayout's `.bleed`) can extend all the way to the true bottom of
// the viewport and show through the footer's translucent glass, instead of
// the carousel stopping short to leave flow space for an opaque bar.
const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  return {
    // Anchored, not fixed, inside a runway — same reasoning as Header's own
    // rootAnchored (see there). The slot is pinned to the end of the runway
    // box, which lands on the bottom edge of the screen, so this sits
    // exactly where `fixed` put it while no longer earning the opaque
    // native fill that produced the black band below it.
    rootAnchored: {
      position: "static",
      // Keeps its resting padding and extends its BOX through the bleed, so
      // the glass reaches the bottom of the screen and Safari's own glass
      // sits on it. Without this the band stops at the screen edge, the
      // photograph shows through below it, and the page reads as cut short
      // above the toolbar rather than running off the screen. `py={6}` on
      // the element is replaced rather than added to — see pb={0} at the
      // call site, which drops Mantine's `py` prop entirely when anchored:
      // that prop's own class wins over this one, and with it in place the
      // padding below never applied — the whole bar ended up its own height
      // below the screen and simply vanished.
      paddingTop: 6,
      paddingBottom: "calc(6px + var(--runway-bleed))",
    },

    root: {
      background: dark
        ? "linear-gradient(160deg, rgba(10, 10, 10, 0.5) 0%, rgba(10, 10, 10, 0.6) 55%, rgba(10, 10, 10, 0.54) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.6) 55%, rgba(255, 255, 255, 0.54) 100%)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      borderTop: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
    },

    // Named grid areas (not SimpleGrid's equal-column model) because the
    // two breakpoints don't just change column *count*, they change
    // reading order: desktop wants [spacer, brand, legal] side by side
    // (spacer balances the legal column's width so brand reads as
    // centered), mobile wants legal on top and brand below, both centered,
    // one per row. SimpleGrid has no way to reorder children per
    // breakpoint short of reordering the DOM itself — grid-template-areas
    // does it in CSS alone, so the underlying markup order never has to
    // match either breakpoint's visual order.
    //
    // Was a 3-column SimpleGrid down to 700px, 2 columns (brand left,
    // legal right) below it — fine with two legal links, but a third
    // (terms of use) made the right column wrap to 3 lines next to a
    // single short line on the left: lopsided, reported by the user from
    // a screenshot. Centering everything in one column removes the
    // asymmetry regardless of how many legal links exist or how many
    // lines they wrap to.
    footerGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateAreas: '"spacer brand legal"',
      columnGap: theme.spacing.md,
      alignItems: "center",

      [theme.fn.smallerThan(700)]: {
        gridTemplateColumns: "1fr",
        gridTemplateAreas: '"legal" "brand"',
        rowGap: 4,
      },
    },

    spacerArea: {
      gridArea: "spacer",
      // display:none, not omitted from the mobile template alone — an
      // empty but still-laid-out cell would otherwise reserve a track's
      // worth of width under the 1-column mobile template too. See the
      // hydration-safety note this same CSS-only (no useMediaQuery)
      // approach has carried since the original spacer fix.
      [theme.fn.smallerThan(700)]: {
        display: "none",
      },
    },

    brandArea: {
      gridArea: "brand",
      textAlign: "center",
    },

    legalArea: {
      gridArea: "legal",
      textAlign: "right",
      [theme.fn.smallerThan(700)]: {
        textAlign: "center",
      },
    },

    // Desktop keeps every link on one inline row, separated by " • " (see
    // legalSeparator below) - room enough there, and it matches the
    // brand text's own single line beside it. Mobile has neither: one
    // link per line, no separators - requested by the user after the
    // wrapped, separator-heavy version above still read as visually busy
    // once centered.
    legalLink: {
      [theme.fn.smallerThan(700)]: {
        display: "block",
        marginTop: 2,
      },
    },

    legalSeparator: {
      [theme.fn.smallerThan(700)]: {
        display: "none",
      },
    },
  };
});

const Footer = () => {
  const t = useTranslate();
  const config = useConfig();
  const router = useRouter();
  const { classes, cx } = useStyles();
  const bottomSlot = useBottomBarSlot();
  // Published as a CSS var (rather than prop-drilled) so pages that need to
  // reserve room for the footer — e.g. SplitTransferLayout, which lives
  // several components away with no shared parent — can read the real,
  // current height instead of guessing a fixed one. The footer's own height
  // isn't constant: it grows when legal links wrap to a second line at
  // narrow-but-not-mobile widths, when a locale's text runs longer, etc.
  // Uses `offsetHeight` (border-box, matching the space the footer actually
  // occupies in flow) rather than @mantine/hooks' useElementSize, which
  // reports ResizeObserver's contentRect — the content box only, excluding
  // this element's own vertical padding, and so undercounts its real height.
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    const publishHeight = () => {
      const raw = el.offsetHeight;
      // Never publish 0. Moving this bar into the runway's slot changes the
      // portal container, which makes React unmount and remount it — and the
      // detached node's own ResizeObserver can still deliver one last
      // callback reporting 0, after the remounted bar has already published
      // its real height. That stale 0 then sticks, and every consumer reads
      // it: the page reserves nothing for the footer, and the card's
      // centring band runs a whole footer too tall, so the card sits ~47px
      // low and tall content ends up cut off behind the bar. A footer is
      // never 0 tall; a 0 here only ever means "not laid out".
      if (!raw) return;
      // Anchored, the bar carries --runway-bleed as padding so its glass
      // reaches past the screen (see rootAnchored). offsetHeight therefore
      // includes that run, which is not height any reader sees and not
      // height anything should reserve — subtract it back out.
      const height = bottomSlot ? Math.max(0, raw - RUNWAY_BLEED_PX) : raw;
      document.documentElement.style.setProperty(
        "--footer-height",
        `${height}px`,
      );
    };
    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bottomSlot]);
  // Built as a list rather than three separate hasX booleans (the shape
  // this had with just imprint/privacy) - a fixed pairwise "hasA && hasB"
  // separator check doesn't scale past two optional links without an
  // explicit case for every combination. Filtering first means the " • "
  // separators below only ever appear between two links that are both
  // actually rendered, regardless of which of the three are configured.
  const legalLinks = [
    {
      configKey: "legal.imprintText",
      href: "/imprint",
      label: t("imprint.title"),
    },
    { configKey: "legal.termsText", href: "/terms", label: t("terms.title") },
    {
      configKey: "legal.privacyPolicyText",
      href: "/privacy",
      label: t("privacy.title"),
    },
    // Excludes whichever of these three the visitor is currently reading -
    // no reason to link a page to itself, and the footer's own
    // ResizeObserver (above) already recomputes --footer-height for
    // whatever's actually rendered, so a shorter link list on these pages
    // isn't a separate thing to account for.
  ].filter(
    ({ configKey, href }) =>
      !!config.get(configKey) && router.pathname !== href,
  );

  const footer = (
    <MFooter
      ref={footerRef}
      fixed={!bottomSlot}
      height="auto"
      {...(bottomSlot ? {} : { py: 6 })}
      px="xl"
      zIndex={100}
      className={cx(classes.root, { [classes.rootAnchored]: !!bottomSlot })}
    >
      {!config.get("legal.enabled") && (
        <Text size="xs" color="dimmed" align="center">
          {APP_NAME} ·{" "}
          <Anchor size="xs" href="https://majid.film" target="_blank">
            majid.film
          </Anchor>
        </Text>
      )}
      {config.get("legal.enabled") && (
        <Box className={classes.footerGrid}>
          <div className={classes.spacerArea}></div>
          <Text size="xs" color="dimmed" className={classes.brandArea}>
            {APP_NAME} ·{" "}
            <Anchor size="xs" href="https://majid.film" target="_blank">
              majid.film
            </Anchor>
          </Text>
          <Text size="xs" color="dimmed" className={classes.legalArea}>
            {legalLinks.map(({ href, label }, index) => (
              <Fragment key={href}>
                {index > 0 && (
                  <span className={classes.legalSeparator}> • </span>
                )}
                <Anchor size="xs" href={href} className={classes.legalLink}>
                  {label}
                </Anchor>
              </Fragment>
            ))}
          </Text>
        </Box>
      )}
    </MFooter>
  );

  // Into the runway's bottom slot when there is one — an absolute box at the
  // end of the runway, i.e. the bottom edge of the screen. --footer-height
  // keeps being published from the same ref either way.
  return bottomSlot ? createPortal(footer, bottomSlot) : footer;
};

export default Footer;
