import {
  Anchor,
  Box,
  Text,
  createStyles,
  useMantineTheme,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";

const SLIDE_DURATION_MS = 10000;
const TRANSITION_MS = 900;
// How long the "living" drift takes to loop back to its starting point once
// a slide has settled — kept below the remaining dwell time so it never gets
// cut off mid-motion by the next slide transition.
const LIVING_DURATION_MS = SLIDE_DURATION_MS - TRANSITION_MS;

// Standard breakpoint set derived (and downloaded, both avif+webp) from
// majid.film's own responsive derivatives for each still — see
// `public/img/brand/derived/`. Width availability is a property of each
// individual source photo (its native resolution), not of the project as a
// whole, so a project's stills can each need their own override — `kalou`'s
// s4/s5 top out at 2228px while its s1-s3 reach 4096px, for instance.
const STANDARD_WIDTHS = [640, 1280, 2048, 3840];

// One entry per project. `stills` lists which numbered stills to show (all
// sharing `widths`, or the project-level `widths` override, or
// STANDARD_WIDTHS); `stillWidths` is used instead when widths vary between
// stills of the same project.
const PROJECTS = [
  {
    slug: "apetitfeu",
    title: "À petit feu",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  { slug: "atr", title: "ATR", year: "2022", stills: [1, 2, 3, 4, 5] },
  {
    slug: "battle",
    title: "Battle - La Rényon",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "bluesmaron",
    title: "À la rencontre du blues maron",
    year: "2023",
    stills: [1, 2, 3, 4, 5, 15],
  },
  {
    slug: "cavacava",
    title: "Ça va ? Ça va",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "cilam-couple",
    title: "Des instants qui comptent - Couple",
    year: "2026",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "cilam-grand-pere",
    title: "Des instants qui comptent - Grand-père",
    year: "2026",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "dbba",
    title: "Dann' Babadzyé Artemis",
    year: "2025",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "foli",
    title: "FOLÏ",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
    widths: [640, 1280, 1920],
  },
  {
    slug: "grave-dans-la-peau",
    title: "Gravé dans la peau",
    year: "2025",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "hyundai-i10-n-line",
    title: "i10 N Line",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "kalou",
    title: "KALOU",
    year: "2023",
    stillWidths: {
      1: [640, 1280, 2048, 4096],
      2: [640, 1280, 2048, 4096],
      3: [640, 1280, 2048, 4096],
      4: [640, 1280, 2048, 2228],
      5: [640, 1280, 2048, 2228],
    },
  },
  { slug: "kaskole", title: "KASKOLÉ", year: "2023", stills: [1, 2, 3, 4, 5] },
  {
    slug: "lanrl",
    title: "La NRL, La Nouvelle Réunion Libre",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "lespotscasses",
    title: "Les Pots Cassés",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "quartierruisseau",
    title: "Quartier Ruisseau",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
    widths: [640, 1280, 2048, 2880],
  },
  {
    slug: "sfr-noel",
    title: "La connexion entre nous, ça se fête !",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
    widths: [640, 1280, 2048, 3193],
  },
  { slug: "sovaz", title: "SOVAZ", year: "2023", stills: [1, 2, 3, 4, 5] },
  {
    slug: "standup",
    title: "Stand Up !",
    year: "2026",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "thousanddays",
    title: "THOUSANDS DAYS",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "tordballe",
    title: "Tord Balle",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
];

// Flattened to one slide per (project, still) pair — every still of a
// project shares its title/year/credit-link but gets its own unique key and
// its own resolved width list.
const SLIDES = PROJECTS.flatMap((project) => {
  const stills = project.stillWidths
    ? Object.entries(project.stillWidths).map(([still, widths]) => ({
        still: Number(still),
        widths,
      }))
    : project.stills.map((still) => ({
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

    [theme.fn.smallerThan("sm")]: {
      position: "relative",
      inset: "auto",
      height: 240,
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

  // Only the currently-settled slide gets this — a slow, linear 7% zoom
  // across the full dwell time. Subtle on purpose: enough to read as "not a
  // static photo" without fighting looking at the image itself. Delayed by
  // the slide transition so it only starts once the scroll has settled, and
  // holds its end state (fill: forwards) instead of snapping back.
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
    // rectangle behind it the way a background scrim would.
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.8), 0 1px 12px rgba(0, 0, 0, 0.5)",
  },

  captionLink: {
    pointerEvents: "auto",
  },
}));

const BrandPanel = ({ showCaption = true }: { showCaption?: boolean }) => {
  const { classes, cx } = useStyles();
  const theme = useMantineTheme();

  const [order, setOrder] = useState(SLIDES);
  const [current, setCurrent] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Randomize the slide order once the component has mounted on the client.
  useEffect(() => {
    setOrder(shuffle(SLIDES));
    setPrefersReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  useEffect(() => {
    if (order.length <= 1) return;

    const interval = setInterval(() => {
      setCurrent((index) => (index + 1) % order.length);
    }, SLIDE_DURATION_MS);

    return () => clearInterval(interval);
  }, [order.length]);

  const activeSlide = order[current];

  return (
    <Box className={classes.panel}>
      {order.map((slide, index) => {
        const delta = cyclicDelta(current, index, order.length);
        const isActive = index === current;
        const slideKey = `${slide.slug}-s${slide.still}`;
        return (
          <Box
            key={slideKey}
            className={classes.slide}
            style={{
              transform: `translateX(${delta * 100}%)`,
              transition: prefersReducedMotion ? "none" : undefined,
            }}
          >
            <Box
              // Remounts the animation fresh each time this slide becomes
              // active again, instead of resuming mid-phase.
              key={isActive ? `${slideKey}-active` : slideKey}
              className={cx(classes.slideImageWrap, {
                [classes.living]: isActive && !prefersReducedMotion,
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
                  )}
                  sizes={SIZES}
                />
                <img
                  className={classes.slideImage}
                  src={`/img/brand/derived/${slide.slug}-s${slide.still}-${slide.widths[1]}.webp`}
                  alt=""
                  loading={isActive ? "eager" : "lazy"}
                  decoding="async"
                />
              </picture>
            </Box>
          </Box>
        );
      })}

      {activeSlide && showCaption && (
        <Box className={classes.caption}>
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
        </Box>
      )}
    </Box>
  );
};

export default BrandPanel;
