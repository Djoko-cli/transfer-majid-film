import {
  Box,
  Burger,
  Collapse,
  Container,
  createStyles,
  Group,
  Header as MantineHeader,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useState } from "react";
import { TbChevronLeft } from "react-icons/tb";
import { useIntl } from "react-intl";
import { APP_NAME } from "../../constants";
import useConfig from "../../hooks/config.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import i18nUtil from "../../utils/i18n.util";
import Logo from "../Logo";
import ActionAvatar from "./ActionAvatar";
import NavbarShareMenu from "./NavbarShareMenu";

// Quick EN/FR toggle for the navbar — the full language list already lives
// in account settings (LanguagePicker); this is just a one-click swap
// between the two languages this instance actually gets used in, labeled
// with the language it switches *to* rather than the current one.
const LanguageToggle = ({ className }: { className?: string }) => {
  const { locale } = useIntl();
  const isFrench = locale?.toLowerCase().startsWith("fr");
  const targetCode = isFrench ? "en-US" : "fr-FR";
  const targetLabel = isFrench ? "EN" : "FR";

  return (
    <UnstyledButton
      className={className}
      title={isFrench ? "Switch to English" : "Passer en français"}
      onClick={() => {
        i18nUtil.setLanguageCookie(targetCode);
        location.reload();
      }}
    >
      {targetLabel}
    </UnstyledButton>
  );
};

export const HEADER_HEIGHT = 60;

type NavLink = {
  link?: string;
  label?: string;
  component?: ReactNode;
  action?: () => Promise<void>;
};

type MobileMenuView = "root" | "shares" | "profile";

