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
// Starts at height "auto" (natural, content-driven sizing — CSS's own,
// nothing measured yet) and lets the first ResizeObserver callback (firing
// essentially immediately after mount) hand off to a real pixel value
// *instantly* — no transition — before switching to animating every change
// after that. "auto" rather than a hardcoded 0: this component can't know,
// before it's measured anything, whether its children are genuinely empty
// (an upload's file list, nothing at mount) or already fully real (a terms
// gate that's already SSR-correct for a returning visitor, or any other
// content that exists from the very first frame) — 0 answered that
// question wrong for the second case, collapsing already-correct content
// to nothing and making it visibly pop in once JS caught up, which is what
// was actually still happening in the case that motivated this: reported
// by the user from a real Safari reload, caught on video, after this
// session's own faster synthetic testing missed it. "auto" answers it
// correctly for both: truly-empty children render at their natural (zero)
// size either way, and already-real children simply render at their real
// size from byte one, no measurement required to get that right. Safe to
// hand off from "auto" to a measured px value with no visible jump
// specifically because that handoff is the one update `skipTransition`
// below always applies instantly (CSS can't meaningfully animate between
// "auto" and a pixel value anyway, so this same guard that exists for the
// "no first-jump animation" reason also happens to make this handoff a
// no-op in practice — the measured value is, by construction, exactly
// what "auto" was already rendering).
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
  // undefined = not yet measured (renders at natural/"auto" height below,
  // see the style object) - a plain constant, the same on every render
  // regardless of props, which is what keeps this hydration-safe.
  const [height, setHeight] = useState<number | undefined>(undefined);
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

  // Before the first measurement, infer "is there real content" from
  // children directly rather than from height (there's no measured height
  // yet to ask) - matches every current call site's own pattern of passing
  // exactly `null` for "nothing to show" (see the doc comment above), and
  // only affects the margin, which has no hydration-safety stakes of its
  // own the way the height value itself does.
  const hasContent = height === undefined ? children != null : height > 0;

  return (
    <Box
      sx={{
        height: height ?? "auto",
        marginTop: hasContent ? gapWhenOpen : 0,
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
