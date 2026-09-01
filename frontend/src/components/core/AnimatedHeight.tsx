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
// essentially immediately after mount) apply the real height *instantly*
// — no transition — before switching to animating every change after
// that. Only genuinely-empty-then-filled content (e.g. an upload's file
// list, nothing at mount, something once a file lands) ever wants that
// first jump animated in the first place; content that's already real
// from the very first frame (e.g. a terms gate that swaps for a dropzone
// once accepted) has no meaningful "before" state to grow in from — the
// 0 was never a real state anything chose, just this component's own
// unavoidable starting placeholder before it can measure anything at
// all. Animating it anyway reads as an unexplained empty flash on every
// load, reported by the user from their own testing.
//
// Render `null`/nothing as children to animate back down to 0 — this
// component itself must stay mounted for that to work; conditionally
// mounting/unmounting it entirely would tear down the observer along
// with any in-flight animation.
const AnimatedHeight = ({
  children,
  duration = 200,
  gapWhenOpen = 0,
}: {
  children: ReactNode;
  duration?: number;
  // Top margin to apply once there's real content, animated in lockstep
  // with height — 0 while collapsed. Exists because a flex container's own
  // `gap` charges every child equally regardless of its measured size: a
  // 0-height AnimatedHeight still "costs" a full gap on each side, which
  // reads as dead space once there's nothing after it to visually justify
  // the reservation (see TransferCard, which sets its wrapping Stack's own
  // spacing to 0 and passes this instead, for exactly that reason).
  gapWhenOpen?: number;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  // Starts true so the very first real measurement below applies with
  // `transition: none` (see skipTransition's own use in the style below)
  // — flipped off one frame later, once that height has already painted
  // without animating, so every change after this one transitions
  // normally.
  const [skipTransition, setSkipTransition] = useState(true);
  const hasMeasured = useRef(false);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      if (!hasMeasured.current) {
        hasMeasured.current = true;
        // Not this same update - flipping it off in the same one that
        // sets the first real height would apply to that very update
        // too, defeating the point. setTimeout rather than
        // requestAnimationFrame specifically: rAF is suspended entirely
        // for a hidden/backgrounded document (confirmed live - it never
        // fired at all in one), which a real visitor can easily be in
        // (opened in a background tab, not looked at yet) - this would
        // silently leave skipTransition stuck on, meaning the *next*
        // real change (the actual terms-gate swap) would also skip its
        // transition. setTimeout still runs (if throttled) rather than
        // never firing at all.
        setTimeout(() => setSkipTransition(false), 0);
      }
      setHeight(entries[0].contentRect.height);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <Box
      sx={{
        height,
        marginTop: height > 0 ? gapWhenOpen : 0,
        overflow: "hidden",
        // Natural deceleration ("confident arrival") rather than plain
        // `ease` — this only ever grows or shrinks in one direction per
        // transition, never both, so the symmetric ease-in-out most browsers
        // give `ease` reads as a slight wobble where a settling-into-place
        // curve reads as intentional. margin-top rides the same transition
        // so the gap eases in/out together with the height, not as a
        // separate jump.
        transition: skipTransition
          ? "none"
          : `height ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), margin-top ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`,

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
