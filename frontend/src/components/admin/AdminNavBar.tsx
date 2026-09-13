import {
  Anchor,
  Box,
  createStyles,
  Group,
  Navbar,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/router";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import {
  TbAt,
  TbBinaryTree,
  TbBucket,
  TbGauge,
  TbLink,
  TbMail,
  TbPhoto,
  TbScale,
  TbServerBolt,
  TbSettings,
  TbShare,
  TbShieldCheck,
  TbSocial,
  TbUsers,
  TbVirusSearch,
} from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import { APP_NAME, RELEASES_URL } from "../../constants";
import useTranslate from "../../hooks/useTranslate.hook";
import versionService, { VersionInfo } from "../../services/version.service";

export const categories = [
  { name: "General", icon: <TbSettings /> },
  { name: "Email", icon: <TbMail /> },
  { name: "Share", icon: <TbShare /> },
  { name: "Verification", icon: <TbShieldCheck /> },
  { name: "SMTP", icon: <TbAt /> },
  { name: "OAuth", icon: <TbSocial /> },
  { name: "LDAP", icon: <TbBinaryTree /> },
  { name: "S3", icon: <TbBucket /> },
  { name: "Legal", icon: <TbScale /> },
  { name: "Cache", icon: <TbServerBolt /> },
  { name: "Clamav", icon: <TbVirusSearch /> },
  { name: "Performance", icon: <TbGauge /> },
];

const adminItems = [
  {
    href: "/admin/brand",
    labelId: "admin.button.brand",
    icon: <TbPhoto />,
  },
  {
    href: "/admin/users",
    labelId: "admin.button.users",
    icon: <TbUsers />,
  },
  {
    href: "/admin/shares",
    labelId: "admin.button.shares",
    icon: <TbLink />,
  },
];

const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";

  return {
    navbar: {
      background: dark
        ? "linear-gradient(160deg, rgba(255, 255, 255, 0.08) 0%, rgba(18, 18, 18, 0.5) 60%, rgba(255, 255, 255, 0.03) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.28) 60%, rgba(255, 255, 255, 0.35) 100%)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      borderRight: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,

      // The whole menu scrolls, not just the settings list inside it. The
      // categories used to be the only scrollable region, which meant the
      // three admin links above them and the version memo below stayed
      // pinned while a single sub-list moved under the cursor — two scroll
      // contexts in a 200px column, and no way to reach the memo by
      // scrolling the menu itself.
      overflowY: "auto",

      [theme.fn.smallerThan("sm")]: {
        height: "calc(100dvh - 60px)",
        maxHeight: "calc(100dvh - 60px)",

        // The burger opened this panel with no reveal at all, while the
        // public header's own mobile menu has one — the same app, two
        // different answers to the same gesture.
        //
        // An animation rather than a transition, because Mantine's `hidden`
        // prop is `display: none` and a transition has nothing to run on
        // between two states one of which is not rendered. Going from
        // display:none to displayed restarts a CSS animation from its first
        // frame, which is exactly the hook needed here — measured directly
        // on this codebase while chasing an unrelated bug, where a paused
        // sweep jumped 98° backwards for precisely this reason.
        //
        // clip-path and not transform/opacity: this element carries a
        // backdrop-filter, and animating transform or opacity on the
        // filtered element (or any ancestor of it) is what produced the
        // black flash the public header's menu was rebuilt to avoid. See
        // mobilePanel in Header.tsx for that whole investigation; clip-path
        // is the resolution it landed on, reused here rather than
        // rediscovered.
        animation: "adminNavReveal 260ms ease-out",

        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      },
    },

    activeLink: {
      backgroundColor: theme.fn.variant({
        variant: "light",
        color: theme.primaryColor,
      }).background,
      color: theme.fn.variant({ variant: "light", color: theme.primaryColor })
        .color,

      borderRadius: theme.radius.sm,
      fontWeight: 600,
    },
  };
});

