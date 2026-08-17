import {
  Box,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  createStyles,
  rem,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { TbLock, TbInfinity, TbServer2, TbArrowRight } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Logo from "../components/Logo";
import Meta from "../components/Meta";
import useUser from "../hooks/user.hook";
import useConfig from "../hooks/config.hook";

const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  const primary = theme.colors[theme.primaryColor];

  return {
    // Breaks out of the parent <Container> so the hero can bleed full-width
    heroBleed: {
      position: "relative",
      left: "50%",
      right: "50%",
      marginLeft: "-50vw",
      marginRight: "-50vw",
      width: "100vw",
      overflow: "hidden",
      background: dark
        ? `linear-gradient(160deg, ${theme.colors.dark[8]} 0%, ${theme.colors.dark[7]} 100%)`
        : `linear-gradient(160deg, ${primary[0]} 0%, ${theme.white} 55%)`,
    },

    heroInner: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing.xl,
      paddingTop: `calc(${theme.spacing.xl} * 3.2)`,
      paddingBottom: `calc(${theme.spacing.xl} * 3.2)`,

      [theme.fn.smallerThan("md")]: {
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "center",
        paddingTop: `calc(${theme.spacing.xl} * 2)`,
        paddingBottom: `calc(${theme.spacing.xl} * 1.6)`,
      },
    },

    blob: {
      position: "absolute",
      borderRadius: "50%",
      filter: "blur(64px)",
      opacity: dark ? 0.35 : 0.55,
      pointerEvents: "none",
    },

    content: {
      flex: "1 1 0",
      maxWidth: 560,

      [theme.fn.smallerThan("md")]: {
        maxWidth: "100%",
      },
    },

    eyebrow: {
      display: "inline-flex",
      alignItems: "center",
      gap: rem(6),
      padding: `${rem(4)} ${rem(12)}`,
      borderRadius: theme.radius.xl,
      fontSize: rem(12),
      fontWeight: 700,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: dark ? primary[3] : primary[7],
      backgroundColor: dark
        ? theme.fn.rgba(primary[6], 0.18)
        : theme.fn.rgba(primary[6], 0.12),
      marginBottom: theme.spacing.md,
    },

    title: {
      fontSize: rem(56),
      lineHeight: 1.08,
      fontWeight: 900,
      letterSpacing: -1,
      color: dark ? theme.white : theme.black,

      [theme.fn.smallerThan("md")]: {
        fontSize: rem(38),
      },
    },

    highlight: {
      color: dark ? primary[4] : primary[6],
    },

    description: {
      fontSize: rem(18),
      lineHeight: 1.55,
      maxWidth: 480,

      [theme.fn.smallerThan("md")]: {
        maxWidth: "100%",
        marginLeft: "auto",
        marginRight: "auto",
      },
    },

    ctaRow: {
      [theme.fn.smallerThan("xs")]: {
        flexDirection: "column",
        alignItems: "stretch",

        button: { width: "100%" },
      },
    },

    visual: {
      flex: "0 0 auto",
      width: rem(360),
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      minHeight: rem(320),

      [theme.fn.smallerThan("md")]: {
        width: "100%",
        marginTop: theme.spacing.xl,
      },
    },

    backCard: {
      position: "absolute",
      width: rem(280),
      height: rem(200),
      borderRadius: theme.radius.lg,
      background: `linear-gradient(135deg, ${primary[5]} 0%, ${primary[7]} 100%)`,
      transform: "rotate(6deg) translate(18px, 10px)",
      boxShadow: theme.shadows.xl,
    },

    frontCard: {
      position: "relative",
      width: rem(280),
      borderRadius: theme.radius.lg,
      transform: "rotate(-4deg)",
      boxShadow: theme.shadows.xl,
      border: `1px solid ${dark ? theme.colors.dark[4] : theme.colors.gray[2]}`,
    },

    fileRow: {
      display: "flex",
      alignItems: "center",
      gap: rem(10),
      padding: `${rem(8)} ${rem(10)}`,
      borderRadius: theme.radius.sm,
      backgroundColor: dark ? theme.colors.dark[6] : theme.colors.gray[0],
    },

    progressTrack: {
      height: rem(6),
      borderRadius: theme.radius.xl,
      backgroundColor: dark ? theme.colors.dark[5] : theme.colors.gray[2],
      overflow: "hidden",
    },

    progressFill: {
      height: "100%",
      width: "72%",
      borderRadius: theme.radius.xl,
      background: `linear-gradient(90deg, ${primary[4]}, ${primary[7]})`,
    },

    featureCard: {
      height: "100%",
      transition: "transform 150ms ease, box-shadow 150ms ease",

      "&:hover": {
        transform: "translateY(-4px)",
        boxShadow: theme.shadows.md,
      },
    },
  };
});

