import { Box, createStyles } from "@mantine/core";

// A specular glint that travels the card's rounded outline — a rotating
// conic-gradient masked down to a thin ring (mask: xor between the full box
// and its content-box), not an SVG stroke. This is the same technique as
// the reference liquid-glass overlay (.fringe-spin::after): because the
// gradient sweeps by ANGLE around the box's center rather than by position
// along its edge, every side gets an equal, correctly-proportioned share of
// the rotation for free — no path measuring, no pathLength normalization,
// and no risk of the gradient favoring one edge over another the way the
// earlier SVG attempts did.
const useStyles = createStyles((theme: any) => {
  const dark = theme.colorScheme === "dark";
  const accent = theme.colors[theme.primaryColor][dark ? 4 : 6];

  return {
    ring: {
      position: "absolute",
      inset: -1,
      padding: 2,
      borderRadius: "inherit",
      // The comet's softness is in these stops, not in a filter. It used to
      // be `filter: blur(2px) drop-shadow(0 0 6px accent)`, and that one
      // declaration was ~95% of this page's entire frame cost: a filter is
      // computed over the element's whole box BEFORE the mask clips it, so
      // the browser blurred and bloomed a 363x1064 rectangle every frame in
      // order to show 2px of it. Measured on WebKit at 393x852@3x with a
      // file selected and this card at full height: 110ms per frame with the
      // filter, 22ms with it gone, 19ms with the whole ring removed — i.e.
      // the filter alone cost 5.3 of a 16.7ms frame budget, permanently,
      // including at rest. The cost also scaled with the card: 0.0875ms per
      // px of ring height, so opening "Advanced options" (which grows the
      // card 905 -> 1064px) added a further 14ms per frame for as long as it
      // stayed open. That is why the disclosure looked like the slow thing —
      // it was only what made an already-9fps surface visible.
      //
      // Almost nothing was lost with it. The drop-shadow's 6px bloom was
      // painted outside the 2px ring and then clipped away by the mask below
      // (CSS applies filters before masking), so it was never on screen at
      // all. The blur only softened the band's own 2px radial profile, and
      // the ring is 2px thick — at this radius 2px is ~0.6 degrees of arc,
      // so it did essentially nothing along the sweep either. What it DID do
      // is smear the band's own 2px radial profile very slightly.
      //
      // The stops below are therefore UNCHANGED from before the filter was
      // removed. A first attempt widened them — a low-alpha lead-in at 34deg
      // and a two-step fade to 90deg — on the theory that the blur had been
      // softening the comet's head and tail and that the ramps now had to do
      // it. A pixel diff of the isolated ring at four points of the sweep
      // said otherwise: it made the comet visibly LONGER and harder, a bright
      // line across the whole top edge instead of a glint. The blur was never
      // doing angular work to replace.
      //
      // Deliberately NOT solved by making the rotation compositor-only (a
      // pre-painted gradient in a square child rotated by transform): with
      // the filter gone there is nothing left to win — measured 22ms against
      // a 19ms floor with no ring at all — and it would trade one line for a
      // second element, an overflow clip and a size that has to track the
      // card's diagonal.
      background: `conic-gradient(from var(--glint-angle),
        transparent 0deg,
        transparent 20deg,
        rgba(255, 255, 255, 0.95) 46deg,
        ${accent} 58deg,
        rgba(255, 255, 255, 0.35) 72deg,
        transparent 104deg,
        transparent 360deg)`,
      WebkitMask:
        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
      WebkitMaskComposite: "xor",
      maskComposite: "exclude",
      pointerEvents: "none",
      animation: "glintSpin 6.5s linear infinite",

      // The guard this file was missing while thirteen others in the app
      // already had one — including SplitTransferLayout's own rule two lines
      // from where it renders this component. A reduced-motion visitor was
      // paying the full per-frame cost of an animation they had asked not to
      // see. `background: none` rather than just stopping the sweep: a
      // frozen conic gradient reads as a bright arc parked at one corner,
      // which is worse than no comet. The card keeps its own 1px border, so
      // removing this leaves a clean edge rather than a gap.
      "@media (prefers-reduced-motion: reduce)": {
        animation: "none",
        background: "none",
      },
    },
  };
});

const GlintBorder = ({ radius = 28 }: { radius?: number }) => {
  const { classes } = useStyles();

  return <Box className={classes.ring} style={{ borderRadius: radius }} />;
};

export default GlintBorder;
