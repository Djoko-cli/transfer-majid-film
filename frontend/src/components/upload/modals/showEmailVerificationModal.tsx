import {
  Anchor,
  Button,
  Group,
  MantineProvider,
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
import glassFormTheme from "../glassFormTheme";
import { glassModalStyles } from "../glassModalTheme";

const RESEND_COOLDOWN_SECONDS = 30;

const showEmailVerificationModal = (
  modals: ModalsContextProps,
  onVerified: (email: string) => void,
  knownEmail?: string,
  // La même modale sert deux contextes qui n'ont rien à voir : prouver son
  // adresse AVANT d'envoyer un transfert, et prouver celle avec laquelle on
  // vient de PAYER pour déverrouiller un transfert. Le texte par défaut parle
  // d'envoi ; l'acheteur qui déverrouille son achat lisait une consigne
  // d'expéditeur.
  descriptionId = "upload.verification.email.description",
) => {
  const t = translateOutsideContext();

  modals.openModal({
    title: t("upload.verification.title"),
    closeOnClickOutside: false,
    closeOnEscape: true,
    styles: glassModalStyles,
    children: (
      <MantineProvider inherit theme={glassFormTheme}>
        <Body
          knownEmail={knownEmail}
          descriptionId={descriptionId}
          onVerified={(email) => {
            modals.closeAll();
            onVerified(email);
          }}
        />
      </MantineProvider>
    ),
  });
};

const Body = ({
  onVerified,
  knownEmail,
  descriptionId,
}: {
  onVerified: (email: string) => void;
  knownEmail?: string;
  descriptionId: string;
}) => {
  const t = useTranslate();
  const [step, setStep] = useState<"email" | "code">(
    knownEmail ? "code" : "email",
  );
  const [email, setEmail] = useState(knownEmail || "");
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
    // Seeded from the already-known email (not a hardcoded blank) so that
    // clicking "change email" from the code step — the only way to reach
    // this step once knownEmail is set — starts from the address being
    // corrected instead of discarding it.
    initialValues: { email: knownEmail || "" },
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

  useEffect(() => {
    if (knownEmail) requestCode(knownEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <FormattedMessage id={descriptionId} />
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
            aria-disabled={cooldown > 0}
            sx={cooldown > 0 ? { cursor: "default" } : undefined}
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
