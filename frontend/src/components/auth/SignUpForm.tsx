import {
  Anchor,
  Box,
  Button,
  Center,
  PasswordInput,
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
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import toast from "../../utils/toast.util";

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
                needsSetup ? "signup.onboarding.button.submit" : "signup.button.submit"
              }
            />
          </Button>
        </form>
      </Box>
    </AuthGlassLayout>
  );
};

export default SignUpForm;
