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
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

// React warns on every SSR render if useLayoutEffect is used directly —
// "does nothing on the server", which is true but harmless here (the
// effect that needs it below early-returns until a real DOM ref exists,
// long before any server render could reach it) — this app is
// server-rendered by default (no getLayout opt-out on most pages), so
// the plain hook would print that warning on every one of them. Falling
// back to useEffect (a no-op either way during SSR) sidesteps the
// warning without changing behavior in the browser, where this always
// resolves to the real useLayoutEffect.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const HEADER_HEIGHT = 60;

// Real, always-in-flow height of the collapsed mobile-menu spacer below
// (see mobileSpacer/Collapse further down) — exported so anything that
// needs to know the true vertical space between the header and a mobile
// page's own content (currently just SplitTransferLayout's centering
// band) can subtract it explicitly instead of leaning on margin collapse
// to absorb it silently, which is exactly what broke the last time this
// box's neighbor switched from a margin to a padding for unrelated
// reasons — margins collapse into overlap, paddings never do.
export const MOBILE_MENU_SPACER_HEIGHT = 40;

// Shared by the mobile menu's own reveal and the page-content push it
// drives (see pushContentRef) — kept as one constant so the two always
// stay visually in lockstep; was 200 as separate literals on each
// Collapse before this file's GPU-only rewrite.
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

    // Outer wrapper for the mobile dropdown — owns positioning and the
    // GPU-only reveal (transform: scaleY, set inline alongside opacity/
    // transition since both are dynamic on `opened`, same pattern as the
    // inner Paper's own pop effect below). Nested inside MantineHeader
    // (`root` above, `position: fixed`) so `top: 100%` anchors it flush
    // under the header bar without needing to know HEADER_HEIGHT.
    //
    // Absolutely positioned rather than the previous `position: relative`
    // + Collapse-driven height specifically so opening/closing the menu
    // never touches layout: a real height animation (Collapse, like
    // AnimatedHeight elsewhere in this app) forces the browser to recompute
    // layout every frame, which is what showed up as visible jank on iOS.
    // Taking this out of flow means its own reveal is pure transform +
    // opacity — compositor-only, no per-frame layout — and it can no
    // longer push page content down by *being bigger*, which is what
    // pushContentRef exists for instead: Header measures this box's real
    // height via ResizeObserver and applies that as a translateY transform
    // to the page content directly (see the effect below), so the visual
    // "push" is also compositor-only, not a second real layout animation
    // standing in for the first. mobileSpacer below is deliberately left
    // exactly as it was — a small, fixed-size real Collapse, not
    // content-dependent, cheap enough that converting it too wasn't worth
    // the added complexity. Its height is real, uncollapsed flow space
    // sitting between the header and every page's own content (see
    // MOBILE_MENU_SPACER_HEIGHT — SplitTransferLayout's mobile centering
    // band subtracts it explicitly, having previously relied on a plain
    // margin quietly collapsing with this box instead, which broke the
    // instant that margin was replaced with padding for unrelated reasons).
    mobileMenuReveal: {
      // fixed, not absolute, and a sibling of MantineHeader in the JSX
      // below rather than nested inside it — the header itself
      // (`root` above) already carries its own backdrop-filter, and a
      // backdrop-filter element (the Paper inside this box) nested
      // *inside* another backdrop-filter's own subtree is a real WebKit
      // bug: Safari can fail to compute the inner blur against an
      // already-filtered backdrop at all, rendering it as a flat,
      // unblurred fill. Confirmed directly — the header bar and other
      // glass surfaces on the same page blurred correctly in real
      // Safari, only this nested one didn't, and an earlier fix that
      // addressed a *different* compositing trap (an overflow+transform
      // ancestor) left this one untouched. `top: HEADER_HEIGHT` replaces
      // the old `top: 100%`, which relied on being positioned relative
      // to the header's own box; as a sibling this now needs the real
      // pixel offset instead.
      //
      // The reveal itself is a clip-path transition on this box (see its
      // own inline style at the JSX below), not transform+opacity on
      // Paper — reapplied after being tried and reverted once already.
      // The first attempt was tested and reported as changing nothing,
      // but at that point the *separate* page-content-push timing bug
      // (see the useIsomorphicLayoutEffect above applyPush) was still
      // live — that bug's own visible symptom (BrandPanel's photo
      // genuinely dropping and snapping back) was large enough to fully
      // mask whatever this fixed underneath it. With that one now fixed
      // independently, what's left matches this one's own signature
      // exactly: a real-device recording caught the Paper rendering
      // flat black *specifically during* its own transform/opacity
      // transition, correctly frosted again the instant it settled —
      // the textbook shape of backdrop-filter combined with an animating
      // transform/opacity on the filtered element (or an ancestor of
      // it) failing to composite correctly on WebKit. clip-path
      // sidesteps the category entirely: nothing in Paper's chain, or
      // Paper itself, touches transform or opacity anymore, only how
      // much of this already fully-rendered box is visible.
      position: "fixed",
      top: HEADER_HEIGHT,
      right: 16,
      zIndex: 100,

      [theme.fn.largerThan("sm")]: {
        display: "none",
      },
    },

    mobilePanel: {
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
    },

    // Reserves a little breathing room below the fixed header specifically
    // for the collapsed mobile menu (see the Collapse pair below) — it
    // must not render past the "sm" breakpoint like `mobilePanel` above,
    // otherwise it silently adds an unaccounted-for gap under the header on
    // every desktop page too, throwing off any layout (e.g. the upload
    // card, auth cards) that centers its content symmetrically between the
    // header and the viewport/footer. Height rather than the old `mb` prop
    // (margin) — Collapse measures the wrapped element's own box height to
    // animate it, and margin isn't part of that box, so a margin-only
    // spacer would always measure ~0 and never visibly collapse.
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

