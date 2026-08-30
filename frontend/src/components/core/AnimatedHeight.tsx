import { Box } from "@mantine/core";
import { ReactNode, useEffect, useRef, useState } from "react";

// Smoothly animates its content's height on every change, not just a
// single open/close toggle — Mantine's own <Collapse> only re-measures
// and animates when its `in` prop flips, so content that keeps growing or
// shrinking while already open (e.g. a table gaining/losing rows one file
// at a time) still jumps on every change after the first. A
// ResizeObserver tracks the real content height continuously instead, so
// whatever caused the change — one file added, three removed at once,
// the first file ever, the last one leaving — animates the same way.
//
// Starts at height 0 and lets the first ResizeObserver callback (firing
// essentially immediately after mount) animate up to the real height, so
// content appearing for the first time still grows in rather than
// snapping to full size. Render `null`/nothing as children to animate
// back down to 0 — this component itself must stay mounted for that to
// work; conditionally mounting/unmounting it entirely would tear down
// the observer along with any in-flight animation.
const AnimatedHeight = ({
  children,
  duration = 200,
}: {
  children: ReactNode;
  duration?: number;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      setHeight(entries[0].contentRect.height);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <Box
      sx={{
        height,
        overflow: "hidden",
        // Natural deceleration ("confident arrival") rather than plain
        // `ease` — this only ever grows or shrinks in one direction per
        // transition, never both, so the symmetric ease-in-out most browsers
        // give `ease` reads as a slight wobble where a settling-into-place
        // curve reads as intentional.
        transition: `height ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`,

        "@media (prefers-reduced-motion: reduce)": {
          // Still a real state change — content becomes visible/hidden and
          // the layout still reflows — just without the animated grow/
          // shrink, which is exactly the spatial movement reduced-motion
          // visitors opt out of. Near-zero rather than `none`: a hard cut
          // still reads as an intentional state change rather than a
          // layout glitch.
          transitionDuration: "0.01ms",
        },
      }}
    >
      <div ref={contentRef}>{children}</div>
    </Box>
  );
};

export default AnimatedHeight;
