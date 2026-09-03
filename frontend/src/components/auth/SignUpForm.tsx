import {
  Anchor,
  Box,
  Button,
  Center,
  createStyles,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import Link from "next/link";
import { useRouter } from "next/router";
import { TbShieldStar } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AuthGlassLayout from "./AuthGlassLayout";
import useConfig from "../../hooks/config.hook";
import useOAuthProviders from "../../hooks/oauthProviders.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import {
  getOAuthIcon,
  getOAuthUrl,
  resolveOAuthOrigin,
} from "../../utils/oauth.util";
import toast from "../../utils/toast.util";

// Same visual recipe as SignInForm's own "OU" / "S'inscrire avec"
// dividers — kept as a separate copy rather than a shared export since
// createStyles ties a stylesheet to the component using it; duplicating
// ~25 lines of CSS is the right side of that tradeoff versus threading a
// third shared file through for styles alone.
const useStyles = createStyles((theme) => ({
  signUpWith: {
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

// `needsSetup` (from _app.tsx's getInitialProps, mirroring the middleware's
// own check — see needsSetup in middleware.ts) means no account exists on
// this instance yet: the generic "create an account" copy doesn't fit, and
// the "already have an account? sign in" line is actively misleading since
// there is, by definition, no one to sign in as yet.
const SignUpForm = ({ needsSetup }: { needsSetup?: boolean }) => {
  const config = useConfig();
  const router = useRouter();
  const t = useTranslate();
  const { refreshUser } = useUser();
  const { classes } = useStyles();
  const { oauthProviders, isRedirecting } = useOAuthProviders();

  const validationSchema = yup.object().shape({
    email: yup.string().email(t("common.error.invalid-email")).required(),
    username: yup
      .string()
      .min(3, t("common.error.too-short", { length: 3 }))
      .required(t("common.error.field-required")),
    password: yup
      .string()
      .min(8, t("common.error.too-short", { length: 8 }))
      .required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      email: typeof router.query.email === "string" ? router.query.email : "",
      username: "",
      password: "",
    },
    validate: yupResolver(validationSchema),
  });

  const signUp = async (email: string, username: string, password: string) => {
    await authService
      .signUp(email.trim(), username.trim(), password.trim())
      .then(async (response) => {
        if (response.data.verificationRequired) {
          router.replace({
            pathname: "/auth/verify/info",
            query: { email: email.trim() },
          });
        } else {
          const user = await refreshUser();
          if (user?.isAdmin) {
            router.replace("/admin/intro");
          } else {
            router.replace("/");
          }
        }
      })
      .catch(toast.axiosError);
  };

  if (!oauthProviders) return null;

  if (isRedirecting)
    return (
      <Group align="center" position="center">
        <Loader size="sm" />
        <Text align="center">
          <FormattedMessage id="common.text.redirecting" />
        </Text>
      </Group>
    );

  return (
    <AuthGlassLayout>
      {needsSetup && (
        <Center mb="xs">
          <ThemeIcon size={48} radius="xl" variant="light">
            <TbShieldStar size={26} />
          </ThemeIcon>
        </Center>
      )}
      <Title order={2} align="center" weight={900}>
        <FormattedMessage
          id={needsSetup ? "signup.onboarding.title" : "signup.title"}
        />
      </Title>
      {needsSetup ? (
        <Text color="dimmed" size="sm" align="center" mt={5}>
          <FormattedMessage id="signup.onboarding.description" />
        </Text>
      ) : (
        config.get("share.allowRegistration") && (
          <Text color="dimmed" size="sm" align="center" mt={5}>
            <FormattedMessage id="signup.description" />{" "}
            <Anchor component={Link} href={"signIn"} size="sm">
              <FormattedMessage id="signup.button.signin" />
            </Anchor>
          </Text>
        )
      )}
      <Box mt={30}>
        {config.get("oauth.disablePassword") || (
          <form
            onSubmit={form.onSubmit((values) =>
              signUp(values.email, values.username, values.password),
            )}
          >
            <TextInput
              label={t("signup.input.username")}
              placeholder={t("signup.input.username.placeholder")}
              {...form.getInputProps("username")}
            />
            <TextInput
              label={t("signup.input.email")}
              placeholder={t("signup.input.email.placeholder")}
              mt="md"
              {...form.getInputProps("email")}
            />
            <PasswordInput
              label={t("signin.input.password")}
              placeholder={t("signin.input.password.placeholder")}
              mt="md"
              {...form.getInputProps("password")}
            />
            <Button fullWidth mt="xl" type="submit">
              <FormattedMessage
                id={
                  needsSetup
                    ? "signup.onboarding.button.submit"
                    : "signup.button.submit"
                }
              />
            </Button>
          </form>
        )}
        {oauthProviders.length > 0 && (
          <Stack mt={config.get("oauth.disablePassword") ? undefined : "xl"}>
            {config.get("oauth.disablePassword") ? (
              <Group align="center" className={classes.signUpWith}>
                <Text>{t("signUp.oauth.signUpWith")}</Text>
              </Group>
            ) : (
              <Group align="center" className={classes.or}>
                <Text>{t("signUp.oauth.or")}</Text>
              </Group>
            )}
            <Group position="center">
              {oauthProviders.map((provider) => {
                // See oauth.oidc-signUpUrl's own comment in config.seed.ts
                // - some providers (confirmed: Pocket ID) have no sign-up
                // option on the OIDC authorization screen this button
                // would otherwise land on, only on their own login page.
                const oidcSignUpUrl =
                  provider === "oidc" && config.get("oauth.oidc-signUpUrl");
                return (
                  <Button
                    key={provider}
                    component="a"
                    title={t(`signIn.oauth.${provider}`)}
                    href={
                      oidcSignUpUrl ||
                      getOAuthUrl(resolveOAuthOrigin(config), provider)
                    }
                    target={oidcSignUpUrl ? "_blank" : undefined}
                    rel={oidcSignUpUrl ? "noopener noreferrer" : undefined}
                    variant="light"
                    fullWidth
                  >
                    {getOAuthIcon(provider)}
                    {" " + t(`signIn.oauth.${provider}`)}
                  </Button>
                );
              })}
            </Group>
          </Stack>
        )}
      </Box>
    </AuthGlassLayout>
  );
};

export default SignUpForm;
