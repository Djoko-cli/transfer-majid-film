import { Box, Text, createStyles } from "@mantine/core";
import { FormattedMessage } from "react-intl";
import Upload from "../components/upload/UploadPage";
import Meta from "../components/Meta";

const useStyles = createStyles((theme) => ({
  tagline: {
    textAlign: "center",
    marginBottom: theme.spacing.xl,

    [theme.fn.smallerThan("xs")]: {
      marginBottom: theme.spacing.lg,
    },
  },
}));

export default function Home() {
  const { classes } = useStyles();

  return (
    <>
      <Meta title="Home" />
      <Box className={classes.tagline}>
        <Text size="lg" color="dimmed">
          <FormattedMessage id="home.description" />
        </Text>
      </Box>
      <Upload isReverseShare={false} simplified={false} />
    </>
  );
}
