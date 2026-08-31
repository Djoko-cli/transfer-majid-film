import { ActionIcon, Anchor, Box, Text, createStyles } from "@mantine/core";
import { useEffect, useState } from "react";
import { TbX } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate from "../hooks/useTranslate.hook";
import userPreferences from "../utils/userPreferences.util";

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

  const dismiss = () => {
    userPreferences.set("cookieNoticeDismissed", "true");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <Box className={classes.card}>
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
  );
};

export default CookieNotice;
