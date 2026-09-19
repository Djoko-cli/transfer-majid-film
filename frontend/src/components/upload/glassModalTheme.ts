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
      // Mantine scrolls this box, which is what put the form underneath the
      // heading in the first place. A column that does not scroll, with the
      // body scrolling inside it, is the same modal with the overlap simply
      // absent — see the header's own note for why no amount of styling on
      // the bar itself could have fixed it.
      overflow: "hidden" as const,
      display: "flex" as const,
      flexDirection: "column" as const,
    },
    // Mantine makes this header `position: sticky; top: 0` and gives it an
    // opaque background for exactly one reason: so the body scrolling under
    // it is hidden rather than showing through the title. Overriding that to
    // "transparent" restored the glass but threw away the occlusion, so on
    // any modal whose content overflows — which on a phone is most of them —
    // the form scrolled up through the heading and the two rendered on top of
    // each other. Reported on the reverse-share modal; it was never specific
    // to it, all ~24 glass modals share this object.
    //
    // It is a bar of the same glass, darkened — not a lid. Two earlier
    // attempts got that wrong in the same way, by treating this header as a
    // surface in its own right: 0.82 + blur(16), then Menu's own 0.6 +
    // blur(22). Both rendered as a flat near-black band while the body an
    // inch below showed the photograph through it.
    //
    // The reason is that this bar is NOT on the page — it is on `content`
    // above, which already carries its own fill and its own blur. A menu
    // sits directly on the page, so its 0.6 is the whole stack; here 0.6
    // composites ON TOP of the body's 0.32 (about 0.73 effective) and its
    // backdrop-filter re-blurs an already-blurred backdrop, flattening what
    // little structure survived. Copying the menu's numbers copied a value
    // out of the context that made it correct.
    //
    // So the header does not restate the material, it only shades it: a
    // plain black wash, no backdrop-filter of its own, letting `content`'s
    // glass show through darker. Compared live at 0.18 and 0.28 against the
    // flat version — 0.28 keeps the photograph visibly continuous across the
    // seam while giving the most attenuation this approach allows.
    //
    // The hairline is what actually makes the edge read as intentional, and
    // it is the one the header/footer bar already uses.
    //
    // Worth being plain about what this does not do: it attenuates content
    // scrolling underneath less than an opaque bar would. Full occlusion was
    // never on the table anyway — measured on the completed-upload modal,
    // even 0.82 left a thumbnail and its caption plainly legible under the
    // title — so the choice was only ever between looking wrong and looking
    // right.
    // A third attempt went for a light frost here — a small backdrop-filter,
    // meant to turn the text passing underneath into texture. It renders,
    // computes, and does exactly nothing, which is worth writing down so
    // nobody tries it a fourth time. `backdrop-filter` samples the backdrop
    // of its *backdrop root*, and `content` above declares one by having a
    // backdrop-filter of its own; everything painted inside that root, the
    // scrolling body included, is therefore not in this bar's backdrop at
    // all. Measured directly: with the parent's filter removed the frost
    // appeared instantly, and the modal lost its glass.
    //
    // Which made the real answer obvious. The bar never needed to hide the
    // body — the body never needed to pass under the bar. `content` no
    // longer scrolls (above), so the header is simply a row above a
    // scrolling one, and the wash below is back to being what it always
    // wanted to be: a shade, not a lid.
    header: {
      backgroundColor: dark ? "rgba(0, 0, 0, 0.28)" : "rgba(0, 0, 0, 0.07)",
      borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
    },
    // The hairline above needs air on BOTH sides of it, and the header's own
    // paddingBottom only buys the half above. Mantine forces the body's
    // padding-top to 0 whenever a header is present (a built-in
    // `:not(:only-child)` rule), so the gap below the line has to be a margin
    // — that rule does not touch margins. Measured before adding it: the
    // first element of the body started at exactly the header's bottom edge,
    // 0px under the line, so a thumbnail sat flush against it.
    body: {
      marginTop: 20,
      // The scroll lives here now. `minHeight: 0` is what lets a flex child
      // actually shrink below its content's height — without it the body
      // refuses to be smaller than its form and the whole modal grows past
      // the viewport instead of scrolling.
      overflowY: "auto" as const,
      flex: 1,
      minHeight: 0,
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
