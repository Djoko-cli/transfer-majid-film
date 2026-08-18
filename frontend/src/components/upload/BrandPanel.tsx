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

const SLIDES = [
  {
    src: "/img/brand/apetitfeu.webp",
    slug: "apetitfeu",
    title: "À petit feu",
    year: "2024",
  },
  { src: "/img/brand/atr.webp", slug: "atr", title: "ATR", year: "2022" },
  {
    src: "/img/brand/battle.webp",
    slug: "battle",
    title: "Battle - La Rényon",
    year: "2024",
  },
  {
    src: "/img/brand/bluesmaron.webp",
    slug: "bluesmaron",
    title: "À la rencontre du blues maron",
    year: "2023",
  },
  {
    src: "/img/brand/cavacava.webp",
    slug: "cavacava",
    title: "Ça va ? Ça va",
    year: "2024",
  },
  {
    src: "/img/brand/cilam-couple.webp",
    slug: "cilam-couple",
    title: "Des instants qui comptent - Couple",
    year: "2026",
  },
  {
    src: "/img/brand/cilam-grand-pere.webp",
    slug: "cilam-grand-pere",
    title: "Des instants qui comptent - Grand-père",
    year: "2026",
  },
  {
    src: "/img/brand/dbba.webp",
    slug: "dbba",
    title: "Dann' Babadzyé Artemis",
    year: "2025",
  },
  { src: "/img/brand/foli.webp", slug: "foli", title: "FOLÏ", year: "2024" },
  {
    src: "/img/brand/grave-dans-la-peau.webp",
    slug: "grave-dans-la-peau",
    title: "Gravé dans la peau",
    year: "2025",
  },
  {
    src: "/img/brand/hyundai-i10-n-line.webp",
    slug: "hyundai-i10-n-line",
    title: "i10 N Line",
    year: "2024",
  },
  { src: "/img/brand/kalou.webp", slug: "kalou", title: "KALOU", year: "2023" },
  {
    src: "/img/brand/kaskole.webp",
    slug: "kaskole",
    title: "KASKOLÉ",
    year: "2023",
  },
  {
    src: "/img/brand/lanrl.webp",
    slug: "lanrl",
    title: "La NRL, La Nouvelle Réunion Libre",
    year: "2023",
  },
  {
    src: "/img/brand/lespotscasses.webp",
    slug: "lespotscasses",
    title: "Les Pots Cassés",
    year: "2023",
  },
  {
    src: "/img/brand/quartierruisseau.webp",
    slug: "quartierruisseau",
    title: "Quartier Ruisseau",
    year: "2023",
  },
  {
    src: "/img/brand/sfr-noel.webp",
    slug: "sfr-noel",
    title: "La connexion entre nous, ça se fête !",
    year: "2024",
  },
  { src: "/img/brand/sovaz.webp", slug: "sovaz", title: "SOVAZ", year: "2023" },
  {
    src: "/img/brand/standup.webp",
    slug: "standup",
    title: "Stand Up !",
    year: "2026",
  },
  {
    src: "/img/brand/thousanddays.webp",
    slug: "thousanddays",
    title: "THOUSANDS DAYS",
    year: "2023",
  },
  {
    src: "/img/brand/tordballe.webp",
    slug: "tordballe",
    title: "Tord Balle",
    year: "2024",
  },
];

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

  // Sized larger than its wrapper so the living orbit/zoom below never
  // uncovers an edge — the slide's own overflow:hidden clips it back down.
  // Carries the sharp image and its blurred-left twin together, so both
  // move in sync during the orbit and the slide transition alike.
  slideImageWrap: {
    position: "absolute",
    inset: "-30%",
  },

  slideImage: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
  },

  // A softly-blurred twin of the same still, masked to fade out before the
  // halfway mark — this is what reads as the glass card's edge melting into
  // the photo instead of a hard seam where the two meet.
  slideImageBlurLeft: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "blur(16px) saturate(120%)",
    WebkitMaskImage:
      "linear-gradient(to right, black 0%, black 6%, transparent 16%)",
    maskImage: "linear-gradient(to right, black 0%, black 6%, transparent 16%)",
  },

  // Only the currently-settled slide gets this — a slow orbit-and-breathe
  // loop. Sized to actually read as motion at a glance rather than needing
  // to be stared at, while staying slow enough not to fight looking at the
  // photo itself. Delayed by the slide transition so it only starts once
  // the scroll has settled.
  living: {
    animation: `orbitFloat ${LIVING_DURATION_MS}ms ease-in-out ${TRANSITION_MS}ms infinite`,
  },

  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: `${theme.spacing.xl} ${theme.spacing.lg} ${theme.spacing.md}`,
    background: "linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)",
    zIndex: 1,
  },
}));

const BrandPanel = () => {
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
        return (
          <Box
            key={slide.slug}
            className={classes.slide}
            style={{
              transform: `translateX(${delta * 100}%)`,
              transition: prefersReducedMotion ? "none" : undefined,
            }}
          >
            <Box
              // Remounts the animation fresh each time this slide becomes
              // active again, instead of resuming mid-phase.
              key={isActive ? `${slide.slug}-active` : slide.slug}
              className={cx(classes.slideImageWrap, {
                [classes.living]: isActive && !prefersReducedMotion,
              })}
            >
              <Box
                className={classes.slideImage}
                style={{ backgroundImage: `url(${slide.src})` }}
              />
              <Box
                className={classes.slideImageBlurLeft}
                style={{ backgroundImage: `url(${slide.src})` }}
              />
            </Box>
          </Box>
        );
      })}

      {activeSlide && (
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
