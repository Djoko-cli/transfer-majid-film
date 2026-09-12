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
      // The filter below was removed for a day and then put back, and the
      // round trip is worth recording because the reasoning that removed it
      // was persuasive and wrong.
      //
      // The claim was that it cost ~95% of this page's frame budget: a
      // filter is computed over the element's whole box BEFORE the mask
      // clips it, so the browser would blur and bloom a 363x1064 rectangle
      // every frame to put 2px of it on screen. The mechanism is real. The
      // numbers behind it were not — 110ms per frame with the filter, 18ms
      // without, measured in Playwright's headless WebKit, which rasterises
      // in SOFTWARE and has no GPU path for either a conic-gradient or a
      // filter. It charged full price for both. Those numbers describe that
      // harness and nothing else.
      //
      // On real hardware the declaration is free. Measured on the iOS
      // Simulator, which renders through a real GPU, with a standalone page
      // reproducing this ring, the card's backdrop-filter and a photograph
      // behind it, toggling only this one line: 17.0ms / 59fps with it,
      // 17.0ms / 59fps without. Identical. Confirmed independently from a
      // screen recording of the real phone, where the frame cadence holds a
      // steady 16.7ms throughout.
      //
      // So it comes back, by preference, since it costs nothing to keep. Two
      // things follow for whoever reads this next. Do not remove it for
      // performance; that experiment has been run. And do not trust a paint
      // or compositing number from headless WebKit on this codebase at all —
      // for anything that touches filters, gradients or backdrop-filter, the
      // simulator with an on-screen readout is the harness that works.
      //
      // (What it actually contributes visually is small: the drop-shadow's
      // 6px bloom is painted outside the 2px ring and then clipped away by
      // the mask below, so it never reaches the screen, and the blur only
      // smears the band's own 2px radial profile — 0.2-0.3% RMSE against no
      // filter, over four deterministic sweep angles with the photograph and
      // the card's glass held out of the comparison. Small, not nothing.)
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
      filter: `blur(2px) drop-shadow(0 0 6px ${accent})`,
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
