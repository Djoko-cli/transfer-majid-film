import {
  Burger,
  Group,
  Header,
  MediaQuery,
  Text,
  useMantineTheme,
} from "@mantine/core";
import Link from "next/link";
import { Dispatch, SetStateAction } from "react";
import useConfig from "../../hooks/config.hook";
import ActionAvatar from "../header/ActionAvatar";
import Logo from "../Logo";

const AdminHeader = ({
  isMobileNavBarOpened,
  setIsMobileNavBarOpened,
}: {
  isMobileNavBarOpened: boolean;
  setIsMobileNavBarOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const config = useConfig();
  const theme = useMantineTheme();
  const dark = theme.colorScheme === "dark";

  return (
    <Header
      height={60}
      p="md"
      styles={{
        root: {
          background: dark
            ? "linear-gradient(160deg, rgba(255, 255, 255, 0.08) 0%, rgba(18, 18, 18, 0.5) 60%, rgba(255, 255, 255, 0.03) 100%)"
            : "linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.28) 60%, rgba(255, 255, 255, 0.35) 100%)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.5)"}`,
        },
      }}
    >
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        <Group position="apart" w="100%">
          <Link href="/" passHref>
            <Group>
              <Logo height={35} width={35} />
              <Text weight={600}>{config.get("general.appName")}</Text>
            </Group>
          </Link>
          <ActionAvatar />
        </Group>
        <MediaQuery largerThan="sm" styles={{ display: "none" }}>
          <Burger
            opened={isMobileNavBarOpened}
            onClick={() => setIsMobileNavBarOpened((o) => !o)}
            size="sm"
            ml="sm"
          />
        </MediaQuery>
      </div>
    </Header>
  );
};

export default AdminHeader;
