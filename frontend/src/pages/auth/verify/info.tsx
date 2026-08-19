import { Title, Text, Button, Stack } from "@mantine/core";
import { useRouter } from "next/router";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import authService from "../../../services/auth.service";
import toast from "../../../utils/toast.util";
import useTranslate from "../../../hooks/useTranslate.hook";
import Meta from "../../../components/Meta";
import AuthGlassLayout from "../../../components/auth/AuthGlassLayout";

export default function VerificationInfo() {
  const router = useRouter();
  const { email } = router.query;
  const t = useTranslate();
  const [loading, setLoading] = useState(false);

  const resendEmail = async () => {
    if (!email) return;
    setLoading(true);
    authService
      .resendVerification(email as string)
      .then(() => {
        toast.success(t("verify.info.resend.success"));
      })
      .catch((e) => {
        toast.axiosError(e);
      })
      .finally(() => setLoading(false));
  };

  return (
    <>
      <Meta title={t("verify.info.title")} />
      <AuthGlassLayout>
        <Title order={2} align="center" weight={900}>
          <FormattedMessage id="verify.info.title" />
        </Title>
        <Stack align="center" mt={30}>
          <Text align="center">
            <FormattedMessage id="verify.info.description" />
          </Text>
          {email && (
            <Text weight={700} size="sm">
              {email}
            </Text>
          )}
          <Text align="center" size="sm" color="dimmed">
            <FormattedMessage id="verify.info.note" />
          </Text>
          <Stack w="100%" mt="xl">
            <Button
              variant="light"
              onClick={resendEmail}
              loading={loading}
              disabled={!email}
              fullWidth
            >
              <FormattedMessage id="verify.info.resend.button" />
            </Button>
            <Button fullWidth onClick={() => router.replace("/auth/signIn")}>
              <FormattedMessage id="verify.button.signin" />
            </Button>
          </Stack>
        </Stack>
      </AuthGlassLayout>
    </>
  );
}
