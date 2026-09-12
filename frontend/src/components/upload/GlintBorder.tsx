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
      // This used to also carry `filter: blur(2px) drop-shadow(0 0 6px
      // accent)`. It was removed, but NOT for the reason the first version
      // of this comment claimed, and the record matters more than the
      // change does.
      //
      // The claim was that the filter cost ~95% of the page's frame budget,
      // on the reasoning that a filter is computed over the element's whole
      // box BEFORE the mask clips it — so the browser would blur and bloom a
      // 363x1064 rectangle every frame to show 2px of it. The reasoning is
      // sound and the numbers were real: 110ms per frame with the filter,
      // 18ms without. They were also worthless. They came from Playwright's
      // headless WebKit, which rasterises in SOFTWARE and has no GPU path
      // for a conic-gradient or a filter, so it charged full price for both.
      //
      // Re-measured on the iOS Simulator, which renders through the Mac's
      // real GPU, with a standalone page reproducing this ring, this card's
      // backdrop-filter and a real photograph behind it, toggling only this
      // one declaration: 17.0ms per frame / 59fps WITH the filter, and
      // 17.0ms / 59fps WITHOUT it. Identical. On hardware that accelerates
      // filters — which is every device this app ships to — it cost nothing
      // measurable. The user reported seeing no difference, and they were
      // right.
      //
      // It stays removed only because it was also very nearly invisible: the
      // drop-shadow's 6px bloom was painted outside the 2px ring and then
      // clipped away by the mask below (CSS applies filters before masking),
      // so it never reached the screen at all, and the blur only smeared the
      // band's own 2px radial profile. Verified as a pixel diff of the
      // isolated ring at four deterministic sweep angles, with the
      // photograph and the card's own glass held out of the comparison:
      // 0.2-0.3% RMSE. Removing it is a wash; putting it back would also be
      // a wash. Do not re-add it expecting to see anything, and do not
      // remove anything else here expecting to gain frames.
      //
      // The stops below are UNCHANGED. A first attempt widened them — a
      // low-alpha lead-in at 34deg and a two-step fade to 90deg — on the
      // theory that the blur had been softening the comet's head and tail.
      // The same pixel diff said otherwise: it made the comet visibly LONGER
      // and harder, a bright line across the whole top edge instead of a
      // glint. At this radius 2px of blur is ~0.6 degrees of arc; it was
      // never doing angular work to replace.
      //
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
