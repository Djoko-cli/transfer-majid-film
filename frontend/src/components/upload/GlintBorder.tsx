import { createStyles, useMantineTheme } from "@mantine/core";

const useStyles = createStyles(() => ({
  dash: {
    animation: "glintTravel 6.5s linear infinite",
  },

  "@keyframes glintTravel": {
    to: { strokeDashoffset: -1000 },
  },
}));

// A short, soft "comet" of light that continuously travels the card's
// rounded outline — SVG stroke-dasharray/pathLength instead of a rotated
// conic-gradient mask, so it traces the true perimeter of a non-square,
// rounded rect without corner distortion.
const GlintBorder = ({ radius = 28 }: { radius?: number }) => {
  const { classes } = useStyles();
  const theme = useMantineTheme();
  const accent =
    theme.colors[theme.primaryColor][theme.colorScheme === "dark" ? 4 : 6];

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <defs>
        <linearGradient id="transfer-glint" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect
        x="1%"
        y="1%"
        width="98%"
        height="98%"
        rx={radius}
        ry={radius}
        fill="none"
        stroke="url(#transfer-glint)"
        strokeWidth={2}
        pathLength={1000}
        strokeDasharray="150 850"
        className={classes.dash}
      />
    </svg>
  );
};

export default GlintBorder;
