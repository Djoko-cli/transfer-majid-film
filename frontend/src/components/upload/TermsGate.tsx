import {
  Anchor,
  Button,
  Group,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { FormattedMessage } from "react-intl";
import { TbCircleCheck } from "react-icons/tb";
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
const TermsGate = ({
  onAccept,
  maxShareSize,
}: {
  onAccept: () => void;
  // Plain bytes, same shape UploadPage.tsx already computes for the real
  // dropzone right below this gate (user's own shareSizeLimit, falling
  // back to the instance's configured share.maxSize) - reused here rather
  // than a second hardcoded number, so this can't quietly drift out of
  // sync with the instance's actual configured limit the way a literal
  // "15" in a translation string could.
  maxShareSize: number;
}) => {
  const t = useTranslate();
  const theme = useMantineTheme();
  // Same computed-accent pattern already used for icon color everywhere
  // else in this app (TransferCard, Dropzone, PageDropOverlay) rather
  // than a literal hex - theme.colors.accent isn't a color react-icons'
  // own `color` prop understands, it wants a real CSS value.
  const accent =
    theme.colors[theme.primaryColor][theme.colorScheme === "dark" ? 4 : 6];

  // Short, scannable reassurance before the legal text below it asks for
  // a decision - four fixed, known-safe strings (never user content), so
  // plain t() + array index as key is fine here, no id/stability concerns
  // a dynamic list would have.
  const perks = [
    t("upload.termsGate.perks.size", {
      size: Math.round(maxShareSize / 1_000_000_000),
    }),
    t("upload.termsGate.perks.free"),
    t("upload.termsGate.perks.location"),
    t("upload.termsGate.perks.retention"),
  ];

  return (
    <Stack align="center" spacing="lg" py="md">
      {
        // sx width:100% rather than relying on the parent Stack's default
        // cross-axis sizing - the outer Stack's own align="center" (needed
        // so the description/button below stay centered) makes every
        // child shrink-wrap and center by default, which is exactly what
        // left this block narrower than the fullWidth button below it,
        // stranding empty space on both sides instead of lining up with
        // the rest of the card.
      }
      <Stack spacing="xs" align="flex-start" sx={{ width: "100%" }}>
        {perks.map((perk, index) => (
          <Group key={index} spacing="xs" noWrap>
            <TbCircleCheck color={accent} size={18} />
            <Text size="sm">{perk}</Text>
          </Group>
        ))}
      </Stack>
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
