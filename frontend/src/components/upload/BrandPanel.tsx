import {
  ActionIcon,
  Anchor,
  Box,
  Group,
  Text,
  createStyles,
  useMantineTheme,
} from "@mantine/core";
import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FormattedMessage } from "react-intl";
import { TbPlayerPause, TbPlayerPlay } from "react-icons/tb";
import { PROJECTS } from "../../data/brandProjects";
import useTranslate from "../../hooks/useTranslate.hook";
import { createPortal } from "react-dom";
import { useBackdropSlot, usePageEndSlot } from "../core/FullBleedShell";
import brandSlideService from "../../services/brandSlide.service";
import {
  BrandCatalogProject,
  DisabledBrandSlide,
} from "../../types/brandSlide.type";

const SLIDE_DURATION_MS = 10000;
const TRANSITION_MS = 900;
// Worst-case delay the admin-curated exclusion list (see the mount effect
// below) is allowed to add before the very first slide reveals — a fixed,
// small bound regardless of network conditions, rather than however long a
// slow connection happens to take. Falls through to showing everything
// either way past this point (or on an outright fetch error) — this is a
// curatorial feature, never a takedown, so an unfiltered panel is always a
// safe fallback and a blank one never is.
const DISABLED_FETCH_TIMEOUT_MS = 400;
// How long the settled slide's own slow zoom-in takes — sized to the
// remaining dwell time (total minus the slide transition itself) so it
// reads as reaching (and then holding, see .living below) its target right
// as that slide's turn ends, not visibly rushing or idling.
const LIVING_DURATION_MS = SLIDE_DURATION_MS - TRANSITION_MS;

// Standard breakpoint set derived (and downloaded, both avif+webp) from
// majid.film's own responsive derivatives for each still — see
// `public/img/brand/derived/`. Width availability is a property of each
// individual source photo (its native resolution), not of the project as a
// whole, so a project's stills can each need their own override — `kalou`'s
// s4/s5 top out at 2228px while its s1-s3 reach 4096px, for instance.
const STANDARD_WIDTHS = [640, 1280, 2048, 3840];

// PROJECTS itself lives in data/brandProjects.ts, not here — shared as-is
// with pages/admin/brand.tsx (the curation page that picks which of these
// stills actually reach the rotation below), rather than kept as two
// copies that could drift apart.

// One flattened slide, whichever catalog it came from. `source` decides
// which URL scheme buildSrcSet resolves it through below — the two
// catalogs are otherwise shaped identically once flattened.
type BrandSlide = {
  slug: string;
  still: number;
  title: string;
  year: string;
  widths: number[];
  source: "static" | "synced";
};

// The bundled fallback: flattened to one slide per (project, still) pair,
// every still of a project sharing its title/year/credit-link but getting
// its own unique key and resolved width list — unchanged behavior from
// before this catalog became syncable, just renamed (was SLIDES) to make
// clear it's a fallback now, not the source of truth. Used whenever the
// live/synced catalog (below) is empty — not yet synced from majid.film,
// or the sync pipeline unavailable — so the public panel never has
// nothing to show. See the mount effect further down for how the two are
// chosen between.
const STATIC_SLIDES: BrandSlide[] = PROJECTS.flatMap((project) => {
  const stills = project.stillWidths
    ? Object.entries(project.stillWidths).map(([still, widths]) => ({
        still: Number(still),
        widths,
      }))
    : (project.stills ?? []).map((still) => ({
        still,
        widths: project.widths ?? STANDARD_WIDTHS,
      }));

  return stills.map(({ still, widths }) => ({
    slug: project.slug,
    still,
    title: project.title,
    year: project.year,
    widths,
    source: "static" as const,
  }));
});

const slideKey = (slide: { slug: string; still: number }) =>
  `${slide.slug}-s${slide.still}`;

// The bundled fallback, addressable two ways: by exact key, and by project.
// Both are needed. Measured against the live catalog: of 407 synced slides
// only 106 — 26% — have a still with the same number in the bundled set,
// because the sync records every still majid.film publishes while the
// bundle carries a curated handful. Exact-match-only would therefore have
// rescued a quarter of them and left the rest black, which is most of the
// point of having a fallback at all. Every synced project does have SOME
// bundled still, so falling back to another still of the same film rescues
// 100% of them.
const STATIC_BY_KEY = new Map(STATIC_SLIDES.map((s) => [slideKey(s), s]));
const STATIC_BY_SLUG = STATIC_SLIDES.reduce((map, slide) => {
  const list = map.get(slide.slug);
  if (list) list.push(slide);
  else map.set(slide.slug, [slide]);
  return map;
}, new Map<string, BrandSlide[]>());

// Part two of the fallback. getCatalog already withholds the whole catalog
// when NO synced image can be served (see brandSlides.service.ts) — that
// covers the mount being gone. It deliberately does not cover PARTIAL rot:
// one project whose folder moved on majid.film's side still passes that
// check, and used to leave a single black slide in the rotation with no way
// back. A per-image failure is the only honest signal for that case, because
// nothing on the server knows a file is missing until someone asks for it.
//
// Swapped in place rather than dropped from the rotation: removing a slide
// would shift every index under a carousel whose timing, preloading and
// "which slide is next" logic are all index-based. Same length, same
// indices, one different picture. A synced slide with no static twin keeps
// its broken image and rotates on in a few seconds, which is worth less
// than the risk of reindexing mid-cycle.
const resolveSlide = (slide: BrandSlide, unservable: ReadonlySet<string>) => {
  const key = slideKey(slide);
  if (slide.source !== "synced" || !unservable.has(key)) return slide;
  // Same still if the bundle has it, otherwise another still of the same
  // film — never a different film, because the caption beside the picture
  // names the project and would then be lying. [0] rather than a random
  // pick: this runs on every render, and a different answer each time would
  // reshuffle the picture under the reader.
  return STATIC_BY_KEY.get(key) ?? STATIC_BY_SLUG.get(slide.slug)?.[0] ?? slide;
};

