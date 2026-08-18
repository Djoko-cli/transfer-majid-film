import {
  Anchor,
  Button,
  Group,
  PinInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import verificationService from "../../../services/verification.service";
import toast from "../../../utils/toast.util";

const RESEND_COOLDOWN_SECONDS = 30;

const showEmailVerificationModal = (
  modals: ModalsContextProps,
  onVerified: (email: string) => void,
) => {
  const t = translateOutsideContext();

  modals.openModal({
    title: t("upload.verification.title"),
    closeOnClickOutside: false,
    closeOnEscape: false,
    children: (
      <Body
        onVerified={(email) => {
          modals.closeAll();
          onVerified(email);
        }}
      />
    ),
  });
};

const Body = ({ onVerified }: { onVerified: (email: string) => void }) => {
  const t = useTranslate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(
      () => setCooldown((seconds) => seconds - 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [cooldown]);

  const emailForm = useForm({
    initialValues: { email: "" },
    validate: {
      email: (value) =>
        /^\S+@\S+\.\S+$/.test(value) ? null : t("common.error.invalid-email"),
    },
  });

  const codeForm = useForm({ initialValues: { code: "" } });

  const requestCode = async (targetEmail: string) => {
    setIsSubmitting(true);
    try {
      await verificationService.requestCode(targetEmail);
      toast.success(
        t("upload.verification.notify.code-sent", { email: targetEmail }),
      );
      setEmail(targetEmail);
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (code: string) => {
    setIsSubmitting(true);
    try {
      await verificationService.verifyCode(email, code);
      onVerified(email);
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "email") {
    return (
      <form
        onSubmit={emailForm.onSubmit((values) => requestCode(values.email))}
      >
        <Stack>
          <Text size="sm" color="dimmed">
            <FormattedMessage id="upload.verification.email.description" />
          </Text>
          <TextInput
            label={t("upload.verification.email.label")}
            autoFocus
            {...emailForm.getInputProps("email")}
          />
          <Group position="right">
            <Button type="submit" loading={isSubmitting}>
              <FormattedMessage id="upload.verification.email.button" />
            </Button>
          </Group>
        </Stack>
      </form>
    );
  }

  return (
    <form onSubmit={codeForm.onSubmit((values) => verifyCode(values.code))}>
      <Stack align="center">
        <Text size="sm" color="dimmed" align="center">
          <FormattedMessage
            id="upload.verification.code.description"
            values={{ email: <b>{email}</b> }}
          />
        </Text>
        <PinInput
          length={6}
          type="number"
          autoFocus
          {...codeForm.getInputProps("code")}
        />
        <Button type="submit" loading={isSubmitting} fullWidth>
          <FormattedMessage id="upload.verification.code.button" />
        </Button>
        <Group position="apart" w="100%">
          <Anchor size="sm" onClick={() => setStep("email")}>
            <FormattedMessage id="upload.verification.code.change-email" />
          </Anchor>
          <Anchor
            size="sm"
            onClick={() => cooldown <= 0 && requestCode(email)}
            color={cooldown > 0 ? "dimmed" : undefined}
          >
            {cooldown > 0 ? (
              <FormattedMessage
                id="upload.verification.code.resend.cooldown"
                values={{ seconds: cooldown }}
              />
            ) : (
              <FormattedMessage id="upload.verification.code.resend" />
            )}
          </Anchor>
        </Group>
      </Stack>
    </form>
  );
};

export default showEmailVerificationModal;
