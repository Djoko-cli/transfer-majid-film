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
    },
  };
});

const GlintBorder = ({ radius = 28 }: { radius?: number }) => {
  const { classes } = useStyles();

  return <Box className={classes.ring} style={{ borderRadius: radius }} />;
};

export default GlintBorder;
