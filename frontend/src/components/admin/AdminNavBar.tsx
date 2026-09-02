import {
  Anchor,
  Box,
  createStyles,
  Group,
  Navbar,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/router";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import {
  TbAt,
  TbBinaryTree,
  TbBucket,
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
import versionService from "../../services/version.service";

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

      [theme.fn.smallerThan("sm")]: {
        height: "calc(100dvh - 60px)",
        maxHeight: "calc(100dvh - 60px)",
        overflowY: "auto",
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

    // The category list is long enough to outgrow the navbar's own height
    // on an ordinary laptop screen (confirmed: 11 categories overflows a
    // 740px-tall navbar by ~160px) — without this, that overflow is just
    // invisible past the fixed-position navbar's edge, taking the version
    // memo below it down with it. minHeight: 0 is load-bearing: a flex
    // child's default min-height is "auto" (its content size), which
    // silently defeats overflow scrolling inside a flex column no matter
    // what overflowY says.
    categoryScroll: {
      minHeight: 0,
      overflowY: "auto",
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
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    versionService.get().then(setVersion).catch(() => {});
  }, []);

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
      <Navbar.Section mt="md" grow className={classes.categoryScroll}>
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
      {version && (
        <Navbar.Section pt="md">
          <Anchor
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            color="dimmed"
          >
            {APP_NAME} {version}
          </Anchor>
        </Navbar.Section>
      )}
    </Navbar>
  );
};

export default AdminNavBar;
