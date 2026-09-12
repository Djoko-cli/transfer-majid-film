import { Box, createStyles } from "@mantine/core";
import { useEffect, useRef } from "react";
import useConfig from "../../hooks/config.hook";

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

    // Stands the ring down while something on the page is animating its
    // HEIGHT — in practice the "Advanced options" disclosure, the only such
    // transition on these routes.
    //
    // Why it is needed, measured on an iPhone 14 Pro against the real app,
    // six interleaved rounds, the disclosure verified on screen every time
    // (it is not paid when the card is scrolled out of view): the panel's
    // height transition painted a median of 9 intermediate states, range
    // 5-9, 33ms between painted frames. With the ring stood down: 12 states,
    // range 11-12, 17ms. The two ranges do not overlap.
    //
    // The mechanism is the RESIZE, not the sweep. Freezing the animation and
    // keeping the ring changed nothing; pinning the ring to a fixed height
    // and letting it keep animating recovered almost all of it. This ring is
    // `inset: -1` on a box that grows every frame, and a masked, filtered
    // box has to be re-rastered whenever its geometry changes — whether or
    // not its gradient moved. The card's own box-shadow and backdrop-filter
    // are the same shape of cost and were measured at the same order; they
    // are left alone because this one change already reaches the ceiling.
    //
    // `visibility`, specifically. `display: none` generates no box, so the
    // CSS animation is destroyed and restarts from 0deg — measured as the
    // sweep jumping BACKWARD 98 degrees across the disclosure, against +60
    // for every other variant. `opacity: 0` keeps the continuity but leaves
    // the layer alive and measured marginally worse. `visibility: hidden`
    // keeps the box, so --glint-angle keeps advancing untouched, and paints
    // nothing.
    //
    // Scoped below `sm` because that is where the cost exists: on desktop the
    // card is height-capped and scrolls internally (see SplitTransferLayout's
    // `.card`), so the disclosure never resizes it and the ring never
    // re-rasters. Standing it down there would be a quarter-second of comet
    // missing to buy nothing.
    ringSuspended: {
      [theme.fn.smallerThan("sm")]: {
        visibility: "hidden",
      },
    },
  };
});

const GlintBorder = ({ radius = 28 }: { radius?: number }) => {
  const { classes } = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  const config = useConfig();

  // Admin-controlled, because the trade is real and not ours to make for
  // every instance: standing the ring down buys a smooth disclosure on a
  // phone, and costs a visibly absent comet for the quarter-second it takes.
  //
  // Read defensively. configService.get THROWS on an unknown key, and a key
  // added to config.seed.ts does not exist until that seed has actually run
  // — which is true of every local database until someone runs it, and of
  // any instance between a deploy's code and its seed. A missing key here
  // would take down the upload page and the sign-in page, which is a far
  // worse failure than either answer to the question. Defaults to on: that
  // is the measured-better behaviour on the devices that need it.
  let pauseOnResize = true;
  try {
    pauseOnResize = config.get("performance.pauseGlintOnCardResize") !== false;
  } catch {
    // key not seeded yet — keep the default
  }

  // Listens on the document rather than being told by whoever owns the
  // disclosure. That keeps the whole mechanism inside this one component:
  // nothing is prop-drilled, no parent has to know this exists, and there is
  // no state shared between two boxes to fall out of step — which is the
  // failure mode that got AnimatedHeight removed from this card. It reacts to
  // a real event, on the real property, and toggles one class on itself.
  //
  // The class is toggled on the node directly instead of through React state:
  // this fires at the start and end of an animation whose whole problem is
  // cost per frame, and a render is not needed to set one attribute.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Turned off: make sure the ring is not left standing down from a
    // previous render, and attach nothing at all.
    if (!pauseOnResize) {
      el.classList.remove(classes.ringSuspended);
      return;
    }

    // A Set rather than a counter: transitionend fires once per property and
    // per element, and a missed event would leave a counter stuck above zero
    // forever. Keyed by element, the worst case self-corrects.
    const running = new Set<EventTarget>();
    let failsafe: number | undefined;

    const sync = () =>
      el.classList.toggle(classes.ringSuspended, running.size > 0);

    const start = (e: Event) => {
      const t = e as TransitionEvent;
      if (t.propertyName !== "height" || !t.target) return;
      running.add(t.target);
      // Purely a failsafe, not part of the timing: if an end event is ever
      // lost (an element removed mid-transition, say) the ring comes back by
      // itself rather than staying invisible for the rest of the session.
      window.clearTimeout(failsafe);
      failsafe = window.setTimeout(() => {
        running.clear();
        sync();
      }, 2000);
      sync();
    };

    const stop = (e: Event) => {
      const t = e as TransitionEvent;
      if (t.propertyName !== "height" || !t.target) return;
      running.delete(t.target);
      sync();
    };

    // Capture phase: transition events bubble, but capture also catches the
    // ones dispatched on elements inside a closed shadow tree or removed from
    // the DOM before the bubble reaches document.
    document.addEventListener("transitionrun", start, true);
    document.addEventListener("transitionend", stop, true);
    document.addEventListener("transitioncancel", stop, true);
    return () => {
      window.clearTimeout(failsafe);
      document.removeEventListener("transitionrun", start, true);
      document.removeEventListener("transitionend", stop, true);
      document.removeEventListener("transitioncancel", stop, true);
    };
  }, [classes.ringSuspended, pauseOnResize]);

  return (
    <Box ref={ref} className={classes.ring} style={{ borderRadius: radius }} />
  );
};

export default GlintBorder;
