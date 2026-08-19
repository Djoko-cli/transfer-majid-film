import { Box, createStyles } from "@mantine/core";
import BrandPanel from "../upload/BrandPanel";
import LiquidGlassKeyframes from "../upload/liquidGlassKeyframes";

// A viewport-fixed (not scrolling) version of the brand-photo carousel used
// behind the transfer card — for pages whose own content is a normal,
// possibly-long document flow (account settings) rather than one single
// floating card, so there's no content height to match. A permanent scrim
// on top keeps plain text readable against the carousel at every scroll
// position, since unlike the transfer/auth cards this content isn't itself
// blurred glass everywhere.
const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";

  return {
    backdrop: {
      position: "fixed",
      inset: 0,
      zIndex: -1,
      overflow: "hidden",
    },
    scrim: {
      position: "absolute",
      inset: 0,
      background: dark
        ? "linear-gradient(180deg, rgba(10, 10, 10, 0.6) 0%, rgba(10, 10, 10, 0.72) 100%)"
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.7) 100%)",
    },
  };
});

const GlassPageBackdrop = () => {
  const { classes } = useStyles();

  return (
    <Box className={classes.backdrop}>
      <LiquidGlassKeyframes />
      {/* This backdrop is ambient, not the featured carousel — its per-slide
          credit caption would sit at a fixed viewport position while page
          content scrolls freely over it (unlike the transfer/auth cards,
          which share the same scroll context as the image), so it's turned
          off here rather than fighting that overlap. */}
      <BrandPanel showCaption={false} />
      <Box className={classes.scrim} />
    </Box>
  );
};

export default GlassPageBackdrop;
