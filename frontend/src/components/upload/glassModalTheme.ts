// Styles for every glass-treated modal across the app — passed directly
// into each `modals.openModal({ styles: glassModalStyles, ... })` call, not
// the app-wide theme. Mantine's ModalsProvider renders modal content at the
// app root, outside any scoped glass MantineProvider (TransferCard's,
// AdminLayout's, etc.), so without this a modal opened from within one of
// those would visually break from glass card to a flat default box and
// back. A modal only picks this up where it's explicitly passed — plain
// Mantine modals elsewhere are unaffected.
//
// The dark middle stop is deliberately much fainter than glassFormTheme's
// Paper/card recipes at first glance suggest it "should" be: a diagonal
// gradient's stops are percentages of the element's own diagonal, so the
// same alpha that reads as a subtle sheen on a large surface compresses
// into a hard, legibility-wrecking dark band on anything modal-sized or
// smaller (confirmed on the sign-in card and the navbar's menus — see
// mantine.style.ts's Menu override for the small-menu case, which drops
// the gradient entirely instead of just fading it).
export const glassModalStyles = (theme: any) => {
  const dark = theme.colorScheme === "dark";
  return {
    content: {
      background: dark
        ? "linear-gradient(160deg, rgba(255, 255, 255, 0.14) 0%, rgba(18, 18, 18, 0.32) 55%, rgba(255, 255, 255, 0.06) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.5) 55%, rgba(255, 255, 255, 0.6) 100%)",
      backdropFilter: "blur(22px) saturate(160%)",
      WebkitBackdropFilter: "blur(22px) saturate(160%)",
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.5)"}`,
      boxShadow: dark
        ? "0 24px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
        : "0 24px 60px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
    },
    header: {
      backgroundColor: "transparent",
    },
    title: {
      color: dark ? theme.white : theme.black,
    },
    close: {
      color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
      "&:hover": {
        backgroundColor: dark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(255, 255, 255, 0.35)",
      },
    },
    overlay: {
      backdropFilter: "blur(3px)",
    },
  };
};
