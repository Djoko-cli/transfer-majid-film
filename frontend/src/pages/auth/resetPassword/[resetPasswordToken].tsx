import {
  Box,
  Button,
  createStyles,
  Group,
  PasswordInput,
  Text,
  Title,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AuthGlassLayout from "../../../components/auth/AuthGlassLayout";
import useTranslate from "../../../hooks/useTranslate.hook";
import authService from "../../../services/auth.service";
import toast from "../../../utils/toast.util";

const useStyles = createStyles((theme) => ({
  control: {
    [theme.fn.smallerThan("xs")]: {
      width: "100%",
    },
  },
}));

const ResetPassword = () => {
  const { classes } = useStyles();
  const router = useRouter();
  const t = useTranslate();

  const form = useForm({
    initialValues: {
      password: "",
      confirmPassword: "",
    },
    validate: yupResolver(
      yup.object().shape({
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 }))
          .required(t("common.error.field-required")),
        // oneOf([ref("password")]) rather than a hand-rolled equality
        // check - reads naturally as "must equal the password field" and
        // stays correct if either field's own rules change later. Checked
        // on submit, same as every other form in this app (none set
        // validateInputOnChange/Blur) - not live-as-you-type, but this
        // isn't a case where waiting matters much: password managers fill
        // both fields at once, and a manual retyper reaches Submit within
        // a keystroke or two of finishing the second field anyway.
        confirmPassword: yup
          .string()
          .oneOf([yup.ref("password")], t("common.error.passwords-dont-match"))
          .required(t("common.error.field-required")),
      }),
    ),
  });

  const resetPasswordToken = router.query.resetPasswordToken as string;

  return (
    <AuthGlassLayout width={460}>
      <Title order={2} weight={900} align="center">
        <FormattedMessage id="resetPassword.text.resetPassword" />
      </Title>
      <Text color="dimmed" size="sm" align="center">
        <FormattedMessage id="resetPassword.text.enterNewPassword" />
      </Text>

      <Box mt="xl">
        <form
          onSubmit={form.onSubmit((values) => {
            authService
              .resetPassword(resetPasswordToken, values.password)
              .then(() => {
                toast.success(t("resetPassword.notify.passwordReset"));

                router.push("/auth/signIn");
              })
              .catch(toast.axiosError);
          })}
        >
          <PasswordInput
            label={t("resetPassword.input.password")}
            placeholder="••••••••••"
            {...form.getInputProps("password")}
          />
          <PasswordInput
            mt="sm"
            label={t("resetPassword.input.confirmPassword")}
            placeholder="••••••••••"
            {...form.getInputProps("confirmPassword")}
          />
          <Group position="right" mt="lg">
            <Button type="submit" className={classes.control}>
              <FormattedMessage id="resetPassword.text.resetPassword" />
            </Button>
          </Group>
        </form>
      </Box>
    </AuthGlassLayout>
  );
};

export default ResetPassword;
