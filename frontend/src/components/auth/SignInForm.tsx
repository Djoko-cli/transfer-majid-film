import {
  Anchor,
  Box,
  Button,
  Checkbox,
  createStyles,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { showNotification } from "@mantine/notifications";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { TbInfoCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AuthGlassLayout from "./AuthGlassLayout";
import useConfig from "../../hooks/config.hook";
import useOAuthProviders from "../../hooks/oauthProviders.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import {
  getOAuthIcon,
  getOAuthUrl,
  resolveOAuthOrigin,
} from "../../utils/oauth.util";
import { safeRedirectPath } from "../../utils/router.util";
import toast from "../../utils/toast.util";

const useStyles = createStyles((theme) => ({
  signInWith: {
    fontWeight: 500,
    "&:before": {
      content: "''",
      flex: 1,
      display: "block",
    },
    "&:after": {
      content: "''",
      flex: 1,
      display: "block",
    },
  },
  or: {
    "&:before": {
      content: "''",
      flex: 1,
      display: "block",
      borderTopWidth: 1,
      borderTopStyle: "solid",
      borderColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[3]
          : theme.colors.gray[4],
    },
    "&:after": {
      content: "''",
      flex: 1,
      display: "block",
      borderTopWidth: 1,
      borderTopStyle: "solid",
      borderColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[3]
          : theme.colors.gray[4],
    },
  },
}));

type TrustedDevice =
  | { recognized: false }
  | { recognized: true; username: string };

const SignInForm = ({ redirectPath }: { redirectPath: string }) => {
  const config = useConfig();
  const router = useRouter();
  const t = useTranslate();
  const { refreshUser } = useUser();
  const { classes } = useStyles();

  const { oauthProviders, isRedirecting: isRedirectingToOauthProvider } =
    useOAuthProviders();
  // null while the read-only recognition check is still in flight — kept
  // separate from the standard form's own loading state so both mount
  // effects can gate the same "don't flash the wrong view" render below.
  const [trustedDevice, setTrustedDevice] = useState<TrustedDevice | null>(
    null,
  );
  // "Ce n'est pas vous ?" forces the standard form back even when the
  // device is still recognized — doesn't wait on forgetTrustedDevice()'s
  // network round trip, that call just fires alongside it.
  const [showStandardForm, setShowStandardForm] = useState(false);
  const [signingInTrusted, setSigningInTrusted] = useState(false);
  // Starts false (matching what SSR already rendered, so hydration has
  // nothing to reconcile) and only ever flips true from the effect below
  // — localStorage doesn't exist during SSR, so this can't be read in the
  // initial render itself. Deliberately not part of the trusted-device
  // check above: that recognizes a specific remembered browser days or
  // weeks on; this greets whoever is at the keyboard right after they
  // themselves chose to leave, on any device, trusted or not.
  const [recentSignOut, setRecentSignOut] = useState(false);

  const validationSchema = yup.object().shape({
    emailOrUsername: yup.string().required(t("common.error.field-required")),
    password: yup.string().required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      emailOrUsername: "",
      password: "",
      rememberDevice: false,
    },
    validate: yupResolver(validationSchema),
  });

  const signIn = async (
    email: string,
    password: string,
    rememberDevice: boolean,
  ) => {
    await authService
      .signIn(email.trim(), password.trim(), rememberDevice)
      .then(async (response) => {
        if (response.data["loginToken"]) {
          // Prompt the user to enter their totp code
          showNotification({
            icon: <TbInfoCircle />,
            color: "blue",
            radius: "md",
            title: t("signIn.notify.totp-required.title"),
            message: t("signIn.notify.totp-required.description"),
          });
          router.push(
            `/auth/totp/${
              response.data["loginToken"]
            }?redirect=${encodeURIComponent(redirectPath)}&rememberDevice=${rememberDevice}`,
          );
        } else {
          await refreshUser();
          router.replace(safeRedirectPath(redirectPath));
        }
      })
      .catch(toast.axiosError);
  };

  // The one-click "Welcome back" button. Re-verifies the cookie server
  // side (the GET check below is read-only and proves nothing on its own)
  // — a trusted device's cookie is only ever set after a real TOTP
  // challenge already succeeded once on it, so the backend now skips
  // asking again here (see AuthService.signInTrusted's own comment), and
  // this always lands directly in the `else` branch below. The loginToken
  // branch is dead for this specific call as of that change, but left in
  // place rather than trimmed - harmless, and a fallback if that ever
  // changes again.
  const signInTrusted = async () => {
    setSigningInTrusted(true);
    try {
      const response = await authService.signInTrusted();
      if (response.data["loginToken"]) {
        router.push(
          `/auth/totp/${
            response.data["loginToken"]
          }?redirect=${encodeURIComponent(redirectPath)}&rememberDevice=true`,
        );
      } else {
        await refreshUser();
        router.replace(safeRedirectPath(redirectPath));
      }
    } catch {
      // Should essentially never happen — the recognition check just
      // passed moments earlier — so this falls back quietly to the
      // standard form rather than an alarming error toast.
      setShowStandardForm(true);
    } finally {
      setSigningInTrusted(false);
    }
  };

  const forgetDevice = () => {
    setShowStandardForm(true);
    authService.forgetTrustedDevice().catch(() => {});
  };

  useEffect(() => {
    authService
      .getTrustedDevice()
      .then(setTrustedDevice)
      .catch(() => setTrustedDevice({ recognized: false }));
    setRecentSignOut(authService.wasRecentlySignedOut());
  }, []);

  if (!oauthProviders || trustedDevice === null) return null;

  if (isRedirectingToOauthProvider)
    return (
      <Group align="center" position="center">
        <Loader size="sm" />
        <Text align="center">
          <FormattedMessage id="common.text.redirecting" />
        </Text>
      </Group>
    );

  if (trustedDevice.recognized && !showStandardForm) {
    return (
      <AuthGlassLayout>
        <Title order={2} align="center" weight={900}>
          <FormattedMessage
            id="signin.trusted.welcome-back"
            values={{ username: trustedDevice.username }}
          />
        </Title>
        <Stack mt={30}>
          <Button fullWidth onClick={signInTrusted} loading={signingInTrusted}>
            <FormattedMessage id="signin.trusted.button.submit" />
          </Button>
          <Anchor
            component="button"
            type="button"
            size="sm"
            align="center"
            onClick={forgetDevice}
          >
            <FormattedMessage id="signin.trusted.not-you" />
          </Anchor>
        </Stack>
      </AuthGlassLayout>
    );
  }

  return (
    <AuthGlassLayout>
      <Title order={2} align="center" weight={900}>
        <FormattedMessage
          id={recentSignOut ? "signin.title.recent-signout" : "signin.title"}
        />
      </Title>
      {config.get("share.allowRegistration") && (
        <Text color="dimmed" size="sm" align="center" mt={5}>
          <FormattedMessage id="signin.description" />{" "}
          <Anchor component={Link} href={"signUp"} size="sm">
            <FormattedMessage id="signin.button.signup" />
          </Anchor>
        </Text>
      )}
      <Box mt={30}>
        {config.get("oauth.disablePassword") || (
          <form
            onSubmit={form.onSubmit((values) => {
              signIn(
                values.emailOrUsername,
                values.password,
                values.rememberDevice,
              );
            })}
          >
            <TextInput
              label={t("signin.input.email-or-username")}
              placeholder={t("signin.input.email-or-username.placeholder")}
              {...form.getInputProps("emailOrUsername")}
            />
            <PasswordInput
              label={t("signin.input.password")}
              placeholder={t("signin.input.password.placeholder")}
              mt="md"
              {...form.getInputProps("password")}
            />
            <Group position="apart" mt="xs">
              <Checkbox
                label={t("signin.remember-device")}
                size="sm"
                {...form.getInputProps("rememberDevice", { type: "checkbox" })}
              />
              {config.get("smtp.enabled") && (
                <Anchor component={Link} href="/auth/resetPassword" size="xs">
                  <FormattedMessage id="resetPassword.title" />
                </Anchor>
              )}
            </Group>
            <Button fullWidth mt="xl" type="submit">
              <FormattedMessage id="signin.button.submit" />
            </Button>
          </form>
        )}
        {oauthProviders.length > 0 && (
          <Stack mt={config.get("oauth.disablePassword") ? undefined : "xl"}>
            {config.get("oauth.disablePassword") ? (
              <Group align="center" className={classes.signInWith}>
                <Text>{t("signIn.oauth.signInWith")}</Text>
              </Group>
            ) : (
              <Group align="center" className={classes.or}>
                <Text>{t("signIn.oauth.or")}</Text>
              </Group>
            )}
            <Group position="center">
              {oauthProviders.map((provider) => (
                <Button
                  key={provider}
                  component="a"
                  title={t(`signIn.oauth.${provider}`)}
                  href={getOAuthUrl(resolveOAuthOrigin(config), provider)}
                  variant="light"
                  fullWidth
                >
                  {getOAuthIcon(provider)}
                  {" " + t(`signIn.oauth.${provider}`)}
                </Button>
              ))}
            </Group>
          </Stack>
        )}
      </Box>
    </AuthGlassLayout>
  );
};

export default SignInForm;
