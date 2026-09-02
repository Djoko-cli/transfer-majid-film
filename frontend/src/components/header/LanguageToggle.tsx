import { Box, createStyles, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { TbWorld } from "react-icons/tb";
import useLanguage from "../../hooks/language.hook";
import { LOCALES } from "../../i18n/locales";

// Same duration the mobile menu's own GPU-only reveal uses (see
// MOBILE_MENU_DURATION in this file's sibling Header.tsx) — nothing ties
// the two together, just consistency between this app's small
// interface-chrome animations.
const SLIDE_DURATION_MS = 200;

const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";

  return {
    // A border groups icon+FR+EN as one control, but deliberately no
    // *fill* of its own — this sits nested *inside* the header bar,
    // which is already glass over the photo, and a filled background
    // here compounded into a visibly darker, higher-contrast patch than
    // anything else in the header (confirmed: identical computed
    // gradient as Header's own `root`, just applied twice - a fill
    // stacks opacity, a 1px outline doesn't). Same border color as
    // every other glass surface in this app, just without what makes
    // those surfaces glass.
    root: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 10px",
      borderRadius: 999,
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
    },

    icon: {
      display: "flex",
      color: dark ? theme.colors.dark[2] : theme.colors.gray[6],
      // Same halo the header's own wordmark/nav links use against the
      // photo backdrop (see Header.tsx's `wordmark`/`link` classes) -
      // this now sits as exposed to that backdrop as they are, having
      // lost its own background above.
      filter: `drop-shadow(0 1px 3px ${dark ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.7)"})`,
    },

    divider: {
      width: 1,
      alignSelf: "stretch",
      background: dark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.1)",
    },

    // Positioning context for the sliding indicator below — sized to
    // exactly two equal option widths so the indicator's own 50% width
    // lines up with either option without measuring anything in JS.
    track: {
      position: "relative",
      display: "flex",
    },

    // Absolutely positioned at 50% width, slid left/right with a plain
    // transform (GPU-only, same reasoning as the mobile menu's own reveal
    // in Header.tsx — a translateX here never touches layout).
    indicator: {
      position: "absolute",
      inset: 2,
      width: "calc(50% - 2px)",
      borderRadius: 999,
      backgroundColor: theme.colors[theme.primaryColor][6],
      transition: `transform ${SLIDE_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    },

    option: {
      position: "relative",
      zIndex: 1,
      minWidth: 30,
      padding: "3px 4px",
      fontSize: 12,
      fontWeight: 700,
      textAlign: "center",
      color: dark ? theme.colors.dark[2] : theme.colors.gray[6],
      transition: "color 150ms ease-out",
      // Same reasoning as `icon` above - exposed straight to the photo
      // backdrop now, same halo every other header text gets there.
      textShadow: dark
        ? "0 1px 3px rgba(0, 0, 0, 0.7)"
        : "0 1px 3px rgba(255, 255, 255, 0.7)",
    },

    optionActive: {
      // Same near-white/near-black the header's own wordmark and nav
      // links use against a photo backdrop - here it's sitting on a flat
      // accent fill instead, but the halo does no harm and keeps this
      // consistent with how text-on-a-bright-fill reads elsewhere.
      color: dark ? theme.white : theme.black,
    },
  };
});

// Quick EN/FR switch for the header — the full language list lives in
// account settings (LanguagePicker); this stays a plain two-way switch
// between the two languages this instance actually gets used in (see
// LOCALES's own comment on why only these two are offered at all).
//
// Switching hot-swaps via _app.tsx's own LanguageContext (no reload,
// see that file's switchLanguage) - nothing here decides that, this
// only decides *when* to call it. The switch itself is delayed by one
// slide's worth of time so the indicator's own animation gets to
// finish before the rest of the page's text changes under it, rather
// than both happening on top of each other at once.
const LanguageToggle = () => {
  const { language, switchLanguage } = useLanguage();
  const { classes, cx } = useStyles();
  const isCurrentlyFrench = language?.toLowerCase().startsWith("fr");
  const [selected, setSelected] = useState<"fr" | "en">(
    isCurrentlyFrench ? "fr" : "en",
  );

  const select = (target: "fr" | "en", code: string) => {
    if (target === selected) return;
    setSelected(target);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setTimeout(
      () => switchLanguage(code),
      reducedMotion ? 0 : SLIDE_DURATION_MS,
    );
  };

  return (
    <Box className={classes.root}>
      <TbWorld size={16} className={classes.icon} />
      <Box className={classes.divider} />
      <Box className={classes.track}>
        <Box
          className={classes.indicator}
          style={{
            transform: selected === "fr" ? "translateX(0%)" : "translateX(100%)",
          }}
        />
        <UnstyledButton
          className={cx(classes.option, {
            [classes.optionActive]: selected === "fr",
          })}
          title="Passer en français"
          aria-current={selected === "fr"}
          onClick={() => select("fr", LOCALES.FRENCH.code)}
        >
          FR
        </UnstyledButton>
        <UnstyledButton
          className={cx(classes.option, {
            [classes.optionActive]: selected === "en",
          })}
          title="Switch to English"
          aria-current={selected === "en"}
          onClick={() => select("en", LOCALES.ENGLISH.code)}
        >
          EN
        </UnstyledButton>
      </Box>
    </Box>
  );
};

export default LanguageToggle;
