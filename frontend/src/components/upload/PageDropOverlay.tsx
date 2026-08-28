import { Box, Center, Stack, Text, createStyles } from "@mantine/core";
import { TbCloudUpload } from "react-icons/tb";
import { FormattedMessage } from "react-intl";

const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  const accent = theme.colors[theme.primaryColor][dark ? 4 : 6];

  return {
    // Always mounted (so it has something to transition from/to) and kept
    // out of the layout via fixed positioning — only opacity/pointerEvents
    // toggle. The transition living here (rather than on `.visible`) is
    // what governs the fade-*out*: once `visible` is removed this is the
    // rule back in effect, matching the requested "disappears in ease-out".
    overlay: {
      position: "fixed",
      inset: 0,
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0,
      pointerEvents: "none",
      // Same tint recipe as Header/Footer (see Header.tsx) — this overlay
      // sits directly over BrandPanel's unpredictable photo brightness too,
      // and its title text uses the same unset, theme-default color.
      background: dark
        ? "linear-gradient(160deg, rgba(10, 10, 10, 0.5) 0%, rgba(10, 10, 10, 0.6) 55%, rgba(10, 10, 10, 0.54) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.6) 55%, rgba(255, 255, 255, 0.54) 100%)",
      backdropFilter: "blur(22px) saturate(160%)",
      WebkitBackdropFilter: "blur(22px) saturate(160%)",
      transition: "opacity 220ms ease-out",

      "@media (prefers-reduced-motion: reduce)": {
        transition: "none",
      },
    },

    // Applied on top of `.overlay` while a file is being dragged over the
    // page — its own `transition` is what's in effect while opacity climbs
    // to 1, so the appearance can be snappier than the disappearance above.
    visible: {
      opacity: 1,
      pointerEvents: "auto",
      transition: "opacity 120ms ease-in",

      "@media (prefers-reduced-motion: reduce)": {
        transition: "none",
      },
    },

    inner: {
      border: `2px dashed ${dark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.3)"}`,
      borderRadius: theme.radius.lg,
      padding: "48px 80px",
    },

    // Same halo technique as Header's nav links (see Header.tsx) — the
    // title below uses the theme's default text color, so it's exposed to
    // the same photo-backdrop contrast risk.
    title: {
      textShadow: dark
        ? "0 1px 3px rgba(0, 0, 0, 0.7)"
        : "0 1px 3px rgba(255, 255, 255, 0.7)",
    },

    icon: {
      color: accent,
    },
  };
});

// Full-viewport feedback shown while a file drag is anywhere over the page
// (see the window-level dragenter/dragleave/drop wiring in UploadPage) —
// not just while hovering the Dropzone placeholder itself, since a visitor
// dragging from their file manager has no reason to aim precisely for it.
const PageDropOverlay = ({ visible }: { visible: boolean }) => {
  const { classes, cx } = useStyles();

  return (
    <Box
      className={cx(classes.overlay, visible && classes.visible)}
      aria-hidden={!visible}
    >
      <Center className={classes.inner}>
        <Stack align="center" spacing="xs">
          <TbCloudUpload size={64} className={classes.icon} />
          <Text weight={700} size="xl" className={classes.title}>
            <FormattedMessage id="upload.page-drop-overlay.title" />
          </Text>
        </Stack>
      </Center>
    </Box>
  );
};

export default PageDropOverlay;
