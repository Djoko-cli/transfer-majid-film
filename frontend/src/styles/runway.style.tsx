import { Global } from "@mantine/core";
import { CSSObject } from "@mantine/core";

// The runway's own gate, so a component that has to scope a rule to "the
// runway is in force" cannot spell the test differently and drift from it.
// -webkit-touch-callout is iOS/iPadOS WebKit only, the coarse pointer keeps
// macOS Safari out, and the width matches the breakpoint every mobile
// branch in this app's layouts keys on.
export const runwayOnly = (rules: CSSObject): CSSObject => ({
  "@supports (-webkit-touch-callout: none)": {
    "@media (pointer: coarse) and (max-width: 767.98px)": rules,
  },
});

// Full-bleed runway — see components/core/FullBleedShell.tsx for why iOS
// Safari needs this and why nothing simpler works. Ported from the Review
// app (fork-freeframe @ 03e05fd, apps/web/app/globals.css), which is where
// the arrangement was chosen and measured on a real device.
//
// The geometry in one sentence: the document is one screen tall plus a park
// above and a bleed below, it is held at scrollY = park, and BOTH the
// photograph and the scroller holding the page span that whole box — from
// `reach` above the layout viewport to `bleed` below it — so everything the
// page draws lives in coordinates Safari will composite under its bars.
//
// The page is then inset back to the visible rect by padding rather than by
// its box, which is the whole trick: content comes to REST between the bars
// and SCROLLS under them, instead of stopping at a hard edge.
//
// Lives in emotion rather than a stylesheet because this app has no CSS
// files at all — everything is Mantine's emotion cache (see _app.tsx's
// `key: "mantine", prepend: true`). Same reasoning as global.style.tsx next
// to it, which is the precedent for app-wide raw CSS here.
const RunwayStyle = () => {
  return (
    <Global
      styles={{
        ":root": {
          // Each only has to be big ENOUGH; oversizing costs nothing,
          // because the page's own padding cancels it out.
          //
          // park  — where the document is parked. Must exceed the status bar
          //         (47px notch, 59px Dynamic Island, 62px on a 16 Pro), so
          //         the strip above the layout viewport maps to real document
          //         pixels rather than to y < 0. Not read from
          //         env(safe-area-inset-top): that is 0 in a normal Safari
          //         tab even under viewport-fit=cover (measured), and differs
          //         by model anyway.
          "--runway-park": "120px",
          // reach — how far above the layout viewport the boxes start. Must
          //         also exceed the status bar, and never exceed the park (or
          //         a box would start above the document).
          "--runway-reach": "96px",
          // cover — how far below one screen the PHOTOGRAPH continues. Must
          //         exceed the expanded toolbar (~98px measured), the taller
          //         of its two states and the only one this layout can be in,
          //         since an inner scroller never collapses Safari's bars.
          //         Kept tight: every pixel past the screen edge is
          //         magnification nobody sees.
          "--runway-cover": "160px",
          // rise  — how far the TOP band's box runs above the page. Free:
          //         the scroll origin is the page's top, so overflow above it
          //         is not reachable by scrolling and adds nothing to the
          //         range. Sized to put the band's end out of reach of a
          //         drag — at 640 it needs ~1780px of travel.
          "--runway-rise": "640px",
          // bleed — how far below one screen the PAGE reserves, and how far
          //         the bottom band runs. iOS rubber-bands a scroller by
          //         (1 - 1/(1 + 0.55x/D))·D for x pixels of finger, so at 160
          //         the end of the band appeared after ~120px of drag; at 640
          //         it needs ~1600px.
          "--runway-bleed": "640px",
        },

        // Everywhere except iOS Safari on a phone: no runway at all. The
        // wrappers vanish (display: contents), the page stays in normal
        // flow, and the backdrop is viewport-fixed exactly as it was. This
        // is what keeps desktop and every non-iOS browser byte-identical to
        // before the shell existed.
        ".runway": { display: "contents" },
        ".runway-backdrop": {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "100lvh",
        },
        ".runway-app, .runway-page": { display: "contents" },
        ".runway-bar-slot, .runway-foot-slot": { display: "contents" },

        // -webkit-touch-callout is iOS/iPadOS WebKit only; `pointer: coarse`
        // keeps macOS Safari out even if it ever starts claiming the
        // property. The max-width is Transfer's own doing and not in the
        // Review original: every mobile branch in this app's layouts gates on
        // Mantine's `sm` breakpoint (768px), so without it an iPad — or an
        // iPhone turned landscape — would run the runway's geometry against
        // the DESKTOP layout branch, which is the one divergence the porting
        // brief called out. Tying both gates to the same number means they
        // cannot disagree.
        "@supports (-webkit-touch-callout: none)": {
          "@media (pointer: coarse) and (max-width: 767.98px)": {
            // Scoped to a document that actually carries a runway rather
            // than to every phone page: overscroll-behavior on the root
            // propagates to the viewport, so an unscoped rule kills
            // pull-to-refresh everywhere. (This app already has an unscoped
            // one in global.style.tsx, added when the photograph was fixed
            // and did not track the rubber-band; once every runway route is
            // converted that rule is the thing to revisit.)
            "html:has(.runway)": { overscrollBehaviorY: "none" },

            ".runway": {
              display: "block",
              position: "relative",
              height: "calc(var(--runway-park) + 100dvh + var(--runway-bleed))",
              // Panning yes, zooming no — but only where the page opts in
              // (see isZoomLockedRoute). A uniform shell should not cost the
              // reading pages their zoom, so membership of the runway and
              // refusal of the pinch are two different lists. Every dimension here is derived from
              // 100dvh and from a document held at scrollY = --runway-park;
              // a pinch changes the visual viewport underneath all of it, so
              // the park fires, the centring band recomputes, and the whole
              // arrangement visibly scrabbles. Reported from the device as
              // "resizes bizarres et glitchs", and it is not a gesture this
              // surface has any use for: one card, no fine print, no map.
              //
              // Scoped to the runway on purpose. The legal pages are long
              // Markdown meant to be read and are deliberately NOT runway
              // routes (see runwayRoutes.util.ts), so zoom stays exactly
              // where it earns its keep. Disabling it is a real
              // accessibility cost (WCAG 1.4.4) and it is being paid here
              // only, knowingly.
            },

            ".runway.runway-no-zoom": {
              touchAction: "pan-x pan-y",
            },

            // Same origin, and the same reason for it: neither is fixed nor
            // sticky (either would be clipped to the layout viewport and
            // handed an opaque native colour fill at the edge it touches —
            // the black band this whole arrangement exists to remove), and
            // both start far enough above the layout viewport to cover the
            // status bar.
            ".runway-backdrop, .runway-app": {
              // Explicit and not redundant: `position: absolute` blockifies
              // most display values but NOT `contents`, which is what these
              // carry off iOS — without this the scroller generates no box.
              display: "block",
              position: "absolute",
              top: "calc(var(--runway-park) - var(--runway-reach))",
              bottom: "auto",
              left: 0,
              right: 0,
            },

            // They part company below the screen. The photograph stops just
            // past the toolbar, because its box is what object-cover scales
            // the frame to fill. The scroller runs much further, because its
            // job down there is the opposite: keeping the end of the content
            // out of reach of a drag.
            ".runway-backdrop": {
              height:
                "calc(var(--runway-reach) + 100dvh + var(--runway-cover))",
            },

            // All real scrolling happens here, so the document never moves
            // and the photograph behind it never moves either. The
            // overscroll-behavior below refuses both things that would break
            // that: chaining a scroll out to the document, which is parked
            // and cannot give up its range, and bouncing this box on its own.
            ".runway-app": {
              height:
                "calc(var(--runway-reach) + 100dvh + var(--runway-bleed))",
              overflowY: "auto",
              // `none`, not `contain`. Both refuse to chain a scroll out to
              // the document — which matters, since the document is parked
              // and has 760px of range it must never give up — but `contain`
              // still permits the container's OWN rubber-band. At rest the
              // page is exactly one screen tall and this scroller has 1px of
              // range (see .runway-page's min-height below), so every drag
              // was answered by a bounce: nothing to scroll to, yet the whole
              // screen moved and sprang back. `none` suppresses that too, so
              // a page that fits does not move at all. The cost is the
              // end-of-travel bounce once the content IS taller than the
              // screen, which on a surface this full-bleed reads as app-like
              // rather than as something missing.
              overscrollBehavior: "none",
              // The scrollport is the full-screen box, so its own edges sit
              // under Safari's bars. Without this, everything the browser
              // reveals by itself — tab focus, scrollIntoView, an in-page
              // anchor, VoiceOver, find-on-page — would align to those hidden
              // edges instead of the rect the reader can see.
              scrollPaddingTop: "var(--runway-reach)",
              scrollPaddingBottom: "var(--runway-bleed)",
            },

            ".runway-page": {
              display: "block",
              boxSizing: "border-box",
              // Insets the CONTENT to the visible rect while the scroller
              // keeps the full-screen box: at rest the page occupies exactly
              // the space between the bars, and everything above and below
              // slides under them.
              paddingTop: "var(--runway-reach)",
              paddingBottom: "var(--runway-bleed)",
              // One pixel taller than the scroller no matter how short the
              // page, so the scroller is always a scroller: overscroll-
              // behavior only applies to one, and a page that fits exactly
              // (the at-rest upload card) would otherwise hand every drag
              // straight to the document.
              minHeight: "calc(100% + 1px)",
            },

            // Sits where the page's own top edge sits, so an anchored bar
            // lands exactly where an in-flow one would. Absolute against the
            // runway's frame — and since the document never moves, the box
            // never moves either. "Anchored" becomes a geometric fact rather
            // than a value of `position`, which is exactly what spares it the
            // clipping and the opaque fill.
            ".runway-bar-slot": {
              display: "block",
              position: "absolute",
              top: "var(--runway-park)",
              left: 0,
              right: 0,
              zIndex: 20,
            },

            // The bars sit OUTSIDE the scroller, so a drag that starts on
            // one has no scrollable ancestor but the document — which is
            // parked, and which the park effect then yanks back. The result
            // is a visible lurch every time a finger lands on the header or
            // the footer and moves. Taps are unaffected; only panning from
            // these two boxes is refused, which is what a bar that does not
            // scroll should do anyway.
            ".runway-bar-slot, .runway-foot-slot": {
              touchAction: "none",
            },

            // The bottom bar's own slot, pinned to the very END of the
            // runway box — a bleed BELOW the screen, not at its edge. The
            // bar then carries that same bleed as padding, so its content
            // comes to rest exactly where `fixed; bottom: 0` put it while
            // its glass continues past the screen and Safari's own toolbar
            // sits on it. A negative margin is what the in-flow variant of
            // this band uses to give the height back; here there is nothing
            // to give back, and a negative bottom margin on a box pinned by
            // `bottom` would simply push it off the screen. Padding alone.
            ".runway-foot-slot": {
              display: "block",
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 20,
            },
          },
        },

        // Paper has no viewport to fill and no bars to hide under. Left
        // alone the page would print as a single sheet: its content lives in
        // a fixed-height overflow box, and WebKit prints only the visible
        // slice of one.
        "@media print": {
          ".runway, .runway-app, .runway-page": {
            position: "static",
            height: "auto",
            minHeight: 0,
            overflow: "visible",
            padding: 0,
          },
          // Not unwound with the others — its children are absolutely
          // positioned against it, so making it static would size them to the
          // whole page box and lay the photograph over the first sheet.
          ".runway-backdrop": { display: "none" },
        },
      }}
    />
  );
};

export default RunwayStyle;
