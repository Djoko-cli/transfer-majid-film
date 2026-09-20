import {
  ColorScheme,
  ColorSchemeProvider,
  Container,
  MantineThemeOverride,
  MantineProvider,
  Stack,
} from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import axios from "axios";
import { getCookie, setCookie } from "cookies-next";
import moment from "moment";
import "moment/min/locales";
import { GetServerSidePropsContext } from "next";
import type { AppProps } from "next/app";
import Head from "next/head";
import { ReactNode, useEffect, useState } from "react";
import { IntlProvider } from "react-intl";
import Header, { HEADER_HEIGHT } from "../components/header/Header";
import { ConfigContext } from "../hooks/config.hook";
import { LanguageContext } from "../hooks/language.hook";
import { TermsAcceptanceContext } from "../hooks/termsAcceptance.hook";
import { UserContext } from "../hooks/user.hook";
import { LOCALES } from "../i18n/locales";
import authService from "../services/auth.service";
import configService from "../services/config.service";
import userService from "../services/user.service";
import GlobalStyle from "../styles/global.style";
import RunwayStyle from "../styles/runway.style";
import FullBleedShell, {
  PageEndSlot,
} from "../components/core/FullBleedShell";
import {
  BAND_SETTLE_EASING,
  BAND_SETTLE_MS,
} from "../components/upload/SplitTransferLayout";
import { isRunwayRoute, isZoomLockedRoute } from "../utils/runwayRoutes.util";
import { useRouter } from "next/router";
import globalStyle from "../styles/mantine.style";
import Config from "../types/config.type";
import { CurrentUser } from "../types/user.type";
import i18nUtil from "../utils/i18n.util";
import userPreferences from "../utils/userPreferences.util";
import { setCurrentLanguage } from "../utils/fileSize.util";
import Footer from "../components/footer/Footer";
import CookieNotice from "../components/CookieNotice";
import { getDefaultConfig } from "../utils/defaultConfig.util";
import AdminNoticeModal, {
  AdminNotice,
} from "../components/admin/AdminNoticeModal";
import adminNoticeService from "../services/adminNotice.service";
import { NextPageWithLayout } from "../types/page.type";

// Pages that opt into their own persistent chrome (currently just the admin
// section's AdminLayout) define `.getLayout` instead of being wrapped in
// the default site Header/Container/Footer below — see NextPageWithLayout.
// "/admin/intro" is deliberately left without one — it's a one-off welcome
// screen, not part of the admin section's own nav.
type AppPropsWithLayout = AppProps & { Component: NextPageWithLayout };

// Module scope on purpose: an inline arrow would be a NEW component type on
// every render, and React would unmount and remount the entire page tree
// each time rather than reconciling it.
// Accepts (and ignores) the shell's props so the two are interchangeable at
// the call site — off the runway there is no geometry to lock a pinch out of.
const PassThrough = ({
  children,
}: {
  children: ReactNode;
  lockZoom?: boolean;
}) => <>{children}</>;

