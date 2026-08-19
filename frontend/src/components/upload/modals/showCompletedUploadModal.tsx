import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  MantineProvider,
  Stack,
  Text,
  Collapse,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useState } from "react";
import moment from "moment";
import Link from "next/link";
import { useRouter } from "next/router";
import { TbX } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import { CompletedShare } from "../../../types/share.type";
import CopyTextField from "../CopyTextField";
import QRCode from "../../share/QRCode";
import glassFormTheme from "../glassFormTheme";
import { glassModalStyles } from "../glassModalTheme";

const showCompletedUploadModal = (
  modals: ModalsContextProps,
  share: CompletedShare,
  appUrl: string,
  defaultAppUrl: string,
  anonymousEmail?: string,
  // Only the main "/" flow (SplitTransferLayout + the brand image behind
  // it) gets the glass treatment — this same modal is also the completion
  // step for the legacy reverse-share flow, which has no brand image
  // behind it and stays on its plain opaque styling.
  glass = false,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    closeOnClickOutside: false,
    withCloseButton: false,
    closeOnEscape: false,
    title: t("upload.modal.completed.share-ready"),
    styles: glass ? glassModalStyles : undefined,
    children: (
      <Body
        share={share}
        appUrl={appUrl}
        defaultAppUrl={defaultAppUrl}
        anonymousEmail={anonymousEmail}
        glass={glass}
      />
    ),
  });
};

const Body = ({
  share,
  appUrl,
  defaultAppUrl,
  anonymousEmail,
  glass,
}: {
  share: CompletedShare;
  appUrl: string;
  defaultAppUrl: string;
  anonymousEmail?: string;
  glass: boolean;
}) => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();

  const [showQR, setShowQR] = useState(false);
  const [showAccountPrompt, setShowAccountPrompt] = useState(!!anonymousEmail);

  const handleToggleQR = () => {
    setShowQR(!showQR);
  };

  const isReverseShare = !!router.query["reverseShareToken"];

  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/s/${share.id}`;

  return (
    <MantineProvider inherit theme={glass ? glassFormTheme : {}}>
      <Stack align="stretch">
        <CopyTextField link={link} toggleQR={handleToggleQR} />
        <Collapse in={showQR}>
          <QRCode link={link} />
        </Collapse>
        {share.notifyReverseShareCreator === true && (
          <Text
            size="sm"
            sx={(theme) => ({
              color:
                theme.colorScheme === "dark"
                  ? theme.colors.gray[3]
                  : theme.colors.dark[4],
            })}
          >
            {t("upload.modal.completed.notified-reverse-share-creator")}
          </Text>
        )}
        <Text
          size="xs"
          sx={(theme) => ({
            color: theme.colors.gray[6],
          })}
        >
          {/* If our share.expiration is timestamp 0, show a different message */}
          {moment(share.expiration).unix() === 0
            ? t("upload.modal.completed.never-expires")
            : t("upload.modal.completed.expires-on", {
                expiration: moment(share.expiration).format("LLL"),
              })}
        </Text>

        {showAccountPrompt && anonymousEmail && (
          <Group
            position="apart"
            noWrap
            sx={(theme) => {
              const dark = theme.colorScheme === "dark";
              return {
                padding: theme.spacing.xs,
                borderRadius: theme.radius.sm,
                backgroundColor: glass
                  ? dark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(255, 255, 255, 0.4)"
                  : dark
                    ? theme.colors.dark[6]
                    : theme.colors.gray[0],
              };
            }}
          >
            <Text size="xs">
              <Anchor
                component={Link}
                href={`/auth/signUp?email=${encodeURIComponent(anonymousEmail)}`}
              >
                <FormattedMessage id="upload.modal.completed.create-account" />
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

        <Button
          onClick={() => {
            modals.closeAll();
            if (isReverseShare) {
              router.reload();
            } else {
              router.push("/");
            }
          }}
        >
          <FormattedMessage id="common.button.done" />
        </Button>
      </Stack>
    </MantineProvider>
  );
};

export default showCompletedUploadModal;