const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";

  return {
    root: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      // The header floats over BrandPanel's rotating production stills,
      // whose brightness is unpredictable — the original gradient dipped as
      // low as 4% opacity at its right edge (exactly where the nav links
      // sit), measuring ~1.5:1 contrast against a bright photo in dark mode
      // and ~1.1:1 against a dark photo in light mode. A tint in the
      // header's own theme direction (dark overlay in dark mode, light in
      // light mode), flattened so no stop dips back toward that original
      // weak point, keeps real-world contrast comfortably above the
      // WCAG AA large-text floor even before the textShadow below adds its
      // own margin — without going as opaque as a flat worst-case (pure
      // white/black) guarantee would require, which read as a slab rather
      // than glass.
      background: dark
        ? "linear-gradient(160deg, rgba(10, 10, 10, 0.5) 0%, rgba(10, 10, 10, 0.6) 55%, rgba(10, 10, 10, 0.54) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.6) 55%, rgba(255, 255, 255, 0.54) 100%)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
    },

    mobilePanel: {
      // Needs an explicit position + z-index, or both are ignored:
      // z-index has no effect on a statically-positioned element, and
      // without one this sits at stacking-order 0 same as everything
      // else in normal flow — which used to be harmless when nothing
      // else on the page had its own stacking context, but BrandPanel's
      // mobile backdrop is now `position: fixed` (its own context,
      // painted after this in DOM order), so without this the open menu
      // renders completely hidden behind the photo.
      position: "relative",
      zIndex: 100,
      marginBottom: theme.spacing.md,
      overflow: "hidden",
      // Was width:100% with square top corners flush under the header —
      // full viewport width for 2-3 short text links (or an empty state
      // with just "Accueil"/"Se connecter") reads as far bigger than its
      // own content needs. A compact, right-aligned card — sized to its
      // content and anchored under the burger button, same idea as the
      // desktop nav's own compact inline links, or any other dropdown in
      // this app (the share/avatar menus) — instead of a full-bleed band.
      width: "fit-content",
      minWidth: 220,
      maxWidth: "calc(100vw - 32px)",
      marginLeft: "auto",
      marginRight: 16,
      borderRadius: theme.radius.md,
      // Same tint/blur recipe as `root` above (the header bar itself) —
      // Mantine's own Paper default is a flat opaque fill from this app's
      // near-black palette, which reads as a solid slab dropped onto the
      // glass system everywhere else uses.
      background: dark
        ? "linear-gradient(160deg, rgba(10, 10, 10, 0.5) 0%, rgba(10, 10, 10, 0.6) 55%, rgba(10, 10, 10, 0.54) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.6) 55%, rgba(255, 255, 255, 0.54) 100%)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,

      [theme.fn.largerThan("sm")]: {
        display: "none",
      },
    },

    // Reserves a little breathing room below the fixed header specifically
    // for the collapsed mobile menu (see the Collapse pair below) — it
    // must not render past the "sm" breakpoint like `mobilePanel` above,
    // otherwise it silently adds an unaccounted-for 40px gap under the
    // header on every desktop page too, throwing off any layout (e.g. the
    // upload card, auth cards) that centers its content symmetrically
    // between the header and the viewport/footer. Height rather than the
    // old `mb` prop (margin) — Collapse measures the wrapped element's own
    // box height to animate it, and margin isn't part of that box, so a
    // margin-only spacer would always measure ~0 and never visibly
    // collapse.
    mobileSpacer: {
      height: 40,

      [theme.fn.largerThan("sm")]: {
        display: "none",
      },
    },

    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      height: "100%",
      // Fluid Container has no max-width of its own, so this padding is
      // what actually pins the logo/nav to the bar's real edges instead of
      // a centered, narrower content column with dead space on either side.
      paddingLeft: "clamp(20px, 4vw, 56px)",
      paddingRight: "clamp(20px, 4vw, 56px)",
    },

    links: {
      [theme.fn.smallerThan("sm")]: {
        display: "none",
      },
    },

    // Same halo technique as `link` below — the wordmark uses Mantine's
    // default (near-black/near-white) text color, so it's exposed to the
    // same photo-backdrop contrast risk the nav links are.
    wordmark: {
      textShadow:
        theme.colorScheme === "dark"
          ? "0 1px 3px rgba(0, 0, 0, 0.7)"
          : "0 1px 3px rgba(255, 255, 255, 0.7)",
    },

    burger: {
      [theme.fn.largerThan("sm")]: {
        display: "none",
      },
    },

    link: {
      display: "block",
      lineHeight: 1,
      padding: "8px 12px",
      borderRadius: theme.radius.sm,
      textDecoration: "none",
      color:
        theme.colorScheme === "dark"
          ? theme.colors.dark[0]
          : theme.colors.gray[7],
      fontSize: theme.fontSizes.sm,
      fontWeight: 500,
      // Same technique as BrandPanel's own photo caption (see
      // BrandPanel.tsx) — a halo in the opposite direction from the text
      // color adds real-world contrast against a photo's texture/gradients
      // that the header's flat overlay alone (see `root` above) doesn't
      // reach; imperceptible where this class renders on the mobile menu's
      // solid Paper background instead.
      textShadow:
        theme.colorScheme === "dark"
          ? "0 1px 3px rgba(0, 0, 0, 0.7)"
          : "0 1px 3px rgba(255, 255, 255, 0.7)",

      // A solid near-black fill here (Mantine's own default hover for a
      // dark-scheme nav link) reads as a stray opaque chip against this
      // header's translucent glass background — the same soft white-alpha
      // overlay used for hover states elsewhere in the glass system
      // (e.g. TransferCard's stepper buttons) instead.
      "&:hover": {
        backgroundColor:
          theme.colorScheme === "dark"
            ? "rgba(255, 255, 255, 0.1)"
            : theme.colors.gray[0],
      },

      [theme.fn.smallerThan("sm")]: {
        borderRadius: 0,
        padding: theme.spacing.md,
      },
    },

    mobileMenuButton: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing.md,
      color:
        theme.colorScheme === "dark"
          ? theme.colors.dark[0]
          : theme.colors.gray[7],

      "&:hover": {
        backgroundColor:
          theme.colorScheme === "dark"
            ? "rgba(255, 255, 255, 0.1)"
            : theme.colors.gray[0],
      },
    },

    mobileMenuButtonContent: {
      display: "flex",
      alignItems: "center",
    },

    mobileMenuLabel: {
      fontSize: theme.fontSizes.sm,
      fontWeight: 500,
    },

    linkActive: {
      "&, &:hover": {
        backgroundColor:
          theme.colorScheme === "dark"
            ? theme.fn.rgba(theme.colors[theme.primaryColor][9], 0.25)
            : theme.colors[theme.primaryColor][0],
        color:
          theme.colors[theme.primaryColor][
            theme.colorScheme === "dark" ? 3 : 7
          ],
      },
    },
  };
});

