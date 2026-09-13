import { AppShell, Box, MantineProvider, useMantineTheme } from "@mantine/core";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";
import { ReactNode, useState } from "react";
import FullBleedShell, { useBackdropSlot } from "../core/FullBleedShell";
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
}
@keyframes adminNavReveal {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}`;

// Shared chrome for the whole /admin section (users, shares, config) —
// mounted once by _app.tsx's getLayout wiring rather than by each page, so
// navigating between them only swaps this content area, not the whole
// sidebar/header. The content is keyed by pathname so it still fades in on
// every such swap; the settings page's own category switches (same
// pathname, different query) don't retrigger this outer fade and instead
// use their own inner one, keyed by category.
// The admin section's own surface. Off the runway it is the background of
// AppShell's main, exactly as it always was. On the runway it moves into the
// backdrop slot instead, because that box spans the whole runway — strips
// included — so both the status-bar strip and the toolbar strip get the
// surface rather than the flat document colour. Measured before this change
// on a phone: the strips read (16,16,16) and (10,10,10), perfectly neutral,
// against a page at (29,20,13). A grey band top and bottom on a warm page.
const AdminSurface = () => {
  const theme = useMantineTheme();
  const backdropSlot = useBackdropSlot();
  if (!backdropSlot) return null;
  return createPortal(
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        background:
          theme.colorScheme === "dark"
            ? `radial-gradient(circle at 20% 0%, ${theme.colors[theme.primaryColor][9]}22 0%, ${theme.colors.dark[8]} 55%)`
            : `radial-gradient(circle at 20% 0%, ${theme.colors[theme.primaryColor][1]} 0%, ${theme.colors.gray[0]} 55%)`,
      }}
    />,
    backdropSlot,
  );
};

const AdminShell = ({ children }: { children: ReactNode }) => {
  const theme = useMantineTheme();
  const router = useRouter();
  const [isMobileNavBarOpened, setIsMobileNavBarOpened] = useState(false);
  const backdropSlot = useBackdropSlot();

  return (
    <>
      <AdminSurface />
      <AppShell
        styles={{
          main: {
            // Transparent on the runway: the surface is behind, in the
            // backdrop, so painting it here too would hide the strips' half
            // of it behind an opaque box.
            background: backdropSlot
              ? "transparent"
              : theme.colorScheme === "dark"
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
              animation:
                "adminContentFadeIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {children}
          </Box>
        </MantineProvider>
      </AppShell>
    </>
  );
};

// The rest of the app reaches the shell through _app's own <Shell> wrapper,
// which only covers the default layout — /admin/* comes in through
// getLayout and bypasses it entirely, so it mounts its own. lockZoom is off
// for the same reason the legal pages have it off: these are dense tables
// and settings forms, the kind of page someone magnifies.
const AdminLayout = ({ children }: { children: ReactNode }) => (
  <FullBleedShell lockZoom={false}>
    <AdminShell>{children}</AdminShell>
  </FullBleedShell>
);

export default AdminLayout;
