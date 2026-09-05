import {
  Box,
  Burger,
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
import { createPortal } from "react-dom";
import { TbChevronLeft } from "react-icons/tb";
import { APP_NAME } from "../../constants";
import useConfig from "../../hooks/config.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import Logo from "../Logo";
import ActionAvatar from "./ActionAvatar";
import LanguageToggle from "./LanguageToggle";
import NavbarShareMenu from "./NavbarShareMenu";

export const HEADER_HEIGHT = 60;

// Real, always-in-flow height of the mobile-menu spacer below (see
// mobileSpacer further down) — exported so anything that needs to know
// the true vertical space between the header and a mobile
// page's own content (currently just SplitTransferLayout's centering
// band) can subtract it explicitly instead of leaning on margin collapse
// to absorb it silently, which is exactly what broke the last time this
// box's neighbor switched from a margin to a padding for unrelated
// reasons — margins collapse into overlap, paddings never do.
export const MOBILE_MENU_SPACER_HEIGHT = 40;

// Duration of the mobile menu's own reveal transition — was 200 as a
// separate literal on each Collapse before this file's GPU-only rewrite.
const MOBILE_MENU_DURATION = 200;

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

    // The mobile dropdown — a floating overlay anchored under the burger
    // button, not something page content ever needs to make room for.
    // Fixed positioning (see `position: fixed` on mobilePanel below)
    // rather than the previous `position: relative` + Collapse-driven
    // height specifically so opening/closing the menu never touches
    // layout: a real height animation (Collapse, like AnimatedHeight
    // elsewhere in this app) forces the browser to recompute layout every
    // frame, which is what showed up as visible jank on iOS. Taking this
    // out of flow means its own reveal (clip-path, see mobilePanel's own
    // comment below) is compositor-only, no per-frame layout, and it
    // simply floats over whatever page content happens to sit underneath
    // it while open — its own glass blur is what keeps that content
    // legible, not any attempt to shift it out of the way.
    // mobileSpacer below is unrelated to this box's own open/close — a
    // small, constant-height spacer reserving breathing room under the
    // header regardless of the menu's state (see its own comment in
    // useStyles for why it doesn't animate). Its height is real,
    // always-in-flow space sitting between the header and every page's
    // own content (see MOBILE_MENU_SPACER_HEIGHT — SplitTransferLayout's
    // mobile centering band subtracts it explicitly, having previously
    // relied on a plain margin quietly collapsing with this box instead,
    // which broke the instant that margin was replaced with padding for
    // unrelated reasons).
    mobilePanel: {
      // fixed, not absolute — and portaled to document.body in the JSX
      // below rather than rendered in place; position is relative to the
      // true viewport regardless of where in the DOM it actually lives.
      // `top: HEADER_HEIGHT` + `right: 16` anchor it under the burger.
      position: "fixed",
      top: HEADER_HEIGHT,
      right: 16,
      zIndex: 100,

      // The reveal itself is a clip-path transition on this same element
      // (see its own inline style at the JSX below), not transform+
      // opacity — a real-device recording caught this Paper rendering
      // flat black *specifically during* its own transform/opacity
      // transition, correctly frosted again the instant it settled — the
      // textbook shape of backdrop-filter combined with an animating
      // transform/opacity on the filtered element (or an ancestor of it)
      // failing to composite correctly on WebKit.
      //
      // clip-path now lives directly on this backdrop-filter element
      // rather than on a separate wrapper around it, which is where it
      // sat from the fix above through the portal below. A wrapper
      // carrying clip-path is, per spec, exactly as much a stacking-
      // context-creating ancestor as one carrying backdrop-filter or
      // transform — Safari's known failure to correctly composite a
      // backdrop-filter descendant of such an ancestor doesn't care which
      // specific property caused it. That went unnoticed as long as the
      // mobile menu still pushed page content away (nothing else
      // backdrop-filtered was ever visually nearby to expose it), and
      // survived the later portal fix too (portal addresses paint order,
      // not ancestor nesting) — reported as this panel rendering
      // completely flat, no trace of anything behind it, the entire time
      // it's open, on a device where the header bar's own backdrop-filter
      // (no clip-path ancestor at all) kept rendering correctly the whole
      // time. Collapsing the wrapper into this element removes the
      // nesting entirely: nothing above this element in the DOM (its
      // parent is document.body) touches transform, opacity, filter, or
      // clip-path, and nothing below it does either — clip-path here
      // controls only how much of this already fully-rendered element is
      // visible, the same job it did on the wrapper, without an ancestor
      // relationship to a backdrop-filter element in the way.
      width: "fit-content",
      minWidth: 220,
      maxWidth: "calc(100vw - 32px)",
      borderRadius: theme.radius.md,
      // Was width:100% with square top corners flush under the header —
      // full viewport width for 2-3 short text links (or an empty state
      // with just "Accueil"/"Se connecter") reads as far bigger than its
      // own content needs. A compact, right-aligned card — sized to its
      // content and anchored under the burger button, same idea as the
      // desktop nav's own compact inline links, or any other dropdown in
      // this app (the share/avatar menus) — instead of a full-bleed band.
      //
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

    // Reserves a little constant breathing room below the fixed header on
    // mobile, regardless of the menu's own open/closed state — the menu is
    // a `position: fixed` overlay (see mobilePanel above) that never
    // participates in this element's document flow either way, so there's
    // nothing for opening it to make room for. Was itself a Collapse tied
    // to `opened` (shrinking to 0 the instant the menu opened) back when
    // the menu still pushed page content down — real height animations
    // change actual document height, and with the push gone this had
    // nothing left to justify it: on a page that's meant to fit the
    // viewport exactly (see global.style.tsx's own overscrollBehaviorY
    // comment), a height change at the very top of the document on every
    // toggle was enough to visibly perturb scroll position, reported
    // directly as a scroll that "cancels itself" the instant the menu
    // opens. Always-rendered at a plain, constant height fixes that by
    // removing the animation entirely rather than retuning it. Must not
    // render past the "sm" breakpoint like `mobilePanel` above, otherwise
    // it silently adds an unaccounted-for gap under the header on every
    // desktop page too, throwing off any layout (e.g. the upload card,
    // auth cards) that centers its content symmetrically between the
    // header and the viewport/footer.
    mobileSpacer: {
      height: MOBILE_MENU_SPACER_HEIGHT,

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

  // Gates the portal below (see its own comment) — document.body doesn't
  // exist during SSR, and rendering straight into it on the client's
  // first pass, before hydration has reconciled against the server-
  // rendered markup, is the classic hydration-mismatch trap. Starting
  // false and flipping true in an effect means the first client render
  // still matches the server's, and the portal only takes over one
  // commit later — invisible either way, since `opened` also starts
  // false (see useDisclosure above), so there's nothing on-screen for
  // this to change during that one-render gap.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Shared by the two inline-styled transitions in the JSX below (the menu
  // reveal Box and its Paper) — computed per render rather than a live-
  // updating listener: this only needs to be right the next time the menu
  // opens/closes, not mid-animation, and every other reduced-motion check
  // in this app (AnimatedHeight, Dropzone's waiting pulse) is a plain media
  // query re-evaluated by the browser itself on every style recalculation,
  // which this — being inline `style`, not `sx` — can't use directly.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileMenuDuration = reducedMotion ? 0.01 : MOBILE_MENU_DURATION;

  const authenticatedLinks: NavLink[] = [
    {
      link: "/",
      label: t("navbar.upload"),
    },
    {
      component: <NavbarShareMenu />,
    },
    {
      link: "/contact",
      label: t("navbar.contact"),
    },
    {
      component: <ActionAvatar />,
    },
  ];

  let unauthenticatedLinks: NavLink[] = [
    {
      link: "/contact",
      label: t("navbar.contact"),
    },
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
          link: "/contact",
          label: t("navbar.contact"),
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
            <LanguageToggle />
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
        // Reveal is a clip-path transition on this same Paper, not
        // transform/opacity on Paper itself or on a wrapper around it —
        // see mobilePanel's own comment in useStyles for the full
        // reasoning on both counts. The scale+fade pop this menu used to
        // have lives on a plain Box *inside* Paper instead (see its own
        // comment further down) — safe in a way animating Paper itself
        // never was, since it's a descendant, not Paper or an ancestor of
        // it. inset(0 0 100% 0)-equivalent rather than unmounting while
        // closed — same reason as everywhere else in this app that keeps
        // a collapsed region mounted: something has to still be there for
        // the *next* open to animate from.
        //
        // Portaled to document.body (see `mounted` above) rather than
        // rendered inline here — puts DOM/paint order and stacking order
        // in agreement (see mobilePanel's own comment for why that
        // matters here), the same reason every floating-UI library
        // (Mantine's own Menu/Popover/Modal included, just not used for
        // this hand-rolled panel) portals dropdowns/modals by default
        // rather than rendering them in place.
      }
      {mounted &&
        createPortal(
          <Paper
            className={classes.mobilePanel}
            withBorder
            style={{
              clipPath: opened
                ? "inset(0% 0% 0% 0%)"
                : "inset(0% 0% 100% 0%)",
              transition: `clip-path ${mobileMenuDuration}ms ease-out`,
              pointerEvents: opened ? "auto" : "none",
            }}
            aria-hidden={!opened}
          >
            {
              // The scale+fade "pop" this menu had before clip-path
              // replaced its reveal — moved onto this plain inner Box
              // (a child of Paper, not Paper itself and not an ancestor
              // of it) rather than restored on Paper directly, where it
              // used to live. backdrop-filter only cares about what's
              // already composited *behind* the element it's on; a
              // transform/opacity animating on a descendant paints on
              // top of that already-resolved result and can't disturb
              // it, unlike the same animation on Paper itself or an
              // ancestor of it (the exact shape of the black-flash bug
              // clip-path was introduced to avoid, and of the nested-
              // stacking-context nesting bug the clip-path wrapper
              // itself turned out to reproduce). Same values as the
              // original pop: a subtle 6% scale-in from the same corner
              // the menu is anchored to, not a generic center pop.
            }
            <Box
              style={{
                transform: opened ? "scale(1)" : "scale(0.94)",
                opacity: opened ? 1 : 0,
                transformOrigin: "top right",
                transition: `transform ${mobileMenuDuration}ms ease-out, opacity ${mobileMenuDuration}ms ease-out`,
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
            </Box>
          </Paper>,
          document.body,
        )}
      {
        // Constant regardless of `opened` — see mobileSpacer's own comment
        // in useStyles for why.
      }
      <Box className={classes.mobileSpacer} />
    </>
  );
};

export default Header;