export default function Home() {
  const { classes, theme } = useStyles();
  const { refreshUser } = useUser();
  const router = useRouter();
  const config = useConfig();
  const [signupEnabled, setSignupEnabled] = useState(true);

  // If user is already authenticated, redirect to the upload page
  useEffect(() => {
    refreshUser().then((user) => {
      if (user) {
        router.replace("/upload");
      }
    });

    // If registration is disabled, get started button should redirect to the sign in page
    try {
      const allowRegistration = config.get("share.allowRegistration");
      setSignupEnabled(allowRegistration !== false);
    } catch (error) {
      setSignupEnabled(true);
    }
  }, [config]);

  const getButtonHref = () => {
    return signupEnabled ? "/auth/signUp" : "/auth/signIn";
  };

  const features = [
    { id: "a", icon: TbServer2 },
    { id: "b", icon: TbLock },
    { id: "c", icon: TbInfinity },
  ];

  return (
    <>
      <Meta title="Home" />

      <Box className={classes.heroBleed}>
        <Box
          className={classes.blob}
          sx={{
            width: rem(420),
            height: rem(420),
            top: rem(-140),
            right: "8%",
            backgroundColor: theme.colors[theme.primaryColor][5],
          }}
        />
        <Box
          className={classes.blob}
          sx={{
            width: rem(260),
            height: rem(260),
            bottom: rem(-100),
            left: "4%",
            backgroundColor: theme.colors[theme.primaryColor][3],
          }}
        />

        <Container size="lg" className={classes.heroInner}>
          <div className={classes.content}>
            <span className={classes.eyebrow}>
              <FormattedMessage id="home.button.start" />
            </span>

            <Title className={classes.title}>
              <FormattedMessage
                id="home.title"
                values={{
                  h: (chunks) => (
                    <span className={classes.highlight}>{chunks}</span>
                  ),
                }}
              />
            </Title>

            <Text color="dimmed" mt="lg" className={classes.description}>
              <FormattedMessage id="home.description" />
            </Text>

            <Group mt={36} className={classes.ctaRow}>
              <Button
                component={Link}
                href={getButtonHref()}
                radius="xl"
                size="lg"
                rightIcon={<TbArrowRight size={18} />}
              >
                <FormattedMessage id="home.button.start" />
              </Button>
              <Button
                component={Link}
                href="https://github.com/smp46/pingvin-share-x"
                target="_blank"
                variant="default"
                radius="xl"
                size="lg"
              >
                <FormattedMessage id="home.button.source" />
              </Button>
            </Group>
          </div>

          <div className={classes.visual}>
            <div className={classes.backCard} />
            <Paper className={classes.frontCard} p="md" radius="lg" withBorder>
              <Group position="apart" mb="sm">
                <Logo width={28} height={28} />
                <Text size="xs" color="dimmed" weight={600}>
                  3 <FormattedMessage id="common.button.share" />
                </Text>
              </Group>

              <Stack spacing={8} mb="md">
                <div className={classes.fileRow}>
                  <Text size="sm" weight={500} truncate>
                    presentation.pdf
                  </Text>
                </div>
                <div className={classes.fileRow}>
                  <Text size="sm" weight={500} truncate>
                    photos.zip
                  </Text>
                </div>
                <div className={classes.fileRow}>
                  <Text size="sm" weight={500} truncate>
                    demo.mp4
                  </Text>
                </div>
              </Stack>

              <div className={classes.progressTrack}>
                <div className={classes.progressFill} />
              </div>
            </Paper>
          </div>
        </Container>
      </Box>

      <Container size="lg" mt={64} mb={64}>
        <SimpleGrid
          cols={3}
          spacing="lg"
          breakpoints={[{ maxWidth: "sm", cols: 1 }]}
        >
          {features.map(({ id, icon: Icon }) => (
            <Paper
              key={id}
              withBorder
              radius="lg"
              p="lg"
              className={classes.featureCard}
            >
              <ThemeIcon size={44} radius="xl" mb="md">
                <Icon size={22} />
              </ThemeIcon>
              <Text weight={700} size="lg" mb={4}>
                <FormattedMessage id={`home.bullet.${id}.name`} />
              </Text>
              <Text color="dimmed" size="sm">
                <FormattedMessage id={`home.bullet.${id}.description`} />
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Container>
    </>
  );
}
