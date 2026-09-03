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
      })}
    />
  );
};
export default GlobalStyle;