function App({ Component, pageProps }: AppPropsWithLayout) {
  // Which routes carry the full-bleed runway (see FullBleedShell). Read from
  // the route PATTERN, not the resolved URL, so a dynamic route matches
  // whatever its parameters are.
  const router = useRouter();
  const runway = isRunwayRoute(router.pathname);
  const lockZoom = isZoomLockedRoute(router.pathname);

  const systemTheme = useColorScheme(pageProps.colorScheme);

  const [colorScheme, setColorScheme] = useState<ColorScheme>(systemTheme);

  const [user, setUser] = useState<CurrentUser | null>(pageProps.user);

  const [configVariables, setConfigVariables] = useState<Config[]>(
    pageProps.configVariables,
  );

  // Seeded straight from the cookie getInitialProps already read
  // server-side below (pageProps.hasAcceptedTerms) - identical for the
  // server render and the client's first hydration pass, so a returning
  // visitor's very first painted byte already skips the terms gate instead
  // of showing it until a client-only effect corrects it a moment later
  // (see UploadPage.tsx's own history: that was localStorage-backed, which
  // *can't* be read server-side, so every reload flashed the gate first -
  // reported by the user from a real Safari reload, not just this session's
  // own faster/synthetic testing).
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(
    pageProps.hasAcceptedTerms ?? false,
  );
  const acceptTerms = () => {
    setCookie("termsAccepted", "true", {
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year - a real "remembered" choice, not a session-only one
    });
    setHasAcceptedTerms(true);
  };

  // Accent color, border radius and every other visual token now live as
  // static values in mantine.style.ts (globalStyle) — colorScheme is the
  // one piece that still has to be layered on at runtime, since it tracks
  // the live dark/light state below rather than a fixed design choice.
  const mergedTheme: MantineThemeOverride = {
    ...globalStyle,
    colorScheme,
  };

  // Guests always get dark (see toggleColorScheme below) — kept as a
  // constant rather than admin-configurable, matching everything else in
  // mantine.style.ts.
  const adminDefaultColorScheme = "system";

  useEffect(() => {
    const interval = setInterval(
      async () => await authService.refreshAccessToken(),
      2 * 60 * 1000, // 2 minutes
    );

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!pageProps.language) return;
    const cookieLanguage = getCookie("language");
    if (!cookieLanguage) {
      if (!pageProps.isConfigFallback) {
        i18nUtil.setLanguageCookie(pageProps.language);
      }
    } else if (pageProps.language !== cookieLanguage) {
      location.reload();
    }

    const current = i18nUtil.getLocaleByCode(pageProps.language);

    document.documentElement.dir = current.direction ?? "ltr";
    document.documentElement.lang = current.code;
  }, [pageProps.language, pageProps.isConfigFallback]);

  useEffect(() => {
    const userColorPreference = userPreferences.get("colorScheme");
    const colorScheme = user
      ? userColorPreference === "system"
        ? systemTheme
        : userColorPreference
      : adminDefaultColorScheme === "system"
        ? systemTheme
        : adminDefaultColorScheme;

    toggleColorScheme(colorScheme);
  }, [adminDefaultColorScheme, systemTheme, user]);

  // Light mode is retired from display — kept fully working in the theme/
  // preference logic above (user/admin/system color-scheme resolution is
  // untouched) so it's a one-line revert later, but every result funnels
  // through here and is forced to "dark" before it's ever applied.
  const toggleColorScheme = (_value: ColorScheme) => {
    setColorScheme("dark");
    setCookie("mantine-color-scheme", "dark", {
      sameSite: "lax",
    });
  };

  const [language, setLanguage] = useState(pageProps.language);
  moment.locale(language);
  // Same pattern as moment.locale() just above - set unconditionally in
  // the render body (not a useEffect) so it's already correct by the time
  // any descendant renders, server-side included. See fileSize.util.ts's
  // own comment for why this needs to be synchronous with render rather
  // than a cookie read from inside that plain utility.
  setCurrentLanguage(language);

  // Cookie first, then the state update that actually makes IntlProvider
  // below re-render with the new locale/messages - no reload. Also
  // updates the two document-level attributes the mount effect above sets
  // from the server-resolved language once, up front; this is the same
  // thing happening again for a language chosen after the fact.
  const switchLanguage = (code: string) => {
    i18nUtil.setLanguageCookie(code);
    setLanguage(code);
    const current = i18nUtil.getLocaleByCode(code);
    document.documentElement.dir = current.direction ?? "ltr";
    document.documentElement.lang = current.code;
  };

  // A plain fragment off the runway routes, so every other page keeps the
  // exact markup it had; the shell only ever wraps the twelve it is meant
  // for. Off iOS the shell itself is inert anyway (every wrapper it renders
  // is `display: contents` — see runway.style.tsx), so this second gate is
  // about scope, not about platform.
  const Shell = runway ? FullBleedShell : PassThrough;

  const [pendingNotices, setPendingNotices] = useState<AdminNotice[]>([]);

  useEffect(() => {
    if (user?.isAdmin) {
      adminNoticeService
        .getPendingNotices()
        .then((notices) => {
          if (notices && Array.isArray(notices)) {
            setPendingNotices(notices);
          }
        })
        .catch(() => {});
    }
  }, [user?.id, user?.isAdmin]);

  const handleDismissNotice = async (noticeId: string) => {
    setPendingNotices((prev) => prev.filter((n) => n.id !== noticeId));
    try {
      await adminNoticeService.dismissNotice(noticeId);
    } catch {
      adminNoticeService
        .getPendingNotices()
        .then((notices) => setPendingNotices(notices || []))
        .catch(() => {});
    }
  };

  return (
    <>
      <Head>
        {/* No user-scalable=no / maximum-scale here — that blocks pinch-zoom
            entirely, a WCAG 1.4.4 (Resize Text) failure for low-vision
            visitors. */}
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
      </Head>
      <IntlProvider
        messages={i18nUtil.getLocaleByCode(language)?.messages}
        locale={language}
        defaultLocale={LOCALES.ENGLISH.code}
      >
        <MantineProvider withGlobalStyles withNormalizeCSS theme={mergedTheme}>
          <ColorSchemeProvider
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
          >
            <GlobalStyle />
            <RunwayStyle />
            <Notifications />
            <ModalsProvider
              // Mantine's scroll lock sets `position: relative` and
              // `overflow: hidden` on the body and, in 6.0.21, captures
              // scrollTop on lock but never reads it back on unlock — the
              // restore is dead code. Under the runway that is not a
              // cosmetic bug: locking unparks the document, so opening any
              // modal drops the photograph out from under the bars and
              // closing it does not put it back. Dropped on the runway
              // routes only, where the page has no scroll of its own to
              // lock anyway (the scrolling lives in the shell's inner
              // scroller, which the modal overlay covers regardless).
              modalProps={runway ? { lockScroll: false } : undefined}
            >
              <LanguageContext.Provider value={{ language, switchLanguage }}>
                <ConfigContext.Provider
                  value={{
                    configVariables,
                    refresh: async () => {
                      setConfigVariables(await configService.list());
                    },
                  }}
                >
                  <UserContext.Provider
                    value={{
                      user,
                      refreshUser: async () => {
                        const user = await userService.getCurrentUser();
                        setUser(user);
                        return user;
                      },
                    }}
                  >
                    <TermsAcceptanceContext.Provider
                      value={{ hasAcceptedTerms, acceptTerms }}
                    >
                      <AdminNoticeModal
                        notice={pendingNotices[0] || null}
                        onDismiss={handleDismissNotice}
                      />
                      {Component.getLayout ? (
                        Component.getLayout(<Component {...pageProps} />)
                      ) : (
                        <Shell lockZoom={lockZoom}>
                          <Stack
                            justify="space-between"
                            sx={{
                              // 100vh is defined against the LARGE viewport —
                              // the one a phone shows only once its browser
                              // chrome has retracted — not the area actually
                              // visible at rest. Measured live on iOS Safari
                              // (iPhone 17): 100vh = 754px while the visible
                              // viewport is 714px, so this floor alone made
                              // every page exactly 40px taller than the screen
                              // and left the whole app scrollable by that much
                              // with nothing to scroll to. 100dvh tracks the
                              // real, current visible viewport instead, which
                              // is what "fill the screen" was always meant to
                              // say. No feedback loop: a page that exactly
                              // fills the visible area never scrolls, so the
                              // chrome never retracts, so dvh never grows.
                              // The 100vh below it stays as the fallback for
                              // engines without dvh (Safari < 15.4, Chrome <
                              // 108), where it keeps today's behaviour.
                              minHeight: "100vh",
                              "@supports (min-height: 100dvh)": {
                                minHeight: "100dvh",
                              },
                            }}
                          >
                            <div
                              style={{
                                paddingTop: HEADER_HEIGHT,
                                // Footer is a fixed, floating glass bar (see
                                // Footer.tsx) rather than flow content, so
                                // nothing pushes it down naturally the way a
                                // normal last element would — without this,
                                // a page whose content reaches the bottom of
                                // the viewport would have its last bit hidden
                                // underneath it. --cookie-notice-clearance
                                // (see CookieNotice.tsx) stacks the same way
                                // for the notice floating just above the
                                // footer - 0px once it's dismissed or never
                                // shown.
                                paddingBottom:
                                  "calc(var(--footer-height, 40px) + var(--cookie-notice-clearance, 0px) + var(--brand-caption-clearance, 0px))",
                                // Eased on the same clock as the centring
                                // band that cancels it (SplitTransferLayout's
                                // cardSlot), because the two read the SAME
                                // --cookie-notice-clearance from opposite
                                // sides: the band subtracts what this adds.
                                // Animating one and stepping the other makes
                                // them briefly disagree — when the notice
                                // appears, this padding jumped its full
                                // height at once while the band was still
                                // easing down, leaving the page ~54px taller
                                // than the screen for the length of the
                                // transition, i.e. a scrollable range that
                                // exists for 300ms and then does not.
                                transition: `padding-bottom ${BAND_SETTLE_MS}ms ${BAND_SETTLE_EASING}`,
                              }}
                            >
                              <Header />
                              <Container>
                                <Component {...pageProps} />
                              </Container>
                              {
                                // The photo credit lands here: last thing in
                                // the page's content box, above the strip
                                // this div's own padding reserves for the
                                // floating footer. In the flow, so it scrolls
                                // away with everything else instead of being
                                // pinned to the screen and hidden whenever it
                                // would cover something. Renders nothing at
                                // all off the runway.
                              }
                              <PageEndSlot />
                            </div>
                            <Footer />
                          </Stack>
                          {
                            // Only on the default (non-admin) layout - a first
                            // -time *visitor* is who this is for; by the time
                            // someone reaches /admin/*, they're already an
                            // authenticated admin, not someone who needs an
                            // introductory cookie notice.
                          }
                          <CookieNotice />
                        </Shell>
                      )}
                    </TermsAcceptanceContext.Provider>
                  </UserContext.Provider>
                </ConfigContext.Provider>
              </LanguageContext.Provider>
            </ModalsProvider>
          </ColorSchemeProvider>
        </MantineProvider>
      </IntlProvider>
    </>
  );
}