const Header = ({
  pushContentRef,
}: {
  // The page-content element to shift down while the mobile menu is open —
  // _app.tsx owns it (Header doesn't render its own page content) and
  // passes it down. Absent, this degrades to "menu still opens/closes
  // correctly, page content just doesn't move" rather than throwing —
  // pages with their own getLayout don't render Header at all, but this
  // stays optional rather than assumed-always-present on principle.
  pushContentRef?: RefObject<HTMLDivElement>;
} = {}) => {
  const { user } = useUser();
  const router = useRouter();
  const config = useConfig();
  const t = useTranslate();
  const theme = useMantineTheme();

  const [opened, { toggle, close }] = useDisclosure(false);
  const [currentRoute, setCurrentRoute] = useState("");
  const [mobileMenuView, setMobileMenuView] = useState<MobileMenuView>("root");

  useEffect(() => {
    setCurrentRoute(router.pathname);
    close();
    setMobileMenuView("root");
  }, [close, router.pathname]);

  // Measures the mobile menu's real (unmounted-from-flow) height
  // continuously — its content can change size while open (the "shares"/
  // "profile" sub-views under mobileMenuView have different link counts
  // than the root view), not just once on open — and applies that as a
  // translateY transform to pushContentRef, transitioned exactly like the
  // menu's own reveal so page content visually tracks the menu opening/
  // closing/switching views, without either side ever animating a layout
  // property. menuGapRef holds theme.spacing.md — the same breathing room
  // mobilePanel used to reserve below itself via a real marginBottom, now
  // folded into the JS-computed push amount instead, since an absolutely
  // positioned box's own margin no longer affects anything after it.
  const menuBoxRef = useRef<HTMLDivElement>(null);
  const menuGapRef = useRef(theme.spacing.md);
  menuGapRef.current = theme.spacing.md;
  // Read by applyPush below instead of closing over `opened` directly —
  // the ResizeObserver effect intentionally only runs once (see its own
  // comment), so a closure formed inside it would freeze `opened` at
  // whatever it was on that first run forever. This kept re-zeroing the
  // push back to 0 every time the menu's real height changed while it
  // stayed open (e.g. switching between its "root" and "shares" sub-views
  // — different link counts, different heights) — the resize fired,
  // correctly, but ran a still-mounted-time `opened === false` closure.
  const openedRef = useRef(opened);
  openedRef.current = opened;

  // One reduced-motion check shared by the push effect below and the two
  // inline-styled transitions in the JSX (the menu reveal Box and its
  // Paper) — computed per render rather than a live-updating listener:
  // this only needs to be right the next time the menu opens/closes, not
  // mid-animation, and every other reduced-motion check in this app
  // (AnimatedHeight, Dropzone's waiting pulse) is a plain media query
  // re-evaluated by the browser itself on every style recalculation, which
  // this — being inline `style`, not `sx` — can't use directly.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileMenuDuration = reducedMotion ? 0.01 : MOBILE_MENU_DURATION;

  // Cached separately from reading menuBoxRef directly at apply time:
  // menuBoxRef's own element is what's being scaleY'd for its reveal, so
  // getBoundingClientRect() on it mid-transition (or right as `opened`
  // flips, before the browser has painted the new transform) reports the
  // currently-*rendered*, transform-shrunk size, not its real one — this
  // stayed silently near-0 on every open past the first, since the box's
  // real content never changes size from opening/closing alone, so
  // ResizeObserver's own callback (correctly reporting real, layout —
  // transform-blind — size below) only ever fires once, on mount.
  const menuHeightRef = useRef(0);

  // Reads only refs and pushContentRef (both stable) — safe to call from
  // any effect below regardless of that effect's own dependency array,
  // since nothing here is captured stale.
  const applyPush = () => {
    const pushEl = pushContentRef?.current;
    if (!pushEl) return;
    // calc(), not pre-added in JS: theme.spacing.md is "1rem" (a CSS
    // length string, Mantine v6's own default unit for spacing tokens),
    // not a number — `menuHeightRef.current + menuGapRef.current` was
    // silently string-concatenating "155.375" + "1rem" into an invalid
    // transform value the browser discarded outright, leaving the
    // previous (0) one in place. calc() lets the browser do the unit math
    // instead, correct regardless of what unit spacing.md is in.
    //
    // "" (clearing the inline style, falling back to the stylesheet's own
    // `transform: none`) rather than the literal string "translateY(0px)"
    // when closed — visually identical (both are a no-op offset), but
    // *any* transform value other than none, including a literal
    // translateY(0px), makes this element a new CSS containing block for
    // position:fixed/absolute descendants, which resolve against it
    // instead of the true viewport from then on. This element is
    // _app.tsx's own page-content Container, wrapping every page — with a
    // stray transform sitting on it at rest (the default, far more common
    // state than "menu open"), BrandPanel's mobile position:fixed photo
    // backdrop (SplitTransferLayout) silently stopped reaching the true
    // top of the viewport, showing as a black band under the header on
    // every mobile page load. The transition still animates smoothly
    // toward "" exactly as it did toward "translateY(0px)" — browsers
    // treat a missing/none transform as the identity for interpolation.
    pushEl.style.transform = openedRef.current
      ? `translateY(calc(${menuHeightRef.current}px + ${menuGapRef.current}))`
      : "";
    // A related value, exposed as a custom property this time (inherits
    // fine to a descendant regardless of the transform above — that's a
    // separate mechanism from containing-block). BrandPanel's mobile
    // position:fixed photo backdrop is a descendant of this element, so
    // the instant the transform above becomes non-none, per spec *this*
    // element becomes its containing block instead of the true viewport
    // (same rule the comment above already describes for the at-rest
    // case — unavoidable here, since actually moving while open is the
    // whole point). Without this, that shows as a black gap where the
    // photo should be, for as long as the menu stays open. BrandPanel
    // cancels it out via translateY(calc(-1 * var(...))) on that same
    // fixed element, transitioned with the matching duration below so
    // the two move in lockstep instead of drifting apart mid-open/close.
    //
    // HEADER_HEIGHT, not just the push amount: BrandPanel's containing
    // block only ever becomes this element once it's already a
    // transformed containing block — at that point BrandPanel's inset:0
    // resolves against this element's own *flow* position too (padded
    // HEADER_HEIGHT down from the true viewport top by _app.tsx, on top
    // of whatever this transform itself adds), not just the transform.
    // Leaving HEADER_HEIGHT out of the cancellation left BrandPanel
    // permanently HEADER_HEIGHT off — a visibly smaller black strip than
    // before this fix existed at all, but still a black strip, the whole
    // time the menu was open.
    pushEl.style.setProperty(
      "--mobile-menu-push",
      openedRef.current
        ? `calc(${HEADER_HEIGHT}px + ${menuHeightRef.current}px + ${menuGapRef.current})`
        : "0px",
    );
    pushEl.style.setProperty(
      "--mobile-menu-push-duration",
      `${mobileMenuDuration}ms`,
    );
  };

  useEffect(() => {
    const pushEl = pushContentRef?.current;
    const node = menuBoxRef.current;
    if (!pushEl || !node) return;

    pushEl.style.transition = `transform ${mobileMenuDuration}ms ease-out`;

    const observer = new ResizeObserver((entries) => {
      // contentRect: real, transform-blind layout size — see menuHeightRef's
      // own comment above for why getBoundingClientRect() on this same
      // element would be wrong. Fires once on mount, and again whenever the
      // menu's real content height changes — e.g. switching between its
      // "root" and "shares"/"profile" sub-views while staying open.
      menuHeightRef.current = entries[0].contentRect.height;
      applyPush();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      // Leaving mid-animation (e.g. a route change while open — the
      // pathname effect above already calls close(), but that only starts
      // this same transition, it doesn't wait for it) shouldn't strand the
      // next page's content pushed down with no menu to justify it. ""
      // rather than "translateY(0px)" — see applyPush's own comment above
      // for why a literal zero transform is never actually harmless here.
      pushEl.style.transition = "none";
      pushEl.style.transform = "";
    };
    // pushContentRef's identity is stable for the component's lifetime
    // (owned by _app.tsx, created once) — this intentionally only runs
    // once (mount) rather than re-observing on every `opened` flip;
    // applyPush reads openedRef.current fresh on every call regardless of
    // when this effect itself last ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushContentRef]);

  // The ResizeObserver above only fires on an actual size change, not on
  // `opened` itself flipping with the menu's size unchanged (the common
  // case) — this applies the transform for that transition directly.
  //
  // useLayoutEffect, not useEffect: the menu's own reveal (Paper's
  // transform/opacity, the scaleY wrapper's transform) is set inline
  // during this same render, so the browser sees it and starts
  // transitioning the instant this commit paints. A plain useEffect runs
  // *after* that paint — pushEl's transform and --mobile-menu-push, read
  // by BrandPanel's own compensating transform, would then start their
  // own transition a frame (or more, under any load) later than the menu
  // itself. Reported directly as a visible parasitic motion: the
  // background image drops with the menu, then visibly snaps to catch up
  // once this effect finally ran. useLayoutEffect fires synchronously
  // before paint instead, so both sides commit in the same frame and
  // animate in lockstep from the same starting instant.
  useIsomorphicLayoutEffect(applyPush, [opened, pushContentRef]);

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
        // Reveal is a clip-path transition on this box, not
        // transform/opacity — see mobileMenuReveal's own comment in
        // useStyles for why (backdrop-filter + an animating
        // transform/opacity, on the Paper below or any ancestor of it,
        // renders as flat black on real Safari specifically during the
        // transition). inset(0 0 100% 0)-equivalent rather than
        // unmounting while closed — same reason as everywhere else in
        // this app that keeps a collapsed region mounted: something has
        // to still be there for the *next* open to animate from.
        //
        // A sibling of MantineHeader, not a child of it — see
        // mobileMenuReveal's own comment in useStyles for why (nested
        // backdrop-filter under the header's own).
      }
      <Box
        ref={menuBoxRef}
        className={classes.mobileMenuReveal}
        style={{
          clipPath: opened ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 100% 0%)",
          transition: `clip-path ${mobileMenuDuration}ms ease-out`,
          pointerEvents: opened ? "auto" : "none",
        }}
        aria-hidden={!opened}
      >
        {
          // Paper itself no longer animates anything — transform/opacity
          // here would reintroduce the exact black-flash bug clip-path
          // above exists to avoid. It renders at its final, fully-styled
          // state at all times; the clip-path on the box above is the
          // only thing controlling how much of it is actually visible.
        }
        <Paper className={classes.mobilePanel} withBorder>
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
      </Box>
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
