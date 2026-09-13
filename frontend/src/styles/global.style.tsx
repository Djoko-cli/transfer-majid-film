import { Global } from "@mantine/core";

const GlobalStyle = () => {
  return (
    <Global
      styles={(theme) => ({
        // No page in this app has genuinely scrollable content past the
        // viewport on mobile (the upload/download cards are meant to be
        // the whole screen) — without this, iOS Safari's default rubber-
        // band bounce still fires on any vertical swipe regardless of
        // scrollHeight, and BrandPanel's full-bleed position:fixed photo
        // backdrop (see its own mobile styles) doesn't track that
        // transient overscroll offset, so a swipe briefly reveals the
        // body's own bare background above/below it as a black gap.
        // Reported directly, still reproducing after the two earlier,
        // narrower black-gap fixes (the mobile-menu-push transform
        // compensation, and the fixed-position 100dvh sizing) — those
        // fixed different causes of the same visible symptom, not this
        // one. `html`, not just `body`: iOS Safari's own bounce is a
        // property of the *document's* scrolling, and only suppressing it
        // there reliably blocks the gesture at its source rather than
        // fighting its visual result after the fact.
        html: {
          overscrollBehaviorY: "none",
        },
        a: {
          color: "inherit",
          textDecoration: "none",
        },

        // iOS Safari zooms the whole page whenever a field it focuses has a
        // font-size under 16px. Mantine's inputs default to size "sm", which
        // is 0.875rem — 14px — so every typeable field in this app tripped
        // it: text, search, email, password and number, six of them on the
        // upload page alone.
        //
        // That zoom used to be an annoyance the reader could undo. Since the
        // runway started refusing pinch gestures it is a trap: the page
        // magnifies, pushes part of the focused box off-screen, offers no
        // gesture to get back, and keeps the magnification across the next
        // client-side navigation, so the only way out is a reload. Reported
        // on the six-digit 2FA field, where it bites hardest because that
        // box is narrow and centred, but it was never specific to it.
        //
        // Fixed at the cause rather than by letting pinch back in, which
        // would restore the escape hatch and keep the trap. pointer: coarse
        // rather than a width query: this is a touch-device behaviour, and
        // a narrow desktop window has neither the problem nor any reason to
        // have its form typography changed. Checkboxes, radios and file
        // inputs are excluded because they are never typed into and never
        // trigger it.
        "@media (pointer: coarse)": {
          "input:not([type='checkbox']):not([type='radio']):not([type='file']), textarea, select":
            {
              fontSize: "16px",
            },
        },
        "table.md, table.md th:nth-of-type(odd), table.md td:nth-of-type(odd)":
          {
            background:
              theme.colorScheme == "dark"
                ? "rgba(50, 50, 50, 0.5)"
                : "rgba(220, 220, 220, 0.5)",
          },
        "table.md td": {
          paddingLeft: "0.5em",
          paddingRight: "0.5em",
        },
        // See LegalMarkdown's ScrollableTable for why this exists. maxWidth
        // is what actually does the work: without it the wrapper simply
        // grows to its content and takes the page with it, and overflow-x
        // never gets anything to hide.
        ".md-table-scroll": {
          maxWidth: "100%",
          overflowX: "auto",
        },
      })}
    />
  );
};
export default GlobalStyle;
