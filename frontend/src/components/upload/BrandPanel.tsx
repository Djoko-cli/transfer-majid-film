import {
  ActionIcon,
  Anchor,
  Box,
  Group,
  Text,
  createStyles,
  useMantineTheme,
} from "@mantine/core";
import { useEffect, useLayoutEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import { TbPlayerPause, TbPlayerPlay } from "react-icons/tb";
import { PROJECTS } from "../../data/brandProjects";
import useTranslate from "../../hooks/useTranslate.hook";
import brandSlideService from "../../services/brandSlide.service";
import { DisabledBrandSlide } from "../../types/brandSlide.type";

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

// Flattened to one slide per (project, still) pair — every still of a
// project shares its title/year/credit-link but gets its own unique key and
// its own resolved width list.
const SLIDES = PROJECTS.flatMap((project) => {
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
  }));
});

// The image panel is always full-bleed (100vw) at every breakpoint in this
// layout — the glass card floats on top of it via absolute positioning
// rather than sharing the image's own layout width — so the browser only
// ever needs to weigh candidates against the viewport width itself.
const SIZES = "100vw";

const buildSrcSet = (
  slug: string,
  still: number,
  widths: number[],
  format: "avif" | "webp",
) =>
  widths
    .map((w) => `/img/brand/derived/${slug}-s${still}-${w}.${format} ${w}w`)
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

const useStyles = createStyles((theme) => ({
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
    // (position:fixed pins to the viewport regardless of the parent).
    [theme.fn.smallerThan("sm")]: {
      position: "fixed",
      inset: 0,
      height: "100dvh",
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

    // Mobile isn't where this product shows off the photography — that's
    // desktop's job; on mobile the images are purely atmospheric variety
    // behind the glass. Dropped entirely below "sm" rather than kept
    // visible-but-inert: on a screen this narrow the card spans nearly
    // the full width, so the credit (and the carousel pause control that
    // lived next to it) would sit right where the submit button lands the
    // moment a visitor scrolls down to reach it — not worth the layout
    // gymnastics for something that isn't the point on this surface.
    [theme.fn.smallerThan("sm")]: {
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
}));

// One instance per slide, mounted once and never torn down for the whole
// session — only its own zoom wrapper (see `activation` below) remounts,
// on activation, which is the one moment that needs a clean slate.
const Slide = ({
  slide,
  delta,
  isActive,
  prefersReducedMotion,
}: {
  slide: (typeof SLIDES)[number];
  delta: number;
  isActive: boolean;
  prefersReducedMotion: boolean;
}) => {
  const { classes, cx } = useStyles();

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

  return (
    <Box
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
            srcSet={buildSrcSet(slide.slug, slide.still, slide.widths, "avif")}
            sizes={SIZES}
          />
          <source
            type="image/webp"
            srcSet={buildSrcSet(slide.slug, slide.still, slide.widths, "webp")}
            sizes={SIZES}
          />
          <img
            className={classes.slideImage}
            src={`/img/brand/derived/${slide.slug}-s${slide.still}-${slide.widths[1]}.webp`}
            alt=""
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

const BrandPanel = ({ showCaption = true }: { showCaption?: boolean }) => {
  const { classes } = useStyles();
  const theme = useMantineTheme();
  const t = useTranslate();

  const [order, setOrder] = useState(SLIDES);
  const [current, setCurrent] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  // Lets any visitor stop the rotation, not just reduced-motion users —
  // see the interval effect below, which is also gated on this.
  const [isPaused, setIsPaused] = useState(false);
  // `order` starts as the unshuffled SLIDES array so the server-rendered
  // HTML and the client's first render agree (Math.random() at render time
  // would desync them, since the server and the client's first pass would
  // each pick their own random slide independently — a hydration mismatch,
  // not just a cosmetic one). But that means SLIDES[0] ("À petit feu") is
  // what actually starts loading, `loading="eager"`, the instant this
  // mounts — the shuffle effect runs a moment later and picks something
  // else, so the *real* slide's own request starts later than À petit
  // feu's did, and often loses that race. The fix isn't shuffling faster;
  // it's not rendering (and so not requesting) any image at all until
  // the shuffle has already happened, so the very first request the
  // browser makes is already for the right slide.
  const [isReady, setIsReady] = useState(false);

  // Randomize the slide order once the component has mounted on the client
  // — and first fold in whichever stills the admin brand-slide page (see
  // pages/admin/brand.tsx) has excluded, so a just-disabled still never
  // gets a chance to flash in as the very first slide shown. Bounded by
  // DISABLED_FETCH_TIMEOUT_MS (falls through to the full, unfiltered
  // SLIDES either way past that point) rather than gating isReady on
  // however long the fetch actually takes — this reuses the exact same
  // isReady gate that already exists to keep server/client shuffle output
  // in sync (see isReady's own comment above), just waiting slightly
  // longer on it, not a new hydration-risk surface.
  useEffect(() => {
    let cancelled = false;

    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
      Promise.race([
        promise.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    withTimeout(
      brandSlideService.getDisabled(),
      DISABLED_FETCH_TIMEOUT_MS,
      [] as DisabledBrandSlide[],
    ).then((disabled) => {
      if (cancelled) return;

      const disabledKeys = new Set(
        disabled.map((d) => `${d.slug}-s${d.still}`),
      );
      const available = SLIDES.filter(
        (slide) => !disabledKeys.has(`${slide.slug}-s${slide.still}`),
      );
      // Never render zero slides — an admin disabling everything, or a
      // fetch returning something unexpected, must never blank the panel.
      setOrder(shuffle(available.length ? available : SLIDES));
      setIsReady(true);
    });

    setPrefersReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Reduced-motion users previously still got the interval — only the
    // CSS transition/animation were gated — so the slide still hard
    // jump-cut every 10s instead of actually stopping. Gating the
    // interval itself (and letting anyone pause it via isPaused) fixes
    // both that and WCAG 2.2.2 (no way to pause an auto-updating carousel).
    if (order.length <= 1 || prefersReducedMotion || isPaused) return;

    const interval = setInterval(() => {
      setCurrent((index) => (index + 1) % order.length);
    }, SLIDE_DURATION_MS);

    return () => clearInterval(interval);
  }, [order.length, prefersReducedMotion, isPaused]);

  const activeSlide = order[current];

  return (
    <>
      <Box className={classes.panel}>
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
            {order.map((slide, index) => (
              <Slide
                key={`${slide.slug}-s${slide.still}`}
                slide={slide}
                delta={cyclicDelta(current, index, order.length)}
                isActive={index === current}
                prefersReducedMotion={prefersReducedMotion}
              />
            ))}
          </Box>
        )}
      </Box>
      {
        // Sibling of `.panel` on purpose, not nested inside it — see
        // `.caption`'s own styles for why.
      }
      {isReady && activeSlide && showCaption && (
        <Box className={classes.caption}>
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
        </Box>
      )}
    </>
  );
};

export default BrandPanel;
