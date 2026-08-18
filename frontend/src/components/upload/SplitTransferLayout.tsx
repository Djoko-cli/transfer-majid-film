import { Box, createStyles } from "@mantine/core";
import { ReactNode } from "react";
import BrandPanel from "./BrandPanel";

const useStyles = createStyles((theme) => ({
  bleed: {
    position: "relative",
    left: "50%",
    right: "50%",
    marginLeft: "-50vw",
    marginRight: "-50vw",
    width: "100vw",
    display: "flex",
    alignItems: "stretch",
    minHeight: "calc(100vh - 180px)",

    [theme.fn.smallerThan("sm")]: {
      flexDirection: "column",
      minHeight: "auto",
    },
  },

  cardColumn: {
    flex: "0 0 460px",
    display: "flex",
    alignItems: "center",
    padding: `${theme.spacing.xl} clamp(20px, 4vw, 56px)`,
    overflowY: "auto",
    maxHeight: "calc(100vh - 180px)",

    [theme.fn.smallerThan("sm")]: {
      flex: "1 1 auto",
      padding: theme.spacing.md,
      maxHeight: "none",
    },
  },

  cardInner: {
    width: "100%",
  },
}));

const SplitTransferLayout = ({ children }: { children: ReactNode }) => {
  const { classes } = useStyles();

  return (
    <Box className={classes.bleed}>
      <Box className={classes.cardColumn}>
        <Box className={classes.cardInner}>{children}</Box>
      </Box>
      <BrandPanel />
    </Box>
  );
};

export default SplitTransferLayout;
