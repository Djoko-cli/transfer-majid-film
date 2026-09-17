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
import { CompletedShare, Mode } from "../../../types/share.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import { getDefaultShareName } from "../../../utils/file.util";
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
  // Both callers pass true now: the main "/" flow (SplitTransferLayout)
  // and the reverse-share flow (AuthGlassLayout) each have their own
  // brand image behind this modal, so both get the glass treatment.
  // Reverse-share's completion screen used to stay on plain opaque
  // styling here regardless - a leftover from before that flow moved
  // onto AuthGlassLayout, not a deliberate difference; nothing about it
  // actually lacked a backdrop to read against. false remains the
  // default for a hypothetical caller with no glass backdrop of its own.
  glass = false,
  // "link" shows the real link (CopyTextField) plus the download-
  // notification line below when possible — showing it is the whole
  // point of a sender picking this mode. "email" hides the link instead
  // (recipients already have it directly) and shows a short confirmation
  // that they were notified. Undefined (the legacy reverse-share call
  // site, which never sets this) behaves like "link" minus that extra
  // line — shows the link, same as it always has.
  mode?: Mode,
  // Whether a download-notification email is actually possible right now
  // (smtp.enabled && email.enableShareDownloadNotifications) — only shown
  // as a promise in link-mode's copy when both are true, so it's never a
  // false claim.
  canNotifyOnDownload = false,
) => {
  const t = translateOutsideContext();

  // A share always reaches here with a name: leave the field blank and
  // TransferCard fills it from the files themselves (getDefaultShareName —
  // the single file's stem, or "2 fichiers"). Useful in "Mes partages",
  // where any label beats none, but it is not a title the sender chose, and
  // announcing it back to them as one ("« 2 fichiers » est prêt !") reads
  // like the app naming their work for them.
  //
  // So the generated name is recomputed and compared, rather than threaded
  // down from the form: whether the field was typed in is known three steps
  // up in TransferCard, and carrying a flag through share creation and
  // completion to reach this modal would touch far more than it explains.
  // Deterministic for the same files, so the comparison holds. Someone who
  // types the generated name verbatim gets the generic title — the same
  // words either way, just not in quotes.
  const generatedName = getDefaultShareName(share.files ?? [], t);
  const hasChosenName = !!share.name && share.name !== generatedName;

  return modals.openModal({
    closeOnClickOutside: true,
    withCloseButton: false,
    closeOnEscape: false,
    // Mantine only vertically centers a modal when told to — its default
    // pins the modal near the top of the viewport instead, which read as
    // off-balance for what should be this flow's confident closing moment.
    centered: true,
    // A short link field, a line of expiration text, and a button don't
    // fill a "xl"-wide modal without going wide and flat (778px measured
    // live at that size) — narrower keeps this compact content from
    // stretching sideways into a banner.
    size: 480,
    // Named when the share has one (true for essentially every share now
    // that naming isn't hidden behind a mode toggle — see TransferCard) so
    // the moment right after sending someone's own work confirms *what*
    // shipped, not just that "a" share exists somewhere.
    // "Envoyé" only where something was actually emailed. In Link mode
    // nothing leaves: the sender gets a URL and passes it on themselves, so
    // announcing a send there claimed an action the app had not performed —
    // while the mode that genuinely does send said only that the share was
    // "ready". The two were the wrong way round.
    //
    // Keyed on `mode === "email"` rather than on `mode !== "link"`, because
    // mode is undefined at the legacy reverse-share call site and that one
    // shows a link too. Negating "link" would have swept it into the sent
    // wording on the strength of a missing argument.
    title:
      mode === "email"
        ? hasChosenName
          ? t("upload.modal.completed.sent-named", { name: share.name })
          : t("upload.modal.completed.sent")
        : hasChosenName
          ? t("upload.modal.completed.ready-named", { name: share.name })
          : t("upload.modal.completed.ready"),
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
        // bottom padding instead, not the body's top padding. Both this and
        // the body's own bottom padding used to be inflated way past this
        // (120/130) chasing a specific roughly-square aspect ratio for the
        // modal box itself — reported directly as reading like dead space
        // once the content it was padding out actually included the link
        // field. Just comfortable, ordinary spacing now; the box is whatever
        // height its real content needs.
        // Takes the shared glass bar like every other modal. It was briefly
        // unpinned and untinted here, on the grounds that this modal has
        // nothing to occlude — measured: 292px tall and zero overflow in
        // email mode. That was solving the wrong problem. The bar looked
        // wrong everywhere, not just here (0.82 opacity against an app whose
        // every other glass surface sits at 0.5-0.6), and once it was brought
        // back inside the vocabulary the reason to single this modal out went
        // with it. Consistency across the set is worth more than removing a
        // bar that no longer costs anything to look at.
        header: { ...base.header, paddingTop: 32, paddingBottom: 20 },
        body: { ...base.body, padding: "0px 32px 32px" },
      };
    },
    children: (
      <Body
        share={share}
        appUrl={appUrl}
        defaultAppUrl={defaultAppUrl}
        anonymousEmail={anonymousEmail}
        glass={glass}
        mode={mode}
        canNotifyOnDownload={canNotifyOnDownload}
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
  mode,
  canNotifyOnDownload,
}: {
  share: CompletedShare;
  appUrl: string;
  defaultAppUrl: string;
  anonymousEmail?: string;
  glass: boolean;
  mode?: Mode;
  canNotifyOnDownload: boolean;
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

  // Non-reverse-share only: navigates back to "/" once this modal closes
  // (regardless of *how* — the "Terminé" button below, or a click outside
  // now that closeOnClickOutside is on), since this is the only thing that
  // unmounts it (the ModalsProvider lives above page transitions, so an
  // unrelated navigation elsewhere wouldn't trigger this).
  //
  // The reverse-share branch used to call router.reload() here instead —
  // removed. UploadPage's own completion handler already resets `files`
  // back to [] the instant this modal is opened (before the visitor could
  // possibly have closed it yet), which is everything this page needs to
  // be ready for a next transfer; a reload was never buying anything past
  // that except re-validating the token. For the common
  // remainingUses: 1 case, that re-validation is the token this exact
  // upload just consumed — walking the visitor straight into "this link
  // is invalid" the instant after successfully sending something, not a
  // fresh page ready for another. The backend enforces remainingUses/
  // expiration independently at request time either way (CreateShareGuard
  // → reverseShareService.isValid), so a visitor who does try to send
  // again through an exhausted link still gets a correct, and far less
  // alarming, inline error instead of this.
  useEffect(() => {
    return () => {
      if (!isReverseShare) {
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

        {
          // Shown for "link" and for undefined (the legacy reverse-share
          // call site, which never sets mode and has always shown the
          // link — untouched here). Hidden specifically for "email":
          // recipients already got the link directly, so showing it again
          // here just as raw text reads as something the sender still
          // needs to go share themselves, which isn't true in this mode -
          // reported directly after link-mode's own fix above (which
          // showed the link there for the first time) also made it show,
          // as it always had, in email mode, prompting a second look at
          // what email mode should actually confirm instead: that
          // recipients were already notified, not a link to still pass on.
        }
        {mode !== "email" && (
          <>
            <CopyTextField link={link} toggleQR={handleToggleQR} />
            <Collapse in={showQR}>
              <QRCode link={link} />
            </Collapse>
          </>
        )}
        {mode === "email" && (
          <Text size="sm">
            {t("upload.modal.completed.email-mode.recipients-notified")}
          </Text>
        )}
        {mode === "link" && canNotifyOnDownload && (
          <Text size="sm" color="dimmed">
            {t("upload.modal.completed.link-mode.download-notification")}
          </Text>
        )}
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
          // shown exactly once. The backend also emails it to the address
          // they typed; naming that here turns a silent safety net into
          // visible reassurance at the one moment losing the link would
          // otherwise feel catastrophic. Suppressed in link-mode: the copy
          // above already covers it, this would just repeat itself.
        }
        {mode !== "link" && anonymousEmail && (
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
            : t("upload.modal.completed.expires-detail", {
                // Both, because they answer different questions: the
                // relative form is the one that lands ("dans 3 jours"),
                // the absolute one is what you write down. moment's
                // locale is set globally in _app.tsx, so fromNow() and LL
                // follow the reader's language; only the time separator
                // does not, hence the format token in the translations.
                relative: moment(share.expiration).fromNow(),
                date: moment(share.expiration).format("LL"),
                time: moment(share.expiration).format(
                  t("upload.modal.completed.expires-time-format"),
                ),
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