// Same flattening as STATIC_SLIDES above, just simpler: the backend's own
// GET catalog already resolves each still's widths directly (no
// stills/stillWidths branching to redo client-side).
const flattenCatalog = (catalog: BrandCatalogProject[]): BrandSlide[] =>
  catalog.flatMap((project) =>
    project.stills.map((s) => ({
      slug: project.slug,
      still: s.still,
      title: project.title,
      year: project.year,
      widths: s.widths,
      source: "synced" as const,
    })),
  );

// The image panel is always full-bleed (100vw) at every breakpoint in this
// layout — the glass card floats on top of it via absolute positioning
// rather than sharing the image's own layout width — so the browser only
// ever needs to weigh candidates against the viewport width itself.
const SIZES = "100vw";

// A 1x1 transparent GIF. Pointing an <img> at this is what actually releases
// the bitmap it was holding: removing the element from the document does not,
// because the decoded frame belongs to WebKit's own image cache and survives
// its last DOM client. Measured: a slideshow walking 106 distinct photographs
// grew by one decoded image per slide, for ever, and that is what killed the
// tab on a phone. See the release effect in Slide.
const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// The one place the two catalogs' different URL schemes meet: the static
// fallback's images ship in the Next.js build (public/img/brand/derived/),
// the synced catalog's are streamed by the backend from wherever
// BrandSyncService symlinked them (see brandSlide.service.ts's own
// getImageUrl, same path shape as this one).
const imageUrl = (
  slug: string,
  still: number,
  width: number,
  format: "avif" | "webp",
  source: BrandSlide["source"],
) =>
  source === "static"
    ? `/img/brand/derived/${slug}-s${still}-${width}.${format}`
    : brandSlideService.getImageUrl(slug, still, width, format);

const buildSrcSet = (
  slug: string,
  still: number,
  widths: number[],
  format: "avif" | "webp",
  source: BrandSlide["source"],
) =>
  widths
    .map((w) => `${imageUrl(slug, still, w, format, source)} ${w}w`)
    .join(", ");

// Fisher-Yates — done client-side only (see effect below) so the server and
// the first client render agree, avoiding a hydration mismatch.
const shuffle = <T,>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Random order, but with two guarantees a plain shuffle() doesn't give:
// no two slides from the same project back to back (see below for why
// that matters more the bigger a project is), and every project gets a
// turn early, not just the biggest ones.
//
// Two earlier versions of this (see git history) each got one guarantee
// right and broke the other:
//
// 1. Greedy by raw remaining count - always place from whichever project
//    has the *most stills left*. Provably zero adjacency violations, but
//    with battle at 70 stills against most projects' 5-10, battle (and
//    whichever project is briefly the runner-up) stays "the biggest
//    remaining" for a very long stretch, dominating the front of the
//    sequence - small projects only get a turn once the big ones are
//    nearly exhausted. Reported by the user from their own viewing: it
//    read as an alternation of three or four big projects, not a real
//    rotation.
//
// 2. Fair round-robin - shuffle the visiting order of every project that
//    still has stills left, take one from each, repeat. Fixed the
//    fairness problem (round 1 alone puts every project on screen once),
//    but broke adjacency-safety once group sizes diverge enough: once
//    every small project runs dry, a round can end up with only *one*
//    project left (e.g. battle alone, 23 stills past dbba's own 47) -
//    with nothing else to interleave against, its remaining stills come
//    out back to back for the rest of the sequence, in every single one
//    of those remaining rounds.
//
// The fix is a small change to (1), not a different algorithm: compare
// each project's remaining stills as a *fraction of its own total*
// (remaining / original), not a raw count. Every untouched project sits
// at fraction 1.0 - strictly higher than anything already touched - so
// the first (project count) picks are still guaranteed to be every
// project once each, exactly like round-robin's round 1. But because
// priority is never pinned to "must complete a full round before
// repeating anyone," the algorithm keeps interleaving whichever two-plus
// projects are still active for as long as more than one has anything
// left - the round-robin failure mode (one project alone, dumping its
// remainder consecutively) can only happen when it's genuinely
// unavoidable, i.e. truly only one project has any stills left at all.
// Verified by simulation against this catalog's real size distribution:
// 5000 trials, zero adjacency violations, every project's worst-case
// first appearance across all 5000 runs landing at exactly index
// (project count - 1) - the last slot of the guaranteed-fair first
// round, never later.
const shuffleFairRotation = (slides: BrandSlide[]): BrandSlide[] => {
  if (slides.length < 3) return shuffle(slides);

  const bySlug = new Map<string, BrandSlide[]>();
  for (const slide of slides) {
    const group = bySlug.get(slide.slug);
    if (group) group.push(slide);
    else bySlug.set(slide.slug, [slide]);
  }
  // Each project's own stills, shuffled once - which specific stills
  // surface, and in what order, stays random even though which *project*
  // gets the next turn follows the fixed fairness rule below. Popped
  // from the end (cheap, and the shuffle already randomized the order,
  // so which end doesn't matter).
  const groups = [...bySlug.values()].map((group) => shuffle(group));
  // Original size per group, to compute "fraction remaining" below -
  // keyed by object identity (each group's own array), not by slug, so
  // no separate lookup step is needed once inside the picking loop.
  const originalSize = new Map(groups.map((group) => [group, group.length]));

  const result: BrandSlide[] = [];
  let lastSlug: string | null = null;
  while (result.length < slides.length) {
    // Re-shuffled on every single pick, not just once - otherwise every
    // *tie* (any two untouched projects both sitting at fraction 1.0,
    // which is most of them for most of the run) would always resolve
    // in favor of whichever project happened to land first in one fixed
    // initial shuffle, rather than being genuinely random.
    let pick: BrandSlide[] | null = null;
    let pickFraction = -1;
    for (const group of shuffle(groups)) {
      if (group.length === 0 || group.at(-1)!.slug === lastSlug) continue;
      const fraction = group.length / originalSize.get(group)!;
      if (fraction > pickFraction) {
        pick = group;
        pickFraction = fraction;
      }
    }
    // Every remaining group is the one just placed - only possible if a
    // single project so dominates the curated set that a valid
    // arrangement can't exist (e.g. it's the only project left enabled).
    // Falls back to repeating rather than looping forever; this is a
    // best-effort guarantee, not enforced for a curation choice that
    // makes it mathematically impossible to keep.
    pick ??= groups.find((group) => group.length > 0)!;
    const slide = pick.pop()!;
    result.push(slide);
    lastSlug = slide.slug;
  }

  // The carousel loops (see the interval effect below), so the seam
  // between the very last slide placed and the very first is a real
  // adjacency too. Searches *backward* from the end rather than forward
  // from the start - a forward search can find its fix arbitrarily close
  // to the beginning, swapping a late-sequence slide into an early
  // position and quietly wrecking the fairness guarantee above (caught
  // by simulation: an early version searched forward and let a handful
  // of small projects' first appearance land as late as index 146).
  // Searching backward instead resolves right next to the actual
  // conflict, at the very end, where disturbing order doesn't matter.
  const n = result.length;
  if (result[0].slug === result[n - 1].slug) {
    for (let i = n - 2; i >= 1; i--) {
      [result[i], result[n - 1]] = [result[n - 1], result[i]];
      const resolved =
        result[i - 1].slug !== result[i].slug &&
        result[i].slug !== result[i + 1].slug &&
        result[n - 2].slug !== result[n - 1].slug &&
        result[n - 1].slug !== result[0].slug;
      if (resolved) break;
      [result[i], result[n - 1]] = [result[n - 1], result[i]]; // undo
    }
  }

  return result;
};

