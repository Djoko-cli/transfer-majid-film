import {
  ActionIcon,
  Anchor,
  Box,
  Text,
  Transition,
  createStyles,
  useMantineTheme,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { runwayOnly } from "../styles/runway.style";
import { TbX } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate from "../hooks/useTranslate.hook";
import userPreferences from "../utils/userPreferences.util";

// Auto-dismisses after this long once actually shown, same action as
// clicking the close button (see the effect below) - purely informational
// (see the notice's own reasoning further down), never blocking anything,
// and its content stays permanently available at /privacy and in the
// footer, which is what makes a timed auto-dismiss reasonable here rather
// than a WCAG 2.2.1 timing concern.
const AUTO_DISMISS_MS = 20000;
// Mantine's own built-in presets (opacity + transform only - translate/
// scale, never a layout-triggering property like height or top/bottom) -
// GPU-composited by construction, not something to hand-roll on top of.
const TRANSITION_MS = 300;

// Every cookie this app sets (see the table in privacy policy content) is
// either strictly necessary (auth, CSRF state, password-protected-share
// access) or a plain preference (language, color scheme) - no advertising,
// no analytics, no third-party tracking. Under CNIL's guidance that's
// exactly the category of cookie exempt from the consent-banner
// requirement, which is the legal claim the privacy policy itself already
// makes ("ce qui ne nécessite pas de bandeau de consentement..."). This is
// deliberately an *informational* notice with a single dismiss, not an
// accept/reject consent gate - framing it as a consent request would
// contradict that claim (and wouldn't make sense for a cookie you can't
// actually decline and still use the site, like access_token). It still
// satisfies GDPR's separate information obligation (Article 13/14) even
// though consent isn't the applicable basis here.
const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  return {
    card: {
      position: "fixed",
      // Same reason as the runway's two bar slots: this card floats over the
      // page rather than inside its scroller, so a drag starting on it has
      // no scrollable ancestor but the parked document — which moves, and
      // which the park then yanks back. Taps and the close button are
      // unaffected. Scoped to the runway, since off it the document is the
      // page's own scroller and dragging from here should scroll it.
      ...runwayOnly({ touchAction: "none" }),
      right: theme.spacing.lg,
      // Floats just above the fixed, translucent footer (see Footer.tsx)
      // using its real, live-measured height - same --footer-height custom
      // property BrandPanel's caption already reserves against, so this
      // stays correctly clear of the footer regardless of how tall it is
      // (e.g. the footer's 3-line mobile legal-links stack vs. its single
      // desktop row).
      bottom: `calc(var(--footer-height, 40px) + ${theme.spacing.md})`,
      zIndex: 150,
      maxWidth: 320,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      // Same glass recipe as Header/Footer/SplitTransferLayout - this is
      // the one card-shaped element that floats over ordinary page content
      // (not the brand photo backdrop those are tuned against), so it
      // reads correctly at a lighter blur than the big feature cards use.
      background: dark
        ? "linear-gradient(160deg, rgba(20, 20, 20, 0.85) 0%, rgba(20, 20, 20, 0.9) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.9) 100%)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
      boxShadow: dark
        ? "0 12px 32px rgba(0, 0, 0, 0.45)"
        : "0 12px 32px rgba(0, 0, 0, 0.15)",

      // A right-anchored corner card would sit flush against the screen
      // edge on mobile, half-clipped-looking rather than deliberately
      // placed - inset margins on both sides instead, same width the
      // admin's own mobile breakpoints treat as "narrow" elsewhere in
      // this app.
      [theme.fn.smallerThan(400)]: {
        right: theme.spacing.md,
        left: theme.spacing.md,
        maxWidth: "none",
      },
    },

    closeButton: {
      position: "absolute",
      top: 6,
      right: 6,
    },

    text: {
      paddingRight: 20, // clears the close button above it
    },
  };
});

