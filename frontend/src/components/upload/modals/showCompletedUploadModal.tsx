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
import mime from "mime-types";
import { useEffect, useState } from "react";
import moment from "moment";
import Link from "next/link";
import { useRouter } from "next/router";
import { TbX } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import { CompletedShare } from "../../../types/share.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
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
    closeOnClickOutside: true,
    withCloseButton: false,
    closeOnEscape: false,
    // Mantine only vertically centers a modal when told to — its default
    // pins the modal near the top of the viewport instead, which read as
    // off-balance for what should be this flow's confident closing moment.
    centered: true,
    // A short link field, a line of expiration text, and a button don't
    // fill a "xl"-wide modal without going wide and flat (778x215 measured
    // live — a 3.6:1 rectangle). Narrower, with generous padding around
    // that same compact content instead of stretching it sideways, lands
    // close to a balanced, roughly-square block.
    size: 480,
    // Named when the share has one (true for essentially every share now
    // that naming isn't hidden behind a mode toggle — see TransferCard) so
    // the moment right after sending someone's own work confirms *what*
    // shipped, not just that "a" share exists somewhere.
    title: share.name
      ? t("upload.modal.completed.share-ready-named", { name: share.name })
      : t("upload.modal.completed.share-ready"),
    styles: (theme: Parameters<typeof glassModalStyles>[0]) => {
      const base: Record<string, Record<string, unknown>> = glass
        ? glassModalStyles(theme)
        : {};
      return {
        ...base,
        // No close button here — dismissed via "Terminé" or a click outside
        // — so the title has the full header width to itself with nothing
        // to visually balance against on the right; centering it reads as
        // intentional instead of just off to one side for no reason.
        title: { ...base.title, width: "100%", textAlign: "center" },
        // Mantine forces the body's own padding-top to 0 whenever a header
        // is present (a built-in `:not(:only-child)` rule, unbeatable from
        // here) — so the gap above the content has to live in the header's
        // bottom padding instead, not the body's top padding.
        header: { ...base.header, paddingTop: 40, paddingBottom: 120 },
        // Generous bottom padding around the same compact content (link
        // field, expiration line, button) turns the box from a wide banner
        // into a balanced block closer to the 480 width — matching a
        // confirmation-sheet feel rather than stretching content sideways.
        body: { ...base.body, padding: "0px 32px 130px" },
      };
    },
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

  // Resets the page behind the modal for a next transfer — regardless of
  // *how* this modal closes (the "Terminé" button below, or a click outside
  // now that closeOnClickOutside is on), since this is the only thing that
  // unmounts it (the ModalsProvider lives above page transitions, so an
  // unrelated navigation elsewhere wouldn't trigger this).
  useEffect(() => {
    return () => {
      if (isReverseShare) {
        router.reload();
      } else {
        router.push("/");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/s/${share.id}`;

  // Files as returned by the completion endpoint: [{ id, name, size }, ...].
  // The completion endpoint doesn't always echo files/size back (older
  // backend builds only return {id, name, expiration, description} for
  // this call) — guarding on a real, positive count means this block
  // quietly does nothing rather than showing a broken "0 files · NaN"
  // line when that richer data isn't there yet.
  const files: { id: string; name: string }[] = Array.isArray(share.files)
    ? share.files
    : [];
  const fileCount = files.length;
  const hasSummary = fileCount > 0 && Number.isFinite(share.size);
  const firstImage = files.find((file) =>
    (mime.contentType(file.name) || "").startsWith("image/"),
  );
  const summary = hasSummary
    ? t(
        fileCount === 1
          ? "upload.modal.completed.summary.singular"
          : "upload.modal.completed.summary.plural",
        { count: fileCount, size: byteToHumanSizeString(share.size) },
      )
    : null;

  return (
    <MantineProvider inherit theme={glass ? glassFormTheme : {}}>
      <Stack align="stretch">
        {
          // The confirmation a photographer gets after sending their own
          // work shouldn't be a bare utility screen — a thumbnail of what's
          // actually in the share (when one of the files is an image) is
          // the one touch that's genuinely specific to this product rather
          // than any generic file-transfer tool's success toast.
        }
        {hasSummary && (
          <Group noWrap spacing="sm">
            {firstImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/shares/${share.id}/files/${firstImage.id}?download=false`}
                alt={firstImage.name}
                width={64}
                height={64}
                style={{
                  objectFit: "cover",
                  borderRadius: 12,
                  border: `1px solid ${glass ? "rgba(255, 255, 255, 0.25)" : "rgba(128, 128, 128, 0.25)"}`,
                  flexShrink: 0,
                }}
              />
            )}
            <Text size="sm" color="dimmed">
              {summary}
            </Text>
          </Group>
        )}

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
        {
          // An anonymous sender has no account and no "Mes partages" to
          // fall back to — this link is the only trace of the transfer,
          // shown exactly once. The backend now also emails it to the
          // address the OTP step already verified; naming that here turns
          // a silent safety net into visible reassurance at the one moment
          // losing the link would otherwise feel catastrophic.
        }
        {anonymousEmail && (
          <Text
            size="sm"
            sx={(theme) => ({
              color:
                theme.colorScheme === "dark"
                  ? theme.colors.gray[3]
                  : theme.colors.dark[4],
            })}
          >
            {t("upload.modal.completed.sender-emailed")}
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

        <Button onClick={() => modals.closeAll()}>
          <FormattedMessage id="common.button.done" />
        </Button>
      </Stack>
    </MantineProvider>
  );
};

export default showCompletedUploadModal;
