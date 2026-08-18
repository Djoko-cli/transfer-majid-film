import { createStyles, useMantineTheme } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

const useStyles = createStyles(() => ({
  dash: {
    animation: "glintTravel 5s linear infinite",
  },
}));

const buildRoundedRectPath = (width: number, height: number, r: number) => {
  const w = width;
  const h = height;
  return `M ${r} 0
    L ${w - r} 0
    A ${r} ${r} 0 0 1 ${w} ${r}
    L ${w} ${h - r}
    A ${r} ${r} 0 0 1 ${w - r} ${h}
    L ${r} ${h}
    A ${r} ${r} 0 0 1 0 ${h - r}
    L 0 ${r}
    A ${r} ${r} 0 0 1 ${r} 0
    Z`;
};

// A short, bright "comet" of light that continuously travels the card's own
// rounded outline. Built from an explicit <path> with real measured pixel
// coordinates (via ResizeObserver) rather than a <rect> — pathLength
// normalization for stroke-dasharray/offset is only reliably supported by
// browsers on <path> elements; on <rect> it visibly favoured the short
// top/bottom edges over the long sides on a tall card. Traced at a 1.25px
// inset with a 2.5px stroke so it sits exactly ON the card's real border
// line — not a second, smaller ring floating inside it.
const GlintBorder = ({ radius = 28 }: { radius?: number }) => {
  const { classes } = useStyles();
  const theme = useMantineTheme();
  const accent =
    theme.colors[theme.primaryColor][theme.colorScheme === "dark" ? 4 : 6];

  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const inset = 1.25;
  const w = box.width - inset * 2;
  const h = box.height - inset * 2;
  const r = Math.max(0, Math.min(radius - inset, w / 2, h / 2));
  const path = w > 0 && h > 0 ? buildRoundedRectPath(w, h, r) : "";

  return (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 3,
        overflow: "visible",
      }}
    >
      <defs>
        <linearGradient id="transfer-glint" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      {path && (
        <path
          d={path}
          transform={`translate(${inset}, ${inset})`}
          fill="none"
          stroke="url(#transfer-glint)"
          strokeWidth={2.5}
          pathLength={1000}
          strokeDasharray="70 930"
          className={classes.dash}
        />
      )}
    </svg>
  );
};

export default GlintBorder;
