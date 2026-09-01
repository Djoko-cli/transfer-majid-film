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
        // Neither full width (471-021's own trailing edge left the short
        // lines - "Gratuit" - stranding a large empty gap after them, on
        // the right) nor the outer Stack's default shrink-to-fit-and-
        // center (which centers on this block's own widest line, landing
        // noticeably narrower than the description text below and voided
        // on both sides) - reported from the user's own screen both times.
        // align-self: flex-start opts this one child out of the parent's
        // align="center" so a plain marginLeft can position it directly
        // instead of being folded into a centering calculation (which
        // would just re-center the now-wider box rather than shift it) -
        // landing its left edge roughly where the description text's own
        // centered first line visually starts, so the two read as lined
        // up rather than the checklist looking independently placed.
      }
      <Stack
        spacing="xs"
        align="flex-start"
        sx={{ alignSelf: "flex-start", marginLeft: 32 }}
      >
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