// Shortest signed distance between two indices on a circular track of the
// given length, e.g. going from the last slide to the first is a +1 step,
// not a jump all the way back — that's what keeps the loop feeling
// continuous instead of snapping backwards once per cycle.
const cyclicDelta = (from: number, to: number, length: number) => {
  let delta = to - from;
  if (delta > length / 2) delta -= length;
  if (delta < -length / 2) delta += length;
  return delta;
};

const useStyles = createStyles(
  (theme, { isPaused }: { isPaused: boolean }) => ({
    panel: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      backgroundColor: theme.colors.dark[8],

      // Was a 240px inline banner the visitor scrolled past in one flick,
      // never to see again — the one thing that sets this app apart from a
      // generic file-transfer tool was effectively invisible on mobile. Fixed
      // full-screen instead, same
      // as desktop's own `position: absolute` base above, just switched to
      // `fixed` since `.bleed` is back in normal document flow at this size
      // (position:fixed pins to the viewport regardless of the parent). The
      // mobile menu is a floating overlay (see Header.tsx's mobileMenuReveal)
      // rather than something that pushes page content around, so this
      // never needs to compensate for anything while the menu opens/closes
      // — it just always resolves against the true viewport.
      [theme.fn.smallerThan("sm")]: {
        position: "fixed",
        inset: 0,
        height: "100dvh",
      },
    },

    // Inside a runway backdrop the panel must NOT be fixed: that is the
    // whole point of the arrangement — a fixed layer is clipped to the
    // layout viewport and handed an opaque native fill at the edge it
    // touches, which is the black band. Filling the backdrop box instead
    // makes the photograph ordinary content that reaches under the bars.
    panelInRunway: {
      [theme.fn.smallerThan("sm")]: {
        position: "absolute",
        inset: 0,
        height: "auto",
      },
    },

    slide: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    },

    // Sized slightly larger than its wrapper so the gentle zoom below never
    // uncovers an edge — the slide's own overflow:hidden clips it back down.
    slideImageWrap: {
      position: "absolute",
      inset: "-4%",
    },

    slideImage: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center",
    },

    // Unconditional on isActive (only reduced-motion turns it off, in the
    // Slide component below) — deliberately not removed the instant a slide
    // stops being current. The previous version did remove it then, which
    // stopped the animation from controlling `transform` and snapped it
    // straight back to scale(1) with nothing to ease the change: a real,
    // visible "de-zoom" flash on the outgoing slide, right as it started
    // sliding away.
    //
    // The fix isn't reversing the zoom on exit at all — it's not needing to.
    // Once a slide stops being current, this box is simply never touched
    // again until Slide's own key bumps on its *next* activation and mounts
    // a fresh instance: it keeps whatever scale it last reached (held
    // indefinitely by fill: forwards below, all the way through sliding
    // off-screen and however long it sits inactive after that), and the new
    // instance for the *next* slide starts its own animation from a clean
    // scale(1) simply by virtue of being a brand new element — a @keyframes
    // animation applied to a freshly-mounted node always plays from its own
    // `from` state, no extra reset step required the way a transition would
    // need one (nothing to interpolate *from* on a node that didn't exist a
    // moment ago).
    living: {
      animation: `gentleZoom ${LIVING_DURATION_MS}ms linear ${TRANSITION_MS}ms forwards`,
      // The pause button (see BrandPanel's own isPaused) only ever gated
      // the interval that advances `current` - it had no connection to
      // this CSS animation at all, which runs on the browser's own
      // compositor timeline regardless of React/JS state. Reported by the
      // user: pausing stopped the slide from changing but the zoom kept
      // visibly animating in real time underneath it. animation-play-state
      // is the correct primitive for this - unlike removing the class
      // (which would lose the current scale and restart from 1 on
      // resume), "paused" freezes the animation at its exact current
      // computed value and resumes from precisely there.
      animationPlayState: isPaused ? "paused" : "running",
    },

    // On tall content the transfer card (z-index 2, see SplitTransferLayout)
    // can reach far enough down to visually and functionally sit over this
    // bottom-left corner of the image, swallowing clicks meant for the credit
    // link underneath it. Because this box has its own z-index, it's a
    // stacking context — a descendant's z-index (however high) is scoped
    // *inside* it and can never outrank a sibling subtree like the card, only
    // raising this box's own z-index above the card's actually escapes that.
    // pointer-events: none here then lets clicks fall through everywhere in
    // this now-higher box (to the card, if it's there, or the image) except
    // where the link re-enables itself below, so the rest of the caption
    // never blocks the card's own controls just because it now paints above.
    caption: {
      // Rendered as a sibling of `.panel`, not nested inside it (see
      // BrandPanel's return) — `position: fixed` on `.panel` for the mobile
      // backdrop always creates its own stacking context (unlike absolute/
      // relative without an explicit z-index, which don't), so a caption
      // nested inside it would have its z-index:3 trapped there, comparable
      // only to other things inside `.panel` and never able to outrank the
      // card sitting outside it — this is the same stacking-context
      // constraint the comment above (on the wrapper this used to sit in)
      // already worked around for the desktop case, just reintroduced by
      // `.panel` switching to `fixed`.
      position: "absolute",
      left: 0,
      right: 0,
      // Sits just above the fixed, translucent footer (see Footer.tsx)
      // rather than at the panel's own true bottom edge — since that footer
      // now floats on top of the image (z-index 100) with the image showing
      // through its glass, a caption placed underneath it would be readable
      // only as a faint blur, not legible text.
      bottom: "var(--footer-height, 40px)",
      padding: `${theme.spacing.xl} ${theme.spacing.lg} ${theme.spacing.md}`,
      zIndex: 3,
      pointerEvents: "none",
      textAlign: "right",
      // A text-shadow (inherited by the Text/Anchor children) keeps the
      // credit legible against a busy photo without painting a visible dark
      // rectangle behind it the way a background scrim would. A third, tight
      // layer added on top of the original two — measured contrast against a
      // bright slide was still marginal with just the outer glow alone.
      textShadow:
        "0 1px 2px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.8), 0 1px 12px rgba(0, 0, 0, 0.5)",

      // On a phone the credit keeps its place bottom-right, but it can only
      // be there if the layout has actually made room for it: the card spans
      // nearly the full width here, so anything painted over that strip would
      // land on the submit button. It does not take the room by force — the
      // height published below is subtracted from the band the card centres
      // in (see MOBILE_BAND in SplitTransferLayout and AuthGlassLayout), the
      // same mechanism the footer and the cookie notice already use. The card
      // is therefore centred in what is left, and the two cannot meet.
      //
      // Tighter padding than the desktop's, because that room is not free —
      // it comes off the card's own breathing space.
      [theme.fn.smallerThan("sm")]: {
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,

        // Anchored one clearance BELOW the bottom of the box the card lives
        // in — the strip the page reserves for it (see _app's paddingBottom,
        // which adds exactly what the band subtracts). That box grows with the
        // card, so the credit follows the card's own end, which is where it
        // belongs.
        bottom: "calc(-1 * var(--brand-caption-clearance, 0px))",
      },

      // Below this height there is nothing left to give. The band is
      // 100dvh minus header (60), menu spacer (24) and footer (54); at 640px
      // that leaves 502 for a card measuring 380 at rest, so reserving ~60
      // for this still keeps 31px of margin each side, above the 8px floor.
      // At 568 the card alone already fills the band. Hidden rather than
      // overlapping, and hidden rather than pushing the page into a scroll
      // that a lot of measured work went into removing.
      "@media (max-width: 48em) and (max-height: 639px)": {
        display: "none",
      },
    },

    // The same credit, laid out instead of positioned — the last element of
    // the page, inside the scroller. No anchor, no offset and nothing to
    // hide from: an element in the flow covers nobody, so it can simply
    // stay visible and leave with the page.
    //
    // `pointerEvents: none` on the box with it restored on the two controls
    // inside (see .captionLink and .pauseButton): the strip runs the full
    // width of the page and would otherwise swallow taps aimed at whatever
    // is beside the text.
    captionInFlow: {
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      textAlign: "right",
      pointerEvents: "none",
      textShadow:
        "0 1px 2px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.8), 0 1px 12px rgba(0, 0, 0, 0.5)",

      // The same floor as `.caption`'s, and it has to be spelled here too:
      // the two classes are alternatives, so a rule on one says nothing about
      // the other, and a phone short enough to hit this is exactly a phone the
      // runway is switched on for. The band the card centres in is already
      // full at this height, and the clearance the caption publishes would be
      // taken out of the card rather than out of slack that exists.
      // Disappearing costs less than a card that no longer fits.
      "@media (max-height: 639px)": {
        display: "none",
      },
    },

    captionLink: {
      pointerEvents: "auto",
    },

    pauseButton: {
      pointerEvents: "auto",
      color: theme.white,
      filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))",
    },
  }),
);

