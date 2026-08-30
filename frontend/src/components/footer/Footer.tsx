import {
  Anchor,
  Footer as MFooter,
  SimpleGrid,
  Text,
  createStyles,
} from "@mantine/core";
import { useEffect, useRef } from "react";
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

    // Hidden below 700px rather than conditionally not rendered (this used
    // to be `{!isMobile && <div></div>}`, isMobile from useMediaQuery) —
    // useMediaQuery can't know the real viewport during SSR (no `window`),
    // so it rendered every visitor's *first* paint as if desktop, mobile
    // devices included, then corrected itself once the client hydrated and
    // read the real width — a real, visible layout jump on every mobile
    // load with legal links enabled, reported by the user on their own
    // instance. display:none is decided by the browser evaluating a CSS
    // media query at paint time, using the actual viewport, the same on
    // the server-rendered first paint and every one after — nothing to
    // correct after the fact. A display:none grid child doesn't consume a
    // grid cell, so this still leaves exactly 2 real columns for
    // SimpleGrid's own mobile breakpoint below to fill.
    spacer: {
      [theme.fn.smallerThan(700)]: {
        display: "none",
      },
    },

    // Same reasoning as spacer above — was `align={isMobile ? "left" :
    // "center"}` on the Text itself. theme.fn.smallerThan(700) here matches
    // SimpleGrid's own breakpoints prop (below) exactly: both resolve
    // through the same theme.fn.smallerThan, so the column count and this
    // alignment always flip at precisely the same width, never one frame
    // or one pixel apart.
    brandText: {
      textAlign: "center",
      [theme.fn.smallerThan(700)]: {
        textAlign: "left",
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
  const hasImprint = !!(
    config.get("legal.imprintUrl") || config.get("legal.imprintText")
  );
  const hasPrivacy = !!(
    config.get("legal.privacyPolicyUrl") ||
    config.get("legal.privacyPolicyText")
  );
  const imprintUrl =
    (!config.get("legal.imprintText") && config.get("legal.imprintUrl")) ||
    "/imprint";
  const privacyUrl =
    (!config.get("legal.privacyPolicyText") &&
      config.get("legal.privacyPolicyUrl")) ||
    "/privacy";

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
        <SimpleGrid cols={3} breakpoints={[{ maxWidth: 700, cols: 2 }]} m={0}>
          <div className={classes.spacer}></div>
          <Text size="xs" color="dimmed" className={classes.brandText}>
            {APP_NAME} ·{" "}
            <Anchor size="xs" href="https://majid.film" target="_blank">
              majid.film
            </Anchor>
          </Text>
          <div>
            <Text size="xs" color="dimmed" align="right">
              {hasImprint && (
                <Anchor size="xs" href={imprintUrl}>
                  {t("imprint.title")}
                </Anchor>
              )}
              {hasImprint && hasPrivacy && " • "}
              {hasPrivacy && (
                <Anchor size="xs" href={privacyUrl}>
                  {t("privacy.title")}
                </Anchor>
              )}
            </Text>
          </div>
        </SimpleGrid>
      )}
    </MFooter>
  );
};

export default Footer;
