import { Box, Card, SimpleGrid, Text, Textarea } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useState } from "react";
import useTranslate from "../../../hooks/useTranslate.hook";
import LegalMarkdown from "../../legal/LegalMarkdown";

// Fixed rather than autosize: two panes need to stay the same height to
// sit side by side sensibly, and autosize (driven by the raw Markdown's
// own line count) would make that height jump around as the admin types.
// Each pane scrolls internally instead once its content outgrows this.
const EDITOR_HEIGHT = 420;

// Split-pane Markdown editor for the two "legal" text config fields
// (imprintText, privacyPolicyText) — a plain Textarea (still the case for
// every other `type: "text"` config field, see AdminConfigInput) is real
// friction for content this long, especially the privacy policy's cookie
// table, which is unreadable as raw Markdown and impossible to sanity
// -check without saving and opening /privacy in another tab. The preview
// pane renders through LegalMarkdown — the exact component the public
// /imprint and /privacy pages use — so what's shown here while typing is
// never just a lookalike of the real page, it's the real page's own
// rendering, live.
//
// Deliberately bypasses AdminConfigInput's generic per-row dispatch (see
// [category].tsx's "legal" branch) rather than adding a case there: every
// other config row there is 50/50 label-left input-right, which is
// exactly the width constraint this editor needs to break out of.
const LegalContentEditor = ({
  initialValue,
  placeholder,
  disabled,
  onChange,
}: {
  initialValue: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) => {
  const t = useTranslate();
  // Own local state, seeded once from initialValue and never resynced from
  // it afterward - the same "uncontrolled after init" shape
  // AdminConfigInput's useForm gives every other config field, so typing
  // here doesn't fight a parent re-render for who owns the displayed
  // value. onChange still fires on every keystroke, same as elsewhere, to
  // keep the parent's updatedConfigVariables (and therefore Save) in sync.
  const [value, setValue] = useState(initialValue);
  // Two full-height panes need real width to not feel cramped - narrower
  // than this and they stack instead (edit on top, preview below).
  const stacked = useMediaQuery("(max-width: 900px)");

  const handleChange = (next: string) => {
    setValue(next);
    onChange(next);
  };

  return (
    <SimpleGrid cols={stacked ? 1 : 2} spacing="md">
      <Box>
        <Text size="xs" color="dimmed" weight={600} tt="uppercase" mb={4}>
          {t("admin.config.legal.editor.markdown-label")}
        </Text>
        <Textarea
          autosize={false}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          styles={{
            input: {
              height: EDITOR_HEIGHT,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.6,
            },
          }}
        />
      </Box>
      <Box>
        <Text size="xs" color="dimmed" weight={600} tt="uppercase" mb={4}>
          {t("admin.config.legal.editor.preview-label")}
        </Text>
        <Card
          withBorder
          radius="sm"
          p="md"
          style={{ height: EDITOR_HEIGHT, overflowY: "auto" }}
        >
          {value ? (
            <LegalMarkdown content={value} />
          ) : (
            <Text size="sm" color="dimmed">
              {t("admin.config.legal.editor.preview-empty")}
            </Text>
          )}
        </Card>
      </Box>
    </SimpleGrid>
  );
};

export default LegalContentEditor;
