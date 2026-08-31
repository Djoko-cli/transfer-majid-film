import { Anchor, Button, Stack, Text } from "@mantine/core";
import { FormattedMessage } from "react-intl";
import { APP_NAME } from "../../constants";
import useTranslate from "../../hooks/useTranslate.hook";

// Shown in place of the dropzone (see UploadPage.tsx) until a visitor has
// accepted the terms of use, once per browser. The terms link is a
// separate element from the accept Button, not nested inside it - Button
// renders a real <button>, and an <a> nested inside one is invalid HTML
// (interactive-in-interactive), unpredictable for click bubbling and for
// screen readers/keyboard nav.
//
// values={{termsLink: <Anchor>...}} - a complete element, not a chunks
// -function - matches the one other rich-message call site in this app
// (admin.config.s3.docs-link in [category].tsx) rather than react-intl's
// alternate <tag>chunks</tag> API, which nothing else here uses.
const TermsGate = ({ onAccept }: { onAccept: () => void }) => {
  const t = useTranslate();

  return (
    <Stack align="center" spacing="lg" py="md">
      <Text align="center" color="dimmed">
        <FormattedMessage
          id="upload.termsGate.description"
          values={{
            appName: APP_NAME,
            // Reuses terms.title rather than a separate translation key -
            // one fewer string to keep in sync if the page's own title
            // ever changes.
            termsLink: (
              <Anchor href="/terms" target="_blank" rel="noreferrer">
                {t("terms.title")}
              </Anchor>
            ),
          }}
        />
      </Text>
      <Button fullWidth onClick={onAccept}>
        <FormattedMessage id="upload.termsGate.accept" />
      </Button>
    </Stack>
  );
};

export default TermsGate;
