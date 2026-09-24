import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import Link from "next/link";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { TbCircleCheck, TbX } from "react-icons/tb";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import { byteToHumanSizeString } from "../../utils/fileSize.util";

// What a contributor sees once their deposit has landed, in the place the
// drop zone stood. A deposit used to end in silence — the zone emptied and
// the file list reloaded — which left someone who had looked away during a
// long upload not knowing whether it was over, whether anything was left
// to do, or whether anyone knew.
//
// In the card rather than in a modal: the direct send's modal carries the
// link to copy, and a contribution has nothing to take away, so a window
// to close would only be a click for nothing. It also stays out of the way
// of a second batch, which the drop zone deliberately supports.
const CollectionDepositDone = ({
  fileCount,
  totalSize,
  notifiesCreator,
  verifiedEmail,
  onDepositMore,
}: {
  fileCount: number;
  totalSize: number;
  notifiesCreator: boolean;
  // Set only for a signed-out visitor who proved this address by code —
  // the one person an account would spare a code next time.
  verifiedEmail?: string;
  // Absent once the collection has closed — possibly by this very deposit.
  onDepositMore?: () => void;
}) => {
  const t = useTranslate();
  const config = useConfig();
  const theme = useMantineTheme();
  // The same check, in the same accent, as the terms card's own list — the
  // product's one way of saying "this is done".
  const accent =
    theme.colors[theme.primaryColor][theme.colorScheme === "dark" ? 4 : 6];
  const [showAccountPrompt, setShowAccountPrompt] = useState(true);

  // Only where signing up is open, or the link would lead to a door that
  // says no.
  let canSignUp = false;
  try {
    canSignUp = config.get("share.allowRegistration") === true;
  } catch {
    // unknown key — keep the prompt out
  }

  return (
    <Stack spacing="sm" mt="lg" role="status">
      <Group spacing="xs" noWrap>
        <TbCircleCheck
          size={22}
          style={{ flexShrink: 0 }}
          color={accent}
          aria-hidden
        />
        <Title order={4}>
          <FormattedMessage id="share.collection.done.title" />
        </Title>
      </Group>
      <Text size="sm" color="dimmed">
        {t(
          fileCount === 1
            ? "upload.modal.completed.summary.singular"
            : "upload.modal.completed.summary.plural",
          { count: fileCount, size: byteToHumanSizeString(totalSize) },
        )}
      </Text>
      <Text size="sm">
        <FormattedMessage
          id={
            notifiesCreator
              ? "share.collection.done.creator-notified"
              : "share.collection.done.can-close"
          }
        />
      </Text>

      {onDepositMore && (
        <Button variant="light" size="md" onClick={onDepositMore}>
          <FormattedMessage id="share.collection.done.deposit-more" />
        </Button>
      )}

      {verifiedEmail && canSignUp && showAccountPrompt && (
        <Group
          position="apart"
          noWrap
          sx={(theme) => ({
            padding: theme.spacing.xs,
            borderRadius: theme.radius.sm,
            backgroundColor:
              theme.colorScheme === "dark"
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(255, 255, 255, 0.4)",
          })}
        >
          <Text size="xs">
            <Anchor
              component={Link}
              href={`/auth/signUp?email=${encodeURIComponent(verifiedEmail)}`}
            >
              <FormattedMessage id="share.collection.done.create-account" />
            </Anchor>
          </Text>
          <ActionIcon
            size="sm"
            onClick={() => setShowAccountPrompt(false)}
            aria-label={t("common.button.close")}
          >
            <TbX size={14} />
          </ActionIcon>
        </Group>
      )}
    </Stack>
  );
};

export default CollectionDepositDone;
