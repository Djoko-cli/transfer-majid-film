import { createStyles } from "@mantine/core";

// The submit button's glint once it's genuinely actionable (files
// selected), reusing liquidGlassKeyframes' global @keyframes (createStyles
// doesn't reliably register object-syntax @keyframes in this codebase —
// see that file, and GlintBorder for the same pattern already working
// elsewhere). A createStyles hook rather than an inline `sx` object
// specifically because `sx` is recomputed fresh on every render — with an
// infinite CSS animation, a rebuilt style object can visibly restart the
// animation mid-cycle on the next render, reading as a jump/teleport
// rather than a continuous sweep. createStyles instead memoizes its output
// by theme, so the generated class (and the animation riding on it) stays
// untouched across re-renders.
//
// The pre-selection "waiting for input" pulse lives on the Dropzone
// instead (see Dropzone.tsx's `waiting` prop) — that's the element the
// user actually needs to act on, not this button.
// Vit dans son propre module, et non dans la carte d'envoi qui l'a vu
// naître : la page d'un transfert reçu s'en sert aussi, pour « Débloquer
// pour X € » et « Télécharger tout », et l'importer depuis TransferCard
// aurait traîné toute la carte d'envoi dans le paquet que charge un simple
// destinataire. Un seul scintillement pour toutes les actions principales
// de l'application, pas trois copies qui dérivent.
//
// La @keyframes qu'il référence est posée par liquidGlassKeyframes.tsx, que
// montent SplitTransferLayout, AuthGlassLayout et GlassPageBackdrop. Un
// écran qui utiliserait ce style sans l'un d'eux n'animerait rien.
export const useSubmitButtonStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  const accent = theme.colors[theme.primaryColor][dark ? 4 : 6];

  return {
    // Once files are selected the button is genuinely actionable, so it
    // gets a glint sweep — the same idea as GlintBorder's own
    // glass-catching-light comet: a soft, blurred glow plus an
    // accent-colored drop-shadow halo, rather than a flat opaque streak,
    // which reads as a metal reflection instead of light through glass.
    //
    // The previous version placed the highlight so it sat *exactly* on a
    // computed "invisible" boundary at both loop endpoints — a gradient
    // angle that wasn't perfectly horizontal (100deg) stretches those
    // stops in a way that's hard to get pixel-exact, so the loop reset
    // showed as a visible pop right at the edges. This version keeps the
    // gradient perfectly horizontal and gives the sweep a lot more room
    // than it strictly needs (background-size 400% vs. the highlight's own
    // sliver of that width, and a travel range well past the minimum) —
    // comfortable slack rather than a razor's-edge boundary, so neither
    // gradient-angle math nor the blur's own edge bleed can push anything
    // into view right as the loop resets.
    ready: {
      position: "relative",
      overflow: "hidden",

      "&::after": {
        content: "''",
        position: "absolute",
        inset: 0,
        background: `linear-gradient(90deg,
          transparent,
          rgba(255, 255, 255, 0.5) 50%,
          transparent)`,
        backgroundSize: "400% 100%",
        backgroundRepeat: "no-repeat",
        filter: `blur(8px) drop-shadow(0 0 10px ${accent}aa)`,
        animation: "buttonShimmer 3.4s ease-in-out infinite",
      },

      "@media (prefers-reduced-motion: reduce)": {
        "&::after": { animation: "none" },
      },
    },
  };
});
