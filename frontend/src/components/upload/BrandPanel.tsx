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

const SLIDES = [
  {
    src: "/img/brand/hero-1.webp",
    slug: "quartierruisseau",
    title: "Quartier Ruisseau",
    year: "2023",
  },
  {
    src: "/img/brand/hero-2.webp",
    slug: "battle",
    title: "Battle - La Rényon",
    year: "2024",
  },
  {
    src: "/img/brand/hero-3.webp",
    slug: "atr",
    title: "ATR",
    year: "2022",
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
    flex: "1 1 auto",
    position: "relative",
    minHeight: 320,
    overflow: "hidden",
    backgroundColor: theme.colors.dark[8],

    [theme.fn.smallerThan("sm")]: {
      order: -1,
      height: 240,
      flex: "0 0 auto",
    },
  },

  slide: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  },

  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: `${theme.spacing.xl} ${theme.spacing.lg} ${theme.spacing.md}`,
    background: "linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)",
  },
}));

const BrandPanel = () => {
  const { classes } = useStyles();
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
        return (
          <Box
            key={slide.slug}
            className={classes.slide}
            style={{
              backgroundImage: `url(${slide.src})`,
              transform: `translateX(${delta * 100}%)`,
              transition: prefersReducedMotion ? "none" : undefined,
            }}
          />
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
