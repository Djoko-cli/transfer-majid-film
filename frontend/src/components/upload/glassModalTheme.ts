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
    // Mantine makes this header `position: sticky; top: 0` and gives it an
    // opaque background for exactly one reason: so the body scrolling under
    // it is hidden rather than showing through the title. Overriding that to
    // "transparent" restored the glass but threw away the occlusion, so on
    // any modal whose content overflows — which on a phone is most of them —
    // the form scrolled up through the heading and the two rendered on top of
    // each other. Reported on the reverse-share modal; it was never specific
    // to it, all ~20 glass modals share this object.
    //
    // Frosted rather than opaque: a solid bar would read as a seam across a
    // surface that is translucent everywhere else. The tint alone does not
    // hide text, and the blur alone only smears it — together they read as
    // the same glass, slightly denser, which is the convention the rest of
    // this app already uses for a bar pinned over content.
    header: {
      backgroundColor: dark
        ? "rgba(26, 26, 26, 0.82)"
        : "rgba(255, 255, 255, 0.82)",
      backdropFilter: "blur(16px) saturate(160%)",
      WebkitBackdropFilter: "blur(16px) saturate(160%)",
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
