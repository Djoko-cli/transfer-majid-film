import {
  Burger,
  Group,
  Header,
  MediaQuery,
  Text,
  useMantineTheme,
} from "@mantine/core";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Dispatch, SetStateAction } from "react";
import { useTopBarSlot } from "../core/FullBleedShell";
import { APP_NAME } from "../../constants";
import ActionAvatar from "../header/ActionAvatar";
import LanguageToggle from "../header/LanguageToggle";
import Logo from "../Logo";

const AdminHeader = ({
  isMobileNavBarOpened,
  setIsMobileNavBarOpened,
}: {
  isMobileNavBarOpened: boolean;
  setIsMobileNavBarOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const theme = useMantineTheme();
  const dark = theme.colorScheme === "dark";
  const topSlot = useTopBarSlot();

  const bar = (
    <Header
      height={60}
      // The `p` PROP is dropped when anchored and the padding declared in
      // `styles` below instead. Mantine's own prop generates a class that
      // wins over the styles object, so leaving it would keep the 16px and
      // discard the run — the box would still be pulled --runway-rise
      // upward with nothing putting its content back, and the bar would
      // simply be off-screen. Exactly how the footer disappeared when this
      // same treatment was first applied to it.
      {...(topSlot ? {} : { p: "md" })}
      // Anchored rather than fixed inside a runway, for the reason the main
      // Header carries at length: a fixed layer is clipped to the layout
      // viewport and handed an opaque native colour fill at the edge it
      // touches, so no amount of height lets it reach the status strip. The
      // run above the bar is free — the scroll origin is the page's top, so
      // overflow above it cannot be reached by scrolling.
      fixed={!topSlot}
      styles={{
        root: {
          background: dark
            ? "linear-gradient(160deg, rgba(255, 255, 255, 0.08) 0%, rgba(18, 18, 18, 0.5) 60%, rgba(255, 255, 255, 0.03) 100%)"
            : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.28) 60%, rgba(255, 255, 255, 0.35) 100%)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
          ...(topSlot
            ? {
                position: "static" as const,
                height: "auto",
                // min-height, not height: Mantine sets a height from the
                // prop above, and with border-box a padding-top larger than
                // it collapses the content box to zero — the glass would
                // then stop exactly where the logo begins, which is the
                // seam this exists to remove.
                minHeight: "calc(var(--runway-rise) + 60px)",
                marginTop: "calc(-1 * var(--runway-rise))",
                // All four sides, because the `p` prop that used to supply
                // them is not passed in this branch.
                padding: "calc(var(--runway-rise) + 16px) 16px 16px",
              }
            : {}),
        },
      }}
    >
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        <Group position="apart" w="100%">
          <Link href="/" passHref>
            <Group>
              <Logo height={35} width={35} />
              <Text weight={600}>{APP_NAME}</Text>
            </Group>
          </Link>
          {/* The same pair the main header carries on its right side, in
              the same order and at the same spacing. The admin section
              mounts its own chrome rather than the app's <Header>, so
              anything added there has to be added here too — the language
              switch was simply missed when it landed, leaving the console
              the one place in the app with no way to change language. */}
          <Group spacing="md">
            <LanguageToggle />
            <ActionAvatar />
          </Group>
        </Group>
        <MediaQuery largerThan="sm" styles={{ display: "none" }}>
          <Burger
            opened={isMobileNavBarOpened}
            onClick={() => setIsMobileNavBarOpened((o) => !o)}
            size="sm"
            ml="sm"
          />
        </MediaQuery>
      </div>
    </Header>
  );

  return topSlot ? createPortal(bar, topSlot) : bar;
};

export default AdminHeader;
