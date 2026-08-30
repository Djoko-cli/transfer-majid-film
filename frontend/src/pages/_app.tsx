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
import { useEffect, useRef, useState } from "react";
import { IntlProvider } from "react-intl";
import Header, { HEADER_HEIGHT } from "../components/header/Header";
import { ConfigContext } from "../hooks/config.hook";
import { UserContext } from "../hooks/user.hook";
import { LOCALES } from "../i18n/locales";
import authService from "../services/auth.service";
import configService from "../services/config.service";
import userService from "../services/user.service";
import GlobalStyle from "../styles/global.style";
import globalStyle from "../styles/mantine.style";
import Config from "../types/config.type";
import { CurrentUser } from "../types/user.type";
import i18nUtil from "../utils/i18n.util";
import userPreferences from "../utils/userPreferences.util";
import Footer from "../components/footer/Footer";
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

function App({ Component, pageProps }: AppPropsWithLayout) {
  const systemTheme = useColorScheme(pageProps.colorScheme);

  // Handed to Header so it can shift this element down (GPU-only transform,
  // not layout) by exactly its mobile menu's own height while open — see
  // Header's own comment on pushContentRef for the full reasoning. Only
  // meaningful for the default layout below (Container is what Header's
  // menu sits directly above); pages with their own getLayout don't render
  // Header here at all.
  const pageContentRef = useRef<HTMLDivElement>(null);

  const [colorScheme, setColorScheme] = useState<ColorScheme>(systemTheme);

  const [user, setUser] = useState<CurrentUser | null>(pageProps.user);

  const [configVariables, setConfigVariables] = useState<Config[]>(
    pageProps.configVariables,
  );

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

  const language = useRef(pageProps.language);
  moment.locale(language.current);

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
        messages={i18nUtil.getLocaleByCode(language.current)?.messages}
        locale={language.current}
        defaultLocale={LOCALES.ENGLISH.code}
      >
        <MantineProvider withGlobalStyles withNormalizeCSS theme={mergedTheme}>
          <ColorSchemeProvider
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
          >
            <GlobalStyle />
            <Notifications />
            <ModalsProvider>
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
                  <AdminNoticeModal
                    notice={pendingNotices[0] || null}
                    onDismiss={handleDismissNotice}
                  />
                  {Component.getLayout ? (
                    Component.getLayout(<Component {...pageProps} />)
                  ) : (
                    <>
                      <Stack
                        justify="space-between"
                        sx={{ minHeight: "100vh" }}
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
                            // underneath it.
                            paddingBottom: "var(--footer-height, 40px)",
                          }}
                        >
                          <Header pushContentRef={pageContentRef} />
                          <Container ref={pageContentRef}>
                            <Component {...pageProps} />
                          </Container>
                        </div>
                        <Footer />
                      </Stack>
                    </>
                  )}
                </UserContext.Provider>
              </ConfigContext.Provider>
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
  } = {
    // Light mode is retired from display for now — "dark" instead of the
    // original "light" fallback so a first-time visitor (no cookie yet)
    // gets dark from the very first server-rendered byte, not a flash of
    // light before the client-side force-dark effect below corrects it.
    colorScheme:
      (getCookie("mantine-color-scheme", ctx) as ColorScheme) ?? "dark",
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