const AdminNavBar = ({
  isMobileNavBarOpened,
  setIsMobileNavBarOpened,
}: {
  isMobileNavBarOpened: boolean;
  setIsMobileNavBarOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const { classes } = useStyles();
  const router = useRouter();
  const t = useTranslate();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    versionService
      .get()
      .then(setVersionInfo)
      .catch(() => {});
  }, []);

  // Three states rather than two. Orange is the one that asks for action:
  // this deployment is behind the newest release. Yellow says a different
  // kind of thing — the deployment IS the newest release, and the repository
  // has moved past it since, which is worth seeing without being a call to
  // do anything about it tonight. Green means neither gap exists.
  //
  // drift is only consulted once upToDate is true. A deployment that is
  // already behind a release has a more urgent thing to say, and stacking
  // "and there are also 12 unreleased commits" on top of it would bury it.
  const versionBadge = (() => {
    if (!versionInfo || versionInfo.upToDate === null) return null;
    if (!versionInfo.upToDate) {
      return {
        color: "orange",
        label: t("admin.version.outdated", { 0: versionInfo.latest }),
      };
    }
    if (versionInfo.drift !== null && versionInfo.drift > 0) {
      return {
        color: "yellow",
        label: t("admin.version.drift", {
          count: versionInfo.drift,
          tag: versionInfo.latest,
        }),
      };
    }
    return { color: "green", label: t("admin.version.upToDate") };
  })();

  const categorySlug =
    router.pathname === "/admin/config/[category]" &&
    typeof router.query.category === "string"
      ? router.query.category.toLowerCase()
      : null;

  return (
    <Navbar
      className={classes.navbar}
      p="md"
      hiddenBreakpoint="sm"
      hidden={!isMobileNavBarOpened}
      width={{ sm: 200, lg: 300 }}
    >
      <Navbar.Section>
        <Text size="xs" color="dimmed" mb="sm">
          <FormattedMessage id="admin.title" />
        </Text>
        <Stack spacing="xs">
          {adminItems.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Box
                p="xs"
                component={Link}
                onClick={() => setIsMobileNavBarOpened(false)}
                className={active ? classes.activeLink : undefined}
                key={item.href}
                href={item.href}
              >
                <Group>
                  <ThemeIcon variant={active ? "filled" : "light"}>
                    {item.icon}
                  </ThemeIcon>
                  <Text size="sm">
                    <FormattedMessage id={item.labelId} />
                  </Text>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </Navbar.Section>
      <Navbar.Section mt="md" grow>
        <Text size="xs" color="dimmed" mb="sm">
          <FormattedMessage id="admin.config.title" />
        </Text>
        <Stack spacing="xs">
          {categories.map((category) => {
            const active = categorySlug === category.name.toLowerCase();
            return (
              <Box
                p="xs"
                component={Link}
                onClick={() => setIsMobileNavBarOpened(false)}
                className={active ? classes.activeLink : undefined}
                key={category.name}
                href={`/admin/config/${category.name.toLowerCase()}`}
              >
                <Group>
                  <ThemeIcon variant={active ? "filled" : "light"}>
                    {category.icon}
                  </ThemeIcon>
                  <Text size="sm">
                    <FormattedMessage
                      id={`admin.config.category.${category.name.toLowerCase()}`}
                    />
                  </Text>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </Navbar.Section>
      {versionInfo && (
        <Navbar.Section pt="md">
          <Group spacing={6} noWrap>
            <Anchor
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
              color="dimmed"
            >
              {APP_NAME} {versionInfo.version}
            </Anchor>
            {
              // withinPortal because this sidebar scrolls: Mantine 6 renders a
              // tooltip in place by default, and `overflow-y: auto` on the
              // navbar clips anything reaching past its edge — the label was
              // cut mid-sentence at the sidebar's right border. The portal
              // takes it out of that box entirely.
              //
              // multiline with a width because the drift label is a sentence,
              // not a word: left to Mantine's `width: "auto"` it lays out as
              // one very long line and runs off the screen instead of wrapping.
            }
            {versionBadge && (
              <Tooltip
                withArrow
                withinPortal
                multiline
                w={240}
                label={versionBadge.label}
                // Mantine fires a tooltip on hover only. A phone has no hover,
                // so this sentence — the one thing saying WHY the dot is the
                // colour it is — could not be reached at all on the surface
                // where the admin panel is most often opened. touch shows it
                // on tap, focus on keyboard.
                events={{ hover: true, focus: true, touch: true }}
              >
                <Box
                  // Focusable so the `focus` event above has something to fire
                  // on, and labelled so the meaning survives for anyone who
                  // cannot see the colour — which was, until now, the only
                  // thing carrying it.
                  tabIndex={0}
                  role="img"
                  aria-label={versionBadge.label}
                  sx={(theme) => ({
                    // The dot stays 8px; the box around it is 44px, the hit
                    // area WCAG 2.5.8 asks for and the same one the carousel's
                    // pause control already uses. The negative margin gives
                    // that room back to the layout, so the version line looks
                    // exactly as it did.
                    width: 44,
                    height: 44,
                    margin: -18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    "&::after": {
                      content: '""',
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: theme.colors[versionBadge.color][6],
                    },
                  })}
                />
              </Tooltip>
            )}
          </Group>
        </Navbar.Section>
      )}
    </Navbar>
  );
};

export default AdminNavBar;