const Header = () => {
  const { user } = useUser();
  const router = useRouter();
  const config = useConfig();
  const t = useTranslate();

  const [opened, { toggle, close }] = useDisclosure(false);
  const [currentRoute, setCurrentRoute] = useState("");
  const [mobileMenuView, setMobileMenuView] = useState<MobileMenuView>("root");

  useEffect(() => {
    setCurrentRoute(router.pathname);
    close();
    setMobileMenuView("root");
  }, [close, router.pathname]);

  const authenticatedLinks: NavLink[] = [
    {
      link: "/",
      label: t("navbar.upload"),
    },
    {
      component: <NavbarShareMenu />,
    },
    {
      component: <ActionAvatar />,
    },
  ];

  let unauthenticatedLinks: NavLink[] = [
    {
      link: "/auth/signIn",
      label: t("navbar.signin"),
    },
  ];

  // Only worth linking to "/" for a signed-out visitor if the site is
  // actually public — otherwise it'd just bounce them to sign-in.
  if (config.get("share.allowUnauthenticatedShares"))
    unauthenticatedLinks.unshift({
      link: "/",
      label: t("navbar.home"),
    });

  if (config.get("share.allowRegistration"))
    unauthenticatedLinks.push({
      link: "/auth/signUp",
      label: t("navbar.signup"),
    });

  const mobileRootLinks: NavLink[] = user
    ? [
        {
          link: "/",
          label: t("navbar.upload"),
        },
        {
          label: t("common.button.shares"),
        },
        {
          label: t("common.button.profile"),
        },
      ]
    : unauthenticatedLinks;

  const mobileShareLinks: NavLink[] = [
    {
      link: "/account/shares",
      label: t("navbar.links.shares"),
    },
    {
      link: "/account/reverseShares",
      label: t("navbar.links.reverse"),
    },
    ...(config.get("share.enableUserRecipients")
      ? [
          {
            link: "/account/received",
            label: t("navbar.links.received"),
          },
        ]
      : []),
  ];

  const mobileProfileLinks: NavLink[] = [
    {
      link: "/account",
      label: t("navbar.avatar.account"),
    },
    ...(user?.isAdmin
      ? [
          {
            link: "/admin",
            label: t("navbar.avatar.admin"),
          },
        ]
      : []),
    {
      label: t("navbar.avatar.signout"),
      action: async () => {
        await authService.signOut();
        close();
        setMobileMenuView("root");
      },
    },
  ];

  const { classes, cx } = useStyles();
  const desktopItems = (
    <>
      {(user ? authenticatedLinks : unauthenticatedLinks).map((link, i) => {
        if (link.component) {
          return (
            <Box pl={5} py={15} key={i}>
              {link.component}
            </Box>
          );
        }
        return (
          <Link
            key={link.label}
            href={link.link ?? ""}
            onClick={close}
            className={cx(classes.link, {
              [classes.linkActive]: currentRoute == link.link,
            })}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );

  const currentMobileLinks =
    mobileMenuView === "shares"
      ? mobileShareLinks
      : mobileMenuView === "profile"
        ? mobileProfileLinks
        : mobileRootLinks;

  const renderMobileEntry = (link: NavLink) => {
    const isSharesEntry =
      mobileMenuView === "root" && link.label === t("common.button.shares");
    const isProfileEntry =
      mobileMenuView === "root" && link.label === t("common.button.profile");

    if (isSharesEntry || isProfileEntry) {
      return (
        <UnstyledButton
          key={link.label}
          className={classes.mobileMenuButton}
          onClick={() =>
            setMobileMenuView(isSharesEntry ? "shares" : "profile")
          }
        >
          <span className={classes.mobileMenuButtonContent}>
            <Text className={classes.mobileMenuLabel}>{link.label}</Text>
          </span>
        </UnstyledButton>
      );
    }

    if (link.action) {
      return (
        <UnstyledButton
          key={link.label}
          className={classes.mobileMenuButton}
          onClick={() => void link.action?.()}
        >
          <span className={classes.mobileMenuButtonContent}>
            <Text className={classes.mobileMenuLabel}>{link.label}</Text>
          </span>
        </UnstyledButton>
      );
    }

    return (
      <Link
        key={link.label}
        href={link.link ?? ""}
        onClick={() => {
          close();
          setMobileMenuView("root");
        }}
        className={cx(classes.link, {
          [classes.linkActive]: currentRoute == link.link,
        })}
      >
        {link.label}
      </Link>
    );
  };
  return (
    <>
      <MantineHeader height={HEADER_HEIGHT} mb={0} className={classes.root}>
        <Container fluid className={classes.header}>
          <Link href="/" passHref>
            <Group>
              <Logo height={35} width={35} />
              <Text weight={600} className={classes.wordmark}>
                {APP_NAME}
              </Text>
            </Group>
          </Link>
          <Group spacing="md">
            <Group spacing={5} className={classes.links}>
              <Group>{desktopItems}</Group>
            </Group>
            <LanguageToggle className={classes.link} />
            <Burger
              opened={opened}
              onClick={toggle}
              className={classes.burger}
              size="sm"
              aria-label={t("common.button.menu")}
            />
          </Group>
        </Container>
      </MantineHeader>
      {
        // `<Transition mounted={opened}>` only animated the Paper's own
        // opacity/transform — it mounts at its full natural height the
        // instant `opened` flips, so the page content sitting after it in
        // normal flow (the card) got shoved down/up in one frame,
        // independent of how smooth the pop-in itself looked. Collapse
        // instead animates the *height* this occupies, so whatever comes
        // after it in flow moves in step with the menu instead of
        // teleporting the moment it mounts. `animateOpacity={false}`
        // because the pop effect below already handles fade/scale itself
        // — letting Collapse's own opacity animation run too would just
        // restate the same fade on a different timeline.
      }
      <Collapse
        in={opened}
        transitionDuration={200}
        transitionTimingFunction="ease-out"
        animateOpacity={false}
      >
        <Paper
          className={classes.mobilePanel}
          withBorder
          style={{
            transform: opened ? "scale(1)" : "scale(0.94)",
            opacity: opened ? 1 : 0,
            transformOrigin: "top right",
            transition: "transform 200ms ease-out, opacity 200ms ease-out",
          }}
        >
          <Stack spacing={0}>
            {mobileMenuView !== "root" && (
              <UnstyledButton
                className={classes.mobileMenuButton}
                onClick={() => setMobileMenuView("root")}
                aria-label={t("common.button.back")}
              >
                <span className={classes.mobileMenuButtonContent}>
                  <TbChevronLeft size={18} />
                </span>
              </UnstyledButton>
            )}
            {currentMobileLinks.map((link) => renderMobileEntry(link))}
          </Stack>
        </Paper>
      </Collapse>
      {
        // Shrinks in step with the menu's own growth (same duration)
        // rather than vanishing the instant `opened` flips — same
        // teleport problem as the Paper above, just in the other
        // direction: this used to reserve 40px right up until the exact
        // frame the menu appeared, then snap to 0.
      }
      <Collapse
        in={!opened}
        transitionDuration={200}
        transitionTimingFunction="ease-out"
      >
        <Box className={classes.mobileSpacer} />
      </Collapse>
    </>
  );
};

export default Header;