// One instance per slide, mounted once and never torn down for the whole
// session — only its own zoom wrapper (see `activation` below) remounts,
// on activation, which is the one moment that needs a clean slate.
const Slide = ({
  slide,
  delta,
  isActive,
  prefersReducedMotion,
  isPaused,
  onUnservable,
}: {
  slide: BrandSlide;
  delta: number;
  isActive: boolean;
  prefersReducedMotion: boolean;
  isPaused: boolean;
  onUnservable: (slide: BrandSlide) => void;
}) => {
  const { classes, cx } = useStyles({ isPaused });

  // Bumped only the instant this slide transitions from inactive to
  // active (including the very first time, for whichever slide starts
  // active on mount) — its own value doesn't matter beyond that, it's used
  // purely as a key to force slideImageWrap to remount right then. That
  // remount is what gives gentleZoom a clean scale(1) start every cycle;
  // deliberately NOT bumped on the reverse transition — see .living's own
  // comment for why deactivating shouldn't touch this box at all.
  //
  // Also gates .living itself (0 means "never activated yet"): with 106+
  // slides all mounted from the start but only one active at a time, most
  // sit off-screen for minutes before their first turn — applying the
  // animation unconditionally from mount would let it run (and, held by
  // fill: forwards, finish) invisibly in the background for every slide
  // waiting its turn, so by the time each one actually became active for
  // the first time it'd already be sitting at scale(1.07) instead of
  // starting the zoom fresh.
  //
  // useLayoutEffect rather than useEffect specifically so the bump (and
  // the remount + class it triggers) happen before the browser paints the
  // frame where isActive just became true, not after — Slide only ever
  // renders client-side (see BrandPanel's isReady gate), so there's no SSR
  // mismatch risk in skipping useEffect's until-after-paint deferral here.
  const [activation, setActivation] = useState(0);
  useLayoutEffect(() => {
    if (isActive) setActivation((a) => a + 1);
  }, [isActive]);

  // Hands the decoded photograph back when this slide leaves the mounting
  // window.
  //
  // Unmounting alone does not do it. The decoded frame belongs to WebKit's
  // own image cache, keyed by URL, and detaching the last element that
  // referenced it leaves the entry in place. A carousel walking 106 distinct
  // photographs therefore grew by one decoded image per slide, for ever.
  //
  // Measured on the Simulator against a rig that reproduces production's own
  // image delivery: 104 -> 197 MB over eight minutes without this, 99 -> 100
  // with it. The dips in the untreated run are WebKit evicting frames under
  // pressure, which is the same thing that made the photograph go black on a
  // real phone shortly before the tab was killed.
  //
  // The <source> elements are cleared too: <picture> resolves the image from
  // them, so an <img> pointed at a blank pixel while its sources still name
  // an avif would simply be resolved straight back to it.
  //
  // The node is captured in the effect body rather than read from the ref in
  // the cleanup: React nulls a ref before destroy functions run on unmount,
  // so reading it there would find nothing.
  const releaseRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = releaseRef.current;
    return () => {
      if (!box) return;
      box
        .querySelectorAll("source")
        .forEach((source) => source.removeAttribute("srcset"));
      const image = box.querySelector("img");
      if (!image) return;
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.src = BLANK_PIXEL;
    };
  }, []);

  return (
    <Box
      ref={releaseRef}
      className={classes.slide}
      style={{
        transform: `translateX(${delta * 100}%)`,
        transition: prefersReducedMotion ? "none" : undefined,
      }}
    >
      <Box
        key={activation}
        className={cx(classes.slideImageWrap, {
          [classes.living]: activation > 0 && !prefersReducedMotion,
        })}
      >
        <picture>
          <source
            type="image/avif"
            srcSet={buildSrcSet(
              slide.slug,
              slide.still,
              slide.widths,
              "avif",
              slide.source,
            )}
            sizes={SIZES}
          />
          <source
            type="image/webp"
            srcSet={buildSrcSet(
              slide.slug,
              slide.still,
              slide.widths,
              "webp",
              slide.source,
            )}
            sizes={SIZES}
          />
          <img
            className={classes.slideImage}
            src={imageUrl(
              slide.slug,
              slide.still,
              // Index 1 (1280px) on the static fallback, which always has
              // all 4 STANDARD_WIDTHS — but the synced catalog only
              // records widths that actually had a complete avif+webp
              // pair on majid.film's side, so this falls back to
              // whatever's smallest rather than assuming a 2nd entry
              // exists.
              slide.widths[1] ?? slide.widths[0],
              "webp",
              slide.source,
            )}
            alt=""
            // <picture> does not fall through: once the browser has picked a
            // <source> it does not try the next one if that image fails, it
            // fires error here. So this is the single place any of the three
            // candidates failing shows up.
            onError={() => onUnservable(slide)}
            // Eager for the slide right after this one too (delta === 1),
            // not just the active one — otherwise the *only* thing asking
            // the browser to fetch it ahead of time is the native
            // loading="lazy" heuristic, which decides "near enough to the
            // viewport to bother" using the element's own transformed
            // position (every slide sits at inset:0, translated off-screen
            // by transform, not laid out off-screen) and — the part that
            // actually matters here — narrows that distance on a detected
            // slow connection specifically, the opposite of what a slow
            // network needs. Eager removes the guesswork: from the moment
            // a slide becomes "next", it has this slide's entire ~9s dwell
            // time to finish fetching, not just whatever's left once the
            // heuristic decides to start.
            loading={isActive || delta === 1 ? "eager" : "lazy"}
            decoding="async"
          />
        </picture>
      </Box>
    </Box>
  );
};

