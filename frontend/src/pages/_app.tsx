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

const availableMantineColors = [
  "dark",
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
  "victoria",
] as const;
const availableMantineRadii = ["xs", "sm", "md", "lg", "xl"] as const;
const hexColorPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const normalizeHexColor = (value: string): string | null => {
  if (!hexColorPattern.test(value)) return null;
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value.toLowerCase();
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const mixHexColors = (
  baseHex: string,
  mixHex: string,
  weight: number,
): string => {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixHex);
  const inverseWeight = 1 - weight;

  return rgbToHex(
    base.r * inverseWeight + mix.r * weight,
    base.g * inverseWeight + mix.g * weight,
    base.b * inverseWeight + mix.b * weight,
  );
};

const createMantineScaleFromHex = (hex: string) =>
  [
    mixHexColors(hex, "#ffffff", 0.92),
    mixHexColors(hex, "#ffffff", 0.82),
    mixHexColors(hex, "#ffffff", 0.68),
    mixHexColors(hex, "#ffffff", 0.54),
    mixHexColors(hex, "#ffffff", 0.36),
    hex,
    mixHexColors(hex, "#000000", 0.1),
    mixHexColors(hex, "#000000", 0.22),
    mixHexColors(hex, "#000000", 0.34),
    mixHexColors(hex, "#000000", 0.46),
  ] as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

function App({ Component, pageProps }: AppPropsWithLayout) {
  const systemTheme = useColorScheme(pageProps.colorScheme);

  const [colorScheme, setColorScheme] = useState<ColorScheme>(systemTheme);

  const [user, setUser] = useState<CurrentUser | null>(pageProps.user);

  const [configVariables, setConfigVariables] = useState<Config[]>(
    pageProps.configVariables,
  );
  const getStringConfigValue = (key: string, fallback = ""): string => {
    const config = configVariables?.find((item) => item.key === key);
    return (config?.value ?? config?.defaultValue ?? fallback).trim();
  };

  const customCss = getStringConfigValue("appearance.customCss");
  const themePrimaryColorRaw = getStringConfigValue(
    "appearance.themePrimaryColor",
    "custom",
  );
  const themePrimaryColorOverrideRaw = getStringConfigValue(
    "appearance.themePrimaryColorOverride",
    "#ff7a00",
  );
  const themeRadiusRaw = getStringConfigValue("appearance.themeRadius", "md");
  const themeColorSchemeRaw = getStringConfigValue(
    "appearance.themeColorScheme",
    "system",
  );

  const normalizedPrimaryColorOverrideHex = normalizeHexColor(
    themePrimaryColorOverrideRaw,
  );
  const useCustomPrimaryColor = themePrimaryColorRaw === "custom";

  const effectivePrimaryHex = useCustomPrimaryColor
    ? normalizedPrimaryColorOverrideHex
    : null;

  const themePrimaryColor = effectivePrimaryHex
    ? "adminPrimary"
    : (availableMantineColors as readonly string[]).includes(
          themePrimaryColorRaw,
        )
      ? themePrimaryColorRaw
      : "gray";

  const themeRadius = (availableMantineRadii as readonly string[]).includes(
    themeRadiusRaw,
  )
    ? themeRadiusRaw
    : "sm";

  const adminDefaultColorScheme =
    themeColorSchemeRaw === "light" || themeColorSchemeRaw === "dark"
      ? themeColorSchemeRaw
      : "system";

  const adminTheme: MantineThemeOverride = {
    ...(effectivePrimaryHex
      ? {
          colors: {
            adminPrimary: createMantineScaleFromHex(effectivePrimaryHex),
          },
        }
      : {}),
    primaryColor: themePrimaryColor,
    defaultRadius: themeRadius,
  };

  const mergedTheme: MantineThemeOverride = {
    ...globalStyle,
    ...adminTheme,
    colorScheme,
    colors: {
      ...(globalStyle.colors ?? {}),
      ...(adminTheme.colors ?? {}),
    },
  };

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
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no"
        />
      </Head>
      <IntlProvider
        messages={i18nUtil.getLocaleByCode(language.current)?.messages}
        locale={language.current}
        defaultLocale={LOCALES.ENGLISH.code}
      >
        <MantineProvider withGlobalStyles withNormalizeCSS theme={mergedTheme}>
          {customCss && (
            <style id="admin-custom-css">
              {customCss.replace(/<\/style/gi, "<\\/style")}
            </style>
          )}
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
                          <Header />
                          <Container>
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
