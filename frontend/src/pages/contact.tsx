import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useState } from "react";
import { TbCircleCheck } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AuthGlassLayout from "../components/auth/AuthGlassLayout";
import AnimatedHeight from "../components/core/AnimatedHeight";
import Meta from "../components/Meta";
import useTranslate from "../hooks/useTranslate.hook";
import useUser from "../hooks/user.hook";
import contactService from "../services/contact.service";
import toast from "../utils/toast.util";

const Contact = () => {
  const t = useTranslate();
  const { user } = useUser();
  const theme = useMantineTheme();
  // Same computed-accent pattern used for the terms-gate checklist's own
  // checkmarks (TermsGate.tsx) and everywhere else an icon needs the brand
  // color as a real CSS value rather than a Mantine palette name.
  const accent =
    theme.colors[theme.primaryColor][theme.colorScheme === "dark" ? 4 : 6];

  // Swaps the form out for the confirmation once sent - AnimatedHeight
  // handles the height change between the two (a form is taller than one
  // line of confirmation text), same key-swap-for-a-fresh-fade pattern as
  // UploadPage's own TermsGate<->real-content transition.
  const [sent, setSent] = useState(false);

  const form = useForm({
    initialValues: {
      subject: "",
      message: "",
      // Honeypot - see its own field below for why this exists and why a
      // real visitor never touches it.
      website: "",
    },
    validate: yupResolver(
      yup.object().shape({
        subject: yup
          .string()
          .min(3, t("common.error.too-short", { length: 3 }))
          .max(200, t("common.error.too-long", { length: 200 }))
          .required(t("common.error.field-required")),
        message: yup
          .string()
          .min(10, t("common.error.too-short", { length: 10 }))
          .max(5000, t("common.error.too-long", { length: 5000 }))
          .required(t("common.error.field-required")),
      }),
    ),
  });

  return (
    <AuthGlassLayout width={460}>
      <Meta title={t("navbar.contact")} />

      <AnimatedHeight duration={300}>
        <Box
          key={sent ? "sent" : "form"}
          sx={{
            animation: "brandPanelFadeIn 300ms ease",
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          {sent ? (
            <Stack align="center" spacing="sm" py="md">
              <TbCircleCheck color={accent} size={48} />
              <Text align="center" weight={600}>
                <FormattedMessage id="contact.notify.success" />
              </Text>
            </Stack>
          ) : (
            <>
              <Title order={2} weight={900} align="center" mb="xl">
                <FormattedMessage id="contact.heading" />
              </Title>
              <form
                onSubmit={form.onSubmit((values) => {
                  contactService
                    .sendMessage(
                      values.subject,
                      values.message,
                      user?.email,
                      values.website,
                    )
                    .then(() => setSent(true))
                    .catch(toast.axiosError);
                })}
              >
                <TextInput
                  label={t("contact.input.subject")}
                  {...form.getInputProps("subject")}
                />
                <Textarea
                  mt="sm"
                  minRows={4}
                  autosize
                  label={t("contact.input.message")}
                  {...form.getInputProps("message")}
                />
                {
                  // Honeypot - invisible and unreachable for a real visitor
                  // (no tab stop, no screen reader, clipped to nothing) so
                  // only something enumerating every <input> on the page
                  // and filling it blind - a bot, never a person - ever
                  // puts a value in it. ContactController checks this
                  // server-side and quietly no-ops instead of sending mail
                  // when it's non-empty, without telling the caller
                  // anything went differently.
                }
                <TextInput
                  tabIndex={-1}
                  aria-hidden="true"
                  autoComplete="off"
                  sx={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0,0,0,0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                  {...form.getInputProps("website")}
                />
                <Group position="center" mt="lg">
                  <Button type="submit">
                    <FormattedMessage id="contact.button.send" />
                  </Button>
                </Group>
              </form>
            </>
          )}
        </Box>
      </AnimatedHeight>
    </AuthGlassLayout>
  );
};

export default Contact;
