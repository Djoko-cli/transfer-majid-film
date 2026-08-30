import { Button } from "@mantine/core";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import toast from "../../utils/toast.util";

const DownloadAllButton = ({
  shareId,
  recipientId,
  fullWidth,
  size,
}: {
  shareId: string;
  recipientId?: string;
  fullWidth?: boolean;
  size?: string;
}) => {
  const [isZipReady, setIsZipReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslate();

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
  // do nothing, for every "download all" click alike. Deliberately uniform
  // across every share: a NAS-import one now builds its zip live rather
  // than reading a pre-made one, so the real wait can run meaningfully
  // longer than this — but the button can't reveal that without also
  // revealing which shares those are.
  const DOWNLOAD_FEEDBACK_MS = 2500;

  const downloadAll = async () => {
    setIsLoading(true);
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

  return (
    <Button
      variant="light"
      color="cyan"
      fullWidth={fullWidth}
      size={size}
      loading={isLoading}
      onClick={() => {
        if (!isZipReady) {
          toast.error(t("share.notify.download-all-preparing"));
        } else {
          downloadAll();
        }
      }}
    >
      <FormattedMessage id="share.button.download-all" />
    </Button>
  );
};

export default DownloadAllButton;