const BrandPanel = ({
  showCaption = true,
  // Off when the CALLER is already portalling into the backdrop slot and
  // needs this to land inside its own tree rather than alongside it — see
  // GlassPageBackdrop, which has a scrim that must stay on top of the
  // photograph and cannot if the two arrive in the slot as siblings whose
  // order depends on which effect ran first.
  portalToBackdrop = true,
}: {
  showCaption?: boolean;
  portalToBackdrop?: boolean;
}) => {
  // When a full-bleed runway is above us it owns a backdrop box that starts
  // above the layout viewport and runs past its bottom (see FullBleedShell).
  // The photograph belongs in there rather than here: that box is ordinary
  // absolute content, so it reaches under Safari's bars, which a fixed layer
  // can never do.
  const backdropSlot = useBackdropSlot();

  // On the runway the credit is portaled to the END OF THE PAGE — inside the
  // scroller, as its last element — rather than being positioned anywhere.
  //
  // It used to go into the footer's anchored slot, which put it at the bottom
  // of the SCREEN and therefore permanently over whatever was scrolling
  // underneath. That needed a rule to hide it for the whole of a tall page's
  // travel so it would not sit across the message field, and the result, seen
  // on a real phone, was a credit that blinked out the moment you started
  // scrolling and only came back at the very bottom. Reported exactly that
  // way, with a recording.
  //
  // In the flow it has no one to cover, so there is nothing to hide from and
  // no offset to compute: it is simply the last thing on the page, and it
  // leaves with the rest of it.
  const pageEndSlot = usePageEndSlot();
  const withPageEnd = (node: ReactNode) =>
    pageEndSlot ? createPortal(node, pageEndSlot) : node;
  const theme = useMantineTheme();
  const t = useTranslate();

  const [order, setOrder] = useState<BrandSlide[]>(STATIC_SLIDES);
  // Synced slides whose image the browser could not load. Keyed, not
  // indexed, so it survives a reshuffle. See resolveSlide above.
  const [unservable, setUnservable] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markUnservable = useCallback((slide: BrandSlide) => {
    if (slide.source !== "synced") return;
    const key = slideKey(slide);
    setUnservable((previous) => {
      if (previous.has(key)) return previous; // same Set, no re-render
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  }, []);
  const [current, setCurrent] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  // Lets any visitor stop the rotation, not just reduced-motion users —
  // see the interval effect below, which is also gated on this.
  const [isPaused, setIsPaused] = useState(false);

  // Publishes the strip the credit occupies, so the two mobile layouts can
  // subtract it from the band their card centres in — the same contract
  // Footer and CookieNotice already use, and the reason the credit can sit
  // bottom-right on a phone without ever meeting the submit button.
  //
  // A callback ref rather than useRef: the caption mounts a render or more
  // after this component does (it waits on isReady and a resolved slide), and
  // an effect keyed on a ref's .current would never re-run to notice. Keyed on
  // the node, it runs exactly twice — when the caption appears and when it
  // goes — instead of on every one of this carousel's re-renders.
  //
  // Guarded on showCaption because more than one BrandPanel can be mounted at
  // once: GlassPageBackdrop renders a second one with showCaption={false}, and
  // without this guard that instance would publish its own 0px over the real
  // value, collapsing the band's reservation at random depending on render
  // order. An instance with no caption has nothing to say about this variable.
  const [captionNode, setCaptionNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showCaption) return;
    // Only in the mobile arrangement. Above "sm" the credit sits in a band of
    // its own fixed height and needs nothing reserved for it — publishing its
    // height there had the page reserve a strip nothing uses: 84px of phantom
    // scroll at 1200x800 with no file, measured.
    const isMobileArrangement = () =>
      window.matchMedia("(max-width: 48em)").matches;

    // Two variables, because the credit now asks two different things of two
    // different readers, and one number could only ever answer one of them.
    //
    // --brand-caption-clearance means "something FLOATS above the footer,
    // keep a strip of screen clear for it". Both the centring band and the
    // page's own bottom padding read it, and they cancel: the band gives up
    // exactly what the padding adds.
    //
    // --brand-caption-flow means "the credit is IN the page and occupies its
    // own box". Only the band reads that one. The padding must not, and
    // getting this wrong is what the first attempt got wrong: publishing
    // zero left the band at full height, which pushed the credit 64px lower
    // — directly under the footer bar, measured on the Simulator at 661-725
    // against a bar at 667-724. Visible in the DOM, invisible on the screen.
    const publish = () => {
      const height = `${captionNode?.offsetHeight ?? 0}px`;
      const inFlow = !!pageEndSlot;
      const root = document.documentElement.style;
      root.setProperty(
        "--brand-caption-clearance",
        isMobileArrangement() && !inFlow ? height : "0px",
      );
      root.setProperty("--brand-caption-flow", inFlow ? height : "0px");
    };
    publish();

    // A ResizeObserver alone is not enough: it never fires for an element with
    // no box, so crossing the height threshold that hides the caption would
    // leave the last non-zero value published and the band short by a strip
    // that is no longer there. The window listeners cover that direction; the
    // observer covers the caption changing height on its own, a long credit
    // wrapping to a second line.
    const observer = captionNode ? new ResizeObserver(publish) : undefined;
    if (captionNode && observer) observer.observe(captionNode);
    window.addEventListener("resize", publish);
    window.addEventListener("orientationchange", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      document.documentElement.style.setProperty(
        "--brand-caption-clearance",
        "0px",
      );
      document.documentElement.style.setProperty("--brand-caption-flow", "0px");
    };
  }, [captionNode, showCaption, pageEndSlot]);

  // Declared after isPaused (this hook needs it) rather than at the very
  // top like every other component in this file - order among hooks
  // doesn't matter for correctness, only that all of them still run
  // unconditionally every render, which this still does.
  const { classes, cx } = useStyles({ isPaused });
  // `order` starts as the unshuffled STATIC_SLIDES array so the
  // server-rendered HTML and the client's first render agree (Math.random()
  // at render time would desync them, since the server and the client's
  // first pass would each pick their own random slide independently — a
  // hydration mismatch, not just a cosmetic one). But that means
  // STATIC_SLIDES[0] ("À petit feu") is what actually starts loading,
  // `loading="eager"`, the instant this mounts — the shuffle effect runs a
  // moment later and picks something else, so the *real* slide's own
  // request starts later than À petit feu's did, and often loses that
  // race. The fix isn't shuffling faster; it's not rendering (and so not
  // requesting) any image at all until the shuffle has already happened,
  // so the very first request the browser makes is already for the right
  // slide.
  const [isReady, setIsReady] = useState(false);

  // Randomize the slide order once the component has mounted on the
  // client — and first fetch the live/synced catalog (BrandSyncService,
  // see pages/admin/brand.tsx) plus whichever stills the admin curation
  // page has excluded, so a freshly synced project is eligible from the
  // very first render that can show it, and a just-disabled still never
  // gets a chance to flash in as the very first slide shown. Both fetches
  // run in parallel, each independently bounded by
  // DISABLED_FETCH_TIMEOUT_MS (Promise.all — neither waits on the other),
  // rather than gating isReady on however long either actually takes —
  // this reuses the exact same isReady gate that already exists to keep
  // server/client shuffle output in sync (see isReady's own comment
  // above), just waiting slightly longer on it, not a new hydration-risk
  // surface. An empty, failed, or timed-out catalog fetch falls through to
  // STATIC_SLIDES exactly as if sync had never run — this is what
  // guarantees the panel can never regress to blank, regardless of
  // anything about the sync pipeline's own health.
  useEffect(() => {
    let cancelled = false;

    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
      Promise.race([
        promise.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    Promise.all([
      withTimeout(
        brandSlideService.getCatalog(),
        DISABLED_FETCH_TIMEOUT_MS,
        [] as BrandCatalogProject[],
      ),
      withTimeout(
        brandSlideService.getDisabled(),
        DISABLED_FETCH_TIMEOUT_MS,
        [] as DisabledBrandSlide[],
      ),
    ]).then(([catalog, disabled]) => {
      if (cancelled) return;

      const synced = flattenCatalog(catalog);
      const pool = synced.length > 0 ? synced : STATIC_SLIDES;

      const disabledKeys = new Set(
        disabled.map((d) => `${d.slug}-s${d.still}`),
      );
      const available = pool.filter(
        (slide) => !disabledKeys.has(`${slide.slug}-s${slide.still}`),
      );
      // Never render zero slides — an admin disabling everything, or a
      // fetch returning something unexpected, must never blank the panel.
      setOrder(
        shuffleFairRotation(available.length ? available : STATIC_SLIDES),
      );
      setIsReady(true);
    });

    setPrefersReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    return () => {
      cancelled = true;
    };
  }, []);

  // How much of the *current* slide's dwell time is left — a plain
  // setInterval(..., SLIDE_DURATION_MS) always restarts a full fresh
  // 10s wait on every unpause, regardless of how much of the previous
  // 10s had already elapsed before pausing. That's fine on its own, but
  // .living's zoom (paused/resumed via animation-play-state, see Slide)
  // correctly resumes from wherever *it* was frozen — meaning after a
  // long enough pause, the zoom (already most of the way done) finishes
  // and holds its final scale well before this timer's fresh 10s is up,
  // leaving the image sitting visibly static for however much of the
  // gap is left. Reported by the user from their own testing. Tracking
  // and resuming from the real remaining time here keeps both in sync
  // regardless of pause duration, the same way the CSS animation always
  // already did on its own.
  const remainingMs = useRef(SLIDE_DURATION_MS);
  // Resets the very instant a new slide becomes current — deliberately
  // a separate effect from the one below that counts it down, so this
  // always fires exactly once per real slide change, not once per
  // pause/resume toggle of the other effect.
  useEffect(() => {
    remainingMs.current = SLIDE_DURATION_MS;
  }, [current]);

  useEffect(() => {
    // Reduced-motion users previously still got the interval — only the
    // CSS transition/animation were gated — so the slide still hard
    // jump-cut every 10s instead of actually stopping. Gating the timer
    // itself (and letting anyone pause it via isPaused) fixes both that
    // and WCAG 2.2.2 (no way to pause an auto-updating carousel).
    if (order.length <= 1 || prefersReducedMotion || isPaused) return;

    const startedAt = Date.now();
    // Local to this one effect run, not a ref — distinguishes "cleanup
    // because the timeout below already fired and handled it" from
    // "cleanup because we're pausing (or unmounting) mid-countdown",
    // which is the only case that should actually decrement the budget.
    let advanced = false;
    const timeout = setTimeout(() => {
      advanced = true;
      setCurrent((index) => (index + 1) % order.length);
    }, remainingMs.current);

    return () => {
      clearTimeout(timeout);
      if (!advanced) {
        remainingMs.current = Math.max(
          0,
          remainingMs.current - (Date.now() - startedAt),
        );
      }
    };
  }, [order.length, prefersReducedMotion, isPaused, current]);

  const activeSlide = order[current];

  // Only ever renders the previous/current/next indices, not the whole
  // catalog (order.length is 106+ in production) — this carousel only
  // ever moves forward one step at a time, so at any given moment
  // exactly three slides can matter: the one sliding out (still finishing
  // its own exit transition — see Slide's own comment on why nothing
  // touches a slide once it's inactive), the one showing, and the one
  // already fetched ahead of its own turn (delta === 1, see Slide's
  // `loading` prop). Every other slide sitting off in transform-space is
  // invisible and, before this, stayed mounted with a fully decoded image
  // in memory for the rest of the session regardless — reported directly
  // as the likely cause of real-device memory pressure severe enough to
  // crash the tab (WebKit degrading/dropping the header's backdrop-filter
  // blur first, then killing the page outright). A slide that cycles back
  // into this window later mounts fresh and starts its own zoom from
  // scale(1) exactly like a first activation — see Slide's own
  // useLayoutEffect, which doesn't distinguish "never mounted before"
  // from "remounted after a while away."
  //
  // Set() dedupes for a very small catalog (e.g. 2 slides, where
  // current-1 and current+1 land on the same index) rather than crashing
  // on a duplicate React key.
  const mountedIndices = [
    ...new Set(
      [-1, 0, 1].map(
        (offset) =>
          (((current + offset) % order.length) + order.length) % order.length,
      ),
    ),
  ];

  const content = (
    <>
      <Box
        className={cx(classes.panel, {
          [classes.panelInRunway]: !!backdropSlot,
        })}
      >
        {isReady && (
          <Box
            // Fades the whole reveal in once there's something real to show,
            // rather than popping in the instant the shuffle resolves (which
            // can be before the chosen image has actually loaded) — a beat
            // of the panel's own dark background reads as an intentional
            // transition, not a stall.
            style={{
              opacity: 1,
              animation: prefersReducedMotion
                ? undefined
                : "brandPanelFadeIn 500ms ease",
            }}
          >
            {mountedIndices.map((index) => {
              const raw = order[index];
              const slide = resolveSlide(raw, unservable);
              return (
                <Slide
                  // Keyed on the ROTATION entry, not the resolved slide, so
                  // swapping a failed synced slide for its static twin
                  // replaces the image in place instead of remounting the
                  // box and restarting its zoom mid-dwell.
                  key={slideKey(raw)}
                  slide={slide}
                  delta={cyclicDelta(current, index, order.length)}
                  isActive={index === current}
                  prefersReducedMotion={prefersReducedMotion}
                  isPaused={isPaused}
                  onUnservable={markUnservable}
                />
              );
            })}
          </Box>
        )}
      </Box>
      {
        // Sibling of `.panel` on purpose, not nested inside it — see
        // `.caption`'s own styles for why.
      }
      {isReady &&
        activeSlide &&
        showCaption &&
        withPageEnd(
          <Box
            ref={setCaptionNode}
            className={pageEndSlot ? classes.captionInFlow : classes.caption}
          >
            <Group position="right" spacing="xs" noWrap align="center">
              {order.length > 1 && (
                <ActionIcon
                  // A 44px hit area (WCAG 2.5.8) around a 14px glyph —
                  // `size` controls the button's own box, independent of
                  // the icon size passed to the child below, so this
                  // doesn't change how the control looks, just how easy
                  // it is to actually hit on a touch screen.
                  size={44}
                  variant="transparent"
                  className={classes.pauseButton}
                  onClick={() => setIsPaused((paused) => !paused)}
                  aria-label={t(
                    isPaused ? "upload.brand.play" : "upload.brand.pause",
                  )}
                >
                  {isPaused ? (
                    <TbPlayerPlay size={14} />
                  ) : (
                    <TbPlayerPause size={14} />
                  )}
                </ActionIcon>
              )}
              <Text size="sm" color="gray.3">
                <FormattedMessage
                  id="upload.brand.caption"
                  values={{
                    title: (
                      <Anchor
                        href={`https://majid.film/projects/${activeSlide.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        fw={600}
                        className={classes.captionLink}
                        // Reverted to the original single accent tone —
                        // a lighter shade was tried here to raise
                        // contrast, but swapping the brand's one
                        // consistent hue for a paler tint broke the DA
                        // more than the contrast gain was worth.
                        sx={{
                          color:
                            theme.colors[theme.primaryColor][
                              theme.colorScheme === "dark" ? 4 : 6
                            ],
                        }}
                      >
                        {activeSlide.title}
                      </Anchor>
                    ),
                    year: activeSlide.year,
                  }}
                />
              </Text>
            </Group>
          </Box>,
        )}
    </>
  );

  // Portalled rather than rendered in place so the photograph lands in the
  // runway's own backdrop box — which starts above the layout viewport —
  // while every call site keeps mounting <BrandPanel /> exactly where it
  // always did. Null slot (desktop, any non-iOS browser, any route without a
  // runway, and the server render) means nothing changes at all.
  return backdropSlot && portalToBackdrop
    ? createPortal(content, backdropSlot)
    : content;
};

export default BrandPanel;
