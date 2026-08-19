import {
  Center,
  Col,
  Container,
  createStyles,
  Grid,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { useState } from "react";
import { TbLink, TbSettings, TbUsers } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import AdminLayout from "../../components/admin/AdminLayout";
import useTranslate from "../../hooks/useTranslate.hook";

const useStyles = createStyles((theme) => ({
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    height: 90,
    "&:hover": {
      boxShadow: `${theme.shadows.sm} !important`,
      transform: "scale(1.01)",
    },
  },
}));

const Admin = () => {
  const { classes, theme } = useStyles();
  const t = useTranslate();

  const [managementOptions] = useState([
    {
      title: t("admin.button.users"),
      icon: TbUsers,
      route: "/admin/users",
    },
    {
      title: t("admin.button.shares"),
      icon: TbLink,
      route: "/admin/shares",
    },
    {
      title: t("admin.button.config"),
      icon: TbSettings,
      route: "/admin/config/general",
    },
  ]);

  return (
    <>
      <Meta title={t("admin.title")} />
      <AdminLayout>
        <Container size="lg">
          <Title mb={30} order={3}>
            <FormattedMessage id="admin.title" />
          </Title>
          <Stack
            justify="space-between"
            style={{ height: "calc(100vh - 240px)" }}
          >
            <Paper p={40}>
              <Grid>
                {managementOptions.map((item) => {
                  return (
                    <Col xs={6} key={item.route}>
                      <Paper
                        component={Link}
                        href={item.route}
                        key={item.title}
                        className={classes.item}
                      >
                        <item.icon
                          color={
                            theme.colors[theme.primaryColor][
                              theme.colorScheme === "dark" ? 3 : 7
                            ]
                          }
                          size={35}
                        />
                        <Text mt={7}>{item.title}</Text>
                      </Paper>
                    </Col>
                  );
                })}
              </Grid>
            </Paper>

            <Center>
              <Text size="xs" color="dimmed">
                <FormattedMessage id="admin.version" /> {process.env.VERSION}
              </Text>
            </Center>
          </Stack>
        </Container>
      </AdminLayout>
    </>
  );
};

export default Admin;