const CookieNotice = () => {
  const { classes } = useStyles();
  const theme = useMantineTheme();
  const t = useTranslate();
  // Starts dismissed (hidden) on every render, server and client alike -
  // same hydration-safety reasoning as TermsGate's hasAcceptedTerms:
  // localStorage doesn't exist server-side, so seeding this from it
  // directly would make a returning visitor's client-side first render
  // disagree with the server-rendered HTML. The real value loads a tick
  // later, in the effect below.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(userPreferences.get("cookieNoticeDismissed") === "true");
  }, []);

  // Published as a CSS var, same reasoning and pattern as Footer's own
  // --footer-height (see Footer.tsx): pages whose bottom content needs to
  // stay clear of this card - not just the footer beneath it - live
  // several components away with no shared parent, and this card's real
  // height varies (locale, font size). --footer-height alone used to be
  // what _app.tsx's own paddingBottom reserved, which left this card
  // overlapping tall in-flow content on mobile (e.g. the upload page's
  // terms gate) whenever both happened to be visible at once - reported
  // from the user's own screenshot.
  //
  // A callback ref, not a plain useRef read from a `dismissed`-keyed
  // effect: Transition (react-transition-group underneath) doesn't
  // guarantee the Box is actually attached in the same commit `dismissed`
  // flips to false, so an effect keyed on `dismissed` can fire while
  // cardRef.current is still null, find nothing to measure, and never get
  // another chance (nothing re-triggers it afterward) - confirmed live,
  // this is exactly what happened. A callback ref instead fires precisely
  // on real attach/detach, so it naturally publishes the real height once
  // mounted and reverts to 0px only once Transition actually removes the
  // node - i.e. after the exit animation finishes, not the instant the
  // close button is clicked.
  const observerRef = useRef<ResizeObserver | null>(null);
  const publishClearance = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!el) {
        document.documentElement.style.setProperty(
          "--cookie-notice-clearance",
          "0px",
        );
        return;
      }

      // theme.spacing.md is a rem string ("1rem"), not a number - built as
      // a calc() expression rather than added in JS, same reasoning as
      // this card's own `bottom` above (mixing px and rem needs the
      // browser to resolve it; adding "1rem" to a number in JS would
      // silently string-concatenate instead of erroring).
      const publish = () =>
        document.documentElement.style.setProperty(
          "--cookie-notice-clearance",
          `calc(${el.offsetHeight}px + ${theme.spacing.md})`,
        );
      publish();

      const observer = new ResizeObserver(publish);
      observer.observe(el);
      observerRef.current = observer;
    },
    [theme.spacing.md],
  );

  // useCallback rather than a plain function, so the effect below (and any
  // future caller) can list it as a real dependency instead of needing an
  // exhaustive-deps suppression - it never actually changes identity
  // (setDismissed is stable, userPreferences is a module import), but
  // ESLint can't know that from a fresh arrow function every render.
  const dismiss = useCallback(() => {
    userPreferences.set("cookieNoticeDismissed", "true");
    setDismissed(true);
  }, []);

  // Starts only once the card actually becomes visible (not on every
  // render) - re-arms itself correctly if `dismissed` were ever to flip
  // back to false, though nothing in this component does that today.
  useEffect(() => {
    if (dismissed) return;
    const timeout = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [dismissed, dismiss]);

  return (
    <Transition
      mounted={!dismissed}
      transition="slide-up"
      duration={TRANSITION_MS}
      timingFunction="ease"
    >
      {(transitionStyles) => (
        <Box
          ref={publishClearance}
          className={classes.card}
          style={transitionStyles}
        >
          <ActionIcon
            className={classes.closeButton}
            size="sm"
            onClick={dismiss}
            aria-label={t("cookieNotice.dismiss")}
          >
            <TbX size={14} />
          </ActionIcon>
          <Text size="xs" className={classes.text}>
            <FormattedMessage
              id="cookieNotice.text"
              values={{
                privacyLink: (
                  <Anchor size="xs" href="/privacy">
                    {t("privacy.title")}
                  </Anchor>
                ),
              }}
            />
          </Text>
        </Box>
      )}
    </Transition>
  );
};

export default CookieNotice;
