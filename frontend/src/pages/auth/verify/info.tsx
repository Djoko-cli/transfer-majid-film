import { Title, Text, Button, Stack, PinInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import authService from "../../../services/auth.service";
import toast from "../../../utils/toast.util";
import useTranslate from "../../../hooks/useTranslate.hook";
import Meta from "../../../components/Meta";
import AuthGlassLayout from "../../../components/auth/AuthGlassLayout";

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerificationInfo() {
  const router = useRouter();
  const { email } = router.query;
  const t = useTranslate();
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(
      () => setCooldown((seconds) => seconds - 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [cooldown]);

  const codeForm = useForm({ initialValues: { code: "" } });

  const resendEmail = async () => {
    if (!email) return;
    setResending(true);
    authService
      .resendVerification(email as string)
      .then(() => {
        toast.success(t("verify.info.resend.success"));
        setCooldown(RESEND_COOLDOWN_SECONDS);
      })
      .catch((e) => {
        toast.axiosError(e);
      })
      .finally(() => setResending(false));
  };

  const submitCode = async (code: string) => {
    if (!email || verifying) return;
    setVerifying(true);
    authService
      .verifyAccountByCode(email as string, code)
      .then(() => setVerified(true))
      .catch((e) => {
        toast.axiosError(e);
        codeForm.setFieldValue("code", "");
      })
      .finally(() => setVerifying(false));
  };

  return (
    <>
      <Meta title={t("verify.info.title")} />
      <AuthGlassLayout>
        <Title order={2} align="center" weight={900}>
          <FormattedMessage id="verify.info.title" />
        </Title>
        {verified ? (
          <Stack align="center" mt={30}>
            <Text align="center">
              <FormattedMessage id="verify.success" />
            </Text>
            <Button fullWidth mt="xl" onClick={() => router.replace("/auth/signIn")}>
              <FormattedMessage id="verify.button.signin" />
            </Button>
          </Stack>
        ) : (
          <Stack align="center" mt={30}>
            <Text align="center">
              <FormattedMessage id="verify.info.description" />
            </Text>
            {email && (
              <Text weight={700} size="sm">
                {email}
              </Text>
            )}
            <form
              onSubmit={codeForm.onSubmit((values) => submitCode(values.code))}
            >
              <Stack align="center" mt="md">
                <PinInput
                  length={6}
                  type="number"
                  autoFocus
                  aria-label={t("verify.info.code.ariaLabel")}
                  disabled={verifying}
                  {...codeForm.getInputProps("code")}
                  onComplete={submitCode}
                />
                <Button type="submit" loading={verifying} fullWidth>
                  <FormattedMessage id="verify.info.code.button" />
                </Button>
              </Stack>
            </form>
            <Text align="center" size="sm" color="dimmed">
              <FormattedMessage id="verify.info.note" />
            </Text>
            <Stack w="100%" mt="xl">
              <Button
                variant="light"
                onClick={resendEmail}
                loading={resending}
                disabled={!email || cooldown > 0}
                fullWidth
              >
                {cooldown > 0 ? (
                  <FormattedMessage
                    id="verify.info.resend.button.cooldown"
                    values={{ seconds: cooldown }}
                  />
                ) : (
                  <FormattedMessage id="verify.info.resend.button" />
                )}
              </Button>
              <Button fullWidth variant="subtle" onClick={() => router.replace("/auth/signIn")}>
                <FormattedMessage id="verify.button.signin" />
              </Button>
            </Stack>
          </Stack>
        )}
      </AuthGlassLayout>
    </>
  );
}
