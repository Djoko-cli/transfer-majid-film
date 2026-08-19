import { AppShell, MantineProvider, useMantineTheme } from "@mantine/core";
import { ReactNode, useState } from "react";
import glassFormTheme from "../upload/glassFormTheme";
import AdminHeader from "./AdminHeader";
import AdminNavBar from "./AdminNavBar";

// Shared chrome for the whole /admin section (dashboard, users, shares,
// config) so navigating between them keeps the same sidebar/header instead
// of only the config page having one.
const AdminLayout = ({ children }: { children: ReactNode }) => {
  const theme = useMantineTheme();
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
      <MantineProvider inherit theme={glassFormTheme}>
        {children}
      </MantineProvider>
    </AppShell>
  );
};

export default AdminLayout;
