import { Box, Button, Progress } from "@mantine/core";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import { useSubmitButtonStyles } from "../core/submitButtonStyles";

const DownloadAllButton = ({
  shareId,
  recipientId,
  fullWidth,
  size,
  totalSize,
}: {
  shareId: string;
  recipientId?: string;
  fullWidth?: boolean;
  size?: string;
  // Uncompressed total of every file in the share (Share.size), used only
  // as an approximate denominator for a progress percentage. The zip is
  // built and streamed live, so its final (compressed) byte count isn't
  // known upfront — there's no Content-Length to read instead. This under-
  // counts rather than over-counts (the real download is usually smaller
  // than the sum of its uncompressed inputs), so the bar can reach 100%
  // a little before the stream actually ends, never the reverse — it never
  // looks stuck short of done. For near-incompressible content like video
  // or photos it's close to exact either way.
  totalSize?: number;
}) => {
  const [isZipReady, setIsZipReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // null outside of an in-progress streamed download; 0-and-counting-up
  // once one starts. Doubles as "are we on the streaming path right now"
  // for the render below, since the fallback path never touches it.
  const [bytesDownloaded, setBytesDownloaded] = useState<number | null>(null);
  const t = useTranslate();
  const { classes: shimmer } = useSubmitButtonStyles();

  // downloadFile() triggers a plain browser navigation (window.location.href
  // against a Content-Disposition: attachment response) rather than a
  // trackable fetch — deliberately: a large zip streams straight to the
  // browser's own download manager and disk that way, never buffered in
  // page memory first the way a fetch()+blob approach would. The tradeoff
  // is that nothing here can observe when the download actually starts or
  // finishes — downloadFile()'s own promise resolves the instant it *sets*
  // location.href, not when anything has downloaded, so awaiting it here
  // used to flip isLoading back off again within the same frame, an
  // imperceptible flash regardless of how long the real download took.
  // This fixed delay isn't a real progress signal (there isn't one to
  // have) — it's just long enough that the button reads as "yes, that
  // click registered and something is happening" instead of appearing to
  // do nothing. Only still used as a fallback below, for browsers that
  // can't do better (see supportsStreamingDownload).
  const DOWNLOAD_FEEDBACK_MS = 2500;

  // Chrome/Edge/Opera only as of early 2026 — Safari and Firefox have never
  // shipped showSaveFilePicker. Where it's available, the response streams
  // straight to a file the visitor picks, chunk by chunk: page memory use
  // stays flat regardless of share size, and real bytes-downloaded is known
  // as it happens — the case this matters for is exactly a multi-GB export,
  // where the alternative that *would* work everywhere (buffering the whole
  // response as a Blob first) risks exhausting tab memory. Where it's not
  // available, downloadFile()'s plain navigation is still the right call —
  // same disk-streaming property, via the browser's own download manager —
  // just with no page-visible progress, because there's nowhere to show it.
  const supportsStreamingDownload = () =>
    typeof window !== "undefined" && "showSaveFilePicker" in window;

  const downloadWithProgress = async () => {
    // Called first, before any other await: opening the native save dialog
    // needs the still-live user activation from the click that led here,
    // and that activation would be spent by awaiting anything else first.
    const handle = await window.showSaveFilePicker!({
      suggestedName: `${shareId}.zip`,
      types: [{ description: "Zip", accept: { "application/zip": [".zip"] } }],
    });
    const writable = await handle.createWritable();

    try {
      const response = await fetch(
        shareService.getFileUrl(shareId, "zip", recipientId),
        { credentials: "include" },
      );
      if (!response.ok || !response.body) {
        throw new Error(`Unexpected response status ${response.status}`);
      }

      const reader = response.body.getReader();
      let loaded = 0;
      setBytesDownloaded(0);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        loaded += value.byteLength;
        setBytesDownloaded(loaded);
      }
      await writable.close();
    } catch (error) {
      // Discard whatever partial bytes already made it to disk rather than
      // leaving a truncated file behind that looks like a complete one.
      await writable.abort().catch(() => {});
      throw error;
    }
  };

  const downloadAll = async () => {
    setIsLoading(true);

    if (supportsStreamingDownload()) {
      try {
        await downloadWithProgress();
      } catch (error) {
        // AbortError: the visitor closed the save dialog without picking a
        // location, or cancelled partway through — not a failure, and not
        // worth a toast for.
        if ((error as DOMException)?.name !== "AbortError") {
          toast.error(t("share.notify.download-all-failed"));
        }
      }
      setBytesDownloaded(null);
      setIsLoading(false);
      return;
    }

    // Fallback for Safari/Firefox: same plain navigation and fixed feedback
    // window as before streaming support existed — see DOWNLOAD_FEEDBACK_MS.
    shareService.downloadFile(shareId, "zip", recipientId);
    await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_FEEDBACK_MS));
    setIsLoading(false);
  };

  useEffect(() => {
    shareService
      .getMetaData(shareId)
      .then((share) => setIsZipReady(share.isZipReady))
      .catch(() => {});

    const timer = setInterval(() => {
      shareService
        .getMetaData(shareId)
        .then((share) => {
          setIsZipReady(share.isZipReady);
          if (share.isZipReady) clearInterval(timer);
        })
        .catch(() => clearInterval(timer));
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  // Never let a rounding fluke at the tail end (or totalSize slightly
  // under-counting, see the prop's own comment) read as a false 100% while
  // bytes are still arriving — held at 99 until the stream actually ends.
  const progressPercent =
    bytesDownloaded !== null && totalSize
      ? Math.min(99, Math.round((bytesDownloaded / totalSize) * 100))
      : null;

  return (
    <Box>
      <Button
        variant="light"
        color="cyan"
        fullWidth={fullWidth}
        size={size}
        loading={isLoading}
        // Le même scintillement que le bouton d'envoi, et à la même
        // condition : seulement quand l'action est vraiment disponible.
        // Tant que l'archive se construit, un clic ne rend qu'un message
        // « préparation en cours » — la faire scintiller inviterait à un
        // geste qui n'aboutit pas.
        className={isZipReady && !isLoading ? shimmer.ready : undefined}
        onClick={() => {
          if (!isZipReady) {
            toast.error(t("share.notify.download-all-preparing"));
          } else {
            downloadAll();
          }
        }}
      >
        {bytesDownloaded === null ? (
          <FormattedMessage id="share.button.download-all" />
        ) : progressPercent === null ? (
          byteToHumanSizeString(bytesDownloaded)
        ) : (
          `${progressPercent}%`
        )}
      </Button>
      {progressPercent !== null && (
        <Progress
          value={progressPercent}
          size="xs"
          mt={4}
          color="cyan"
          animate
        />
      )}
    </Box>
  );
};

export default DownloadAllButton;
