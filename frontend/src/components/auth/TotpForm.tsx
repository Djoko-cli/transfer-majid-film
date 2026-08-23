import { Button, Group, PinInput, Title } from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useRouter } from "next/router";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AuthGlassLayout from "./AuthGlassLayout";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import { safeRedirectPath } from "../../utils/router.util";
import toast from "../../utils/toast.util";

function TotpForm({ redirectPath }: { redirectPath: string }) {
  const t = useTranslate();
  const router = useRouter();
  const { refreshUser } = useUser();

  const [loading, setLoading] = useState(false);

  const validationSchema = yup.object().shape({
    code: yup
      .string()
      .min(6, t("common.error.too-short", { length: 6 }))
      .required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      code: "",
    },
    validate: yupResolver(validationSchema),
  });

  const onSubmit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await authService.signInTotp(
        form.values.code,
        router.query.loginToken as string,
      );
      await refreshUser();
      await router.replace(safeRedirectPath(redirectPath));
    } catch (e) {
      toast.axiosError(e);
      form.setFieldError("code", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGlassLayout>
      <Title order={2} align="center" weight={900}>
        <FormattedMessage id="totp.title" />
      </Title>
      <form onSubmit={form.onSubmit(onSubmit)} style={{ marginTop: 30 }}>
        <Group position="center">
          <PinInput
            length={6}
            oneTimeCode
            aria-label={t("totp.input.code.ariaLabel")}
            autoFocus={true}
            onComplete={onSubmit}
            {...form.getInputProps("code")}
          />
          <Button mt="md" type="submit" loading={loading}>
            {t("totp.button.signIn")}
          </Button>
        </Group>
      </form>
    </AuthGlassLayout>
  );
}

export default TotpForm;
