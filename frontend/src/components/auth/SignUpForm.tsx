import {
  Anchor,
  Box,
  Button,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AuthGlassLayout from "./AuthGlassLayout";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import toast from "../../utils/toast.util";

const SignUpForm = () => {
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
      <Title order={2} align="center" weight={900}>
        <FormattedMessage id="signup.title" />
      </Title>
      {config.get("share.allowRegistration") && (
        <Text color="dimmed" size="sm" align="center" mt={5}>
          <FormattedMessage id="signup.description" />{" "}
          <Anchor component={Link} href={"signIn"} size="sm">
            <FormattedMessage id="signup.button.signin" />
          </Anchor>
        </Text>
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
            <FormattedMessage id="signup.button.submit" />
          </Button>
        </form>
      </Box>
    </AuthGlassLayout>
  );
};

export default SignUpForm;
