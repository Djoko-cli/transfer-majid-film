import { AppShell, Box, MantineProvider, useMantineTheme } from "@mantine/core";
import { useRouter } from "next/router";
import { ReactNode, useState } from "react";
import glassFormTheme from "../upload/glassFormTheme";
import AdminHeader from "./AdminHeader";
import AdminNavBar from "./AdminNavBar";

// Registered once here (not per-page) via a raw <style> tag — Mantine's
// createStyles doesn't reliably serialize a top-level "@keyframes name" key
// into an actual CSS rule (see liquidGlassKeyframes.tsx for the same fix on
// the transfer card's own animations).
const ADMIN_CONTENT_FADE_CSS = `@keyframes adminContentFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}`;

// Shared chrome for the whole /admin section (users, shares, config) —
// mounted once by _app.tsx's getLayout wiring rather than by each page, so
// navigating between them only swaps this content area, not the whole
// sidebar/header. The content is keyed by pathname so it still fades in on
// every such swap; the settings page's own category switches (same
// pathname, different query) don't retrigger this outer fade and instead
// use their own inner one, keyed by category.
const AdminLayout = ({ children }: { children: ReactNode }) => {
  const theme = useMantineTheme();
  const router = useRouter();
  const [isMobileNavBarOpened, setIsMobileNavBarOpened] = useState(false);

  return (
    <AppShell
      styles={{
        main: {
          background:
            theme.colorScheme === "dark"
              ? `radial-gradient(circle at 20% 0%, ${theme.colors[theme.primaryColor][9]}22 0%, ${theme.colors.dark[8]} 55%)`
              : `radial-gradient(circle at 20% 0%, ${theme.colors[theme.primaryColor][1]} 0%, ${theme.colors.gray[0]} 55%)`,
        },
      }}
      navbar={
        <AdminNavBar
          isMobileNavBarOpened={isMobileNavBarOpened}
          setIsMobileNavBarOpened={setIsMobileNavBarOpened}
        />
      }
      header={
        <AdminHeader
          isMobileNavBarOpened={isMobileNavBarOpened}
          setIsMobileNavBarOpened={setIsMobileNavBarOpened}
        />
      }
    >
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CONTENT_FADE_CSS }} />
      <MantineProvider inherit theme={glassFormTheme}>
        <Box
          key={router.pathname}
          sx={{
            animation: "adminContentFadeIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {children}
        </Box>
      </MantineProvider>
    </AppShell>
  );
};

export default AdminLayout;
