import { Box, createStyles } from "@mantine/core";

const HERO_IMAGE = "/img/brand/hero-1.webp";

const useStyles = createStyles((theme) => ({
  panel: {
    flex: "1 1 auto",
    position: "relative",
    minHeight: 320,
    backgroundImage: `url(${HERO_IMAGE})`,
    backgroundSize: "cover",
    backgroundPosition: "center",

    [theme.fn.smallerThan("sm")]: {
      order: -1,
      height: 240,
      flex: "0 0 auto",
    },
  },
}));

const BrandPanel = () => {
  const { classes } = useStyles();
  return <Box className={classes.panel} />;
};

export default BrandPanel;
