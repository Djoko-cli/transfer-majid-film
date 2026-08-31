import { Anchor, Box, Footer as MFooter, Text, createStyles } from "@mantine/core";
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
  const { classes } = useStyles();
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
      document.documentElement.style.setProperty(
        "--footer-height",
        `${el.offsetHeight}px`,
      );
    };
    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
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
  ].filter(({ configKey }) => !!config.get(configKey));

  return (
    <MFooter
      ref={footerRef}
      fixed
      height="auto"
      py={6}
      px="xl"
      zIndex={100}
      className={classes.root}
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
};

export default Footer;
