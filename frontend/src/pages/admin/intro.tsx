import {
  Button,
  Center,
  Container,
  MantineProvider,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import Logo from "../../components/Logo";
import Meta from "../../components/Meta";
import glassFormTheme from "../../components/upload/glassFormTheme";
import { APP_NAME } from "../../constants";
import useTranslate from "../../hooks/useTranslate.hook";

const Intro = () => {
  const t = useTranslate();
  const appName = APP_NAME;

  return (
    <>
      <Meta title={t("admin.intro.title", { appName })} />
      <Container size="xs">
        <MantineProvider inherit theme={glassFormTheme}>
          <Paper p="xl">
            <Stack>
              <Center>
                <Logo height={80} width={80} />
              </Center>
              <Center>
                <Title order={2}>{t("admin.intro.title", { appName })}</Title>
              </Center>
              <Text>{t("admin.intro.description")}</Text>
              <Text mt="lg">{t("admin.intro.question")}</Text>
              <Stack>
                <Button href="/admin/config/general" component={Link}>
                  {t("admin.intro.button.config")}
                </Button>
                <Button href="/" component={Link} variant="light">
                  {t("admin.intro.button.explore", { appName })}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </MantineProvider>
      </Container>
    </>
  );
};

export default Intro;