// Fetch user and config variables on server side when the first request is made
// These will get passed as a page prop to the App component and stored in the contexts
App.getInitialProps = async ({ ctx }: { ctx: GetServerSidePropsContext }) => {
  let pageProps: {
    user?: CurrentUser;
    configVariables?: Config[];
    colorScheme: ColorScheme;
    language?: string;
    isConfigFallback?: boolean;
    needsSetup?: boolean;
    hasAcceptedTerms?: boolean;
  } = {
    // Light mode is retired from display for now — "dark" instead of the
    // original "light" fallback so a first-time visitor (no cookie yet)
    // gets dark from the very first server-rendered byte, not a flash of
    // light before the client-side force-dark effect below corrects it.
    colorScheme:
      (getCookie("mantine-color-scheme", ctx) as ColorScheme) ?? "dark",
    // Same reasoning, same mechanism, for the upload page's terms gate —
    // see the hasAcceptedTerms state below for why this has to be a cookie
    // rather than the localStorage read it used to be.
    hasAcceptedTerms: getCookie("termsAccepted", ctx) === "true",
  };

  if (ctx.req) {
    const apiURL = process.env.API_URL || "http://localhost:8080";
    const cookieHeader = ctx.req.headers.cookie;

    pageProps.user = await axios(`${apiURL}/api/users/me`, {
      headers: { cookie: cookieHeader },
    })
      .then((res) => res.data)
      .catch(() => null);

    try {
      pageProps.configVariables = (
        await axios(`${apiURL}/api/configs`, {
          timeout: 1000,
        })
      ).data;
    } catch (e) {
      pageProps.configVariables = getDefaultConfig();
      pageProps.isConfigFallback = true;
    }

    pageProps.needsSetup = await axios(`${apiURL}/api/auth/needsSetup`, {
      timeout: 1000,
    })
      .then((res) => res.data.needsSetup === true)
      .catch(() => false);

    const requestLanguage = i18nUtil.getLanguageFromAcceptHeader(
      ctx.req.headers["accept-language"],
    );

    const defaultLanguage = pageProps.configVariables?.find(
      (item) => item.key === "general.defaultLanguage",
    )?.value;

    pageProps.language =
      ctx.req.cookies["language"] || defaultLanguage || requestLanguage;
  }
  return { pageProps };
};

export default App;
