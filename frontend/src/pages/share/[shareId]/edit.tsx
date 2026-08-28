import { Box, LoadingOverlay, MantineProvider } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { GetServerSidePropsContext } from "next";
import { useEffect, useState } from "react";
import Meta from "../../../components/Meta";
import showErrorModal from "../../../components/share/showErrorModal";
import EditableUpload from "../../../components/upload/EditableUpload";
import glassFormTheme from "../../../components/upload/glassFormTheme";
import SplitTransferLayout from "../../../components/upload/SplitTransferLayout";
import useConfirmLeave from "../../../hooks/confirm-leave.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { Share as ShareType } from "../../../types/share.type";

// Matches the main share page's own card width (see share/[shareId]/index)
// — same file-table content, same reasoning for needing more room than the
// 440px upload form.
const CARD_WIDTH = 640;

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { shareId: context.params!.shareId },
  };
}

const Share = ({ shareId }: { shareId: string }) => {
  const t = useTranslate();
  const modals = useModals();

  const [isLoading, setIsLoading] = useState(true);
  const [share, setShare] = useState<ShareType>();

  useConfirmLeave({
    message: t("upload.notify.confirm-leave"),
    enabled: isLoading,
  });

  useEffect(() => {
    shareService
      .getFromOwner(shareId)
      .then((share) => {
        setShare(share);
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (e.response.status == 404) {
          if (error == "share_removed") {
            showErrorModal(
              modals,
              t("share.error.removed.title"),
              e.response.data.message,
            );
          } else {
            showErrorModal(
              modals,
              t("share.error.not-found.title"),
              t("share.error.not-found.description"),
            );
          }
        } else if (e.response.status == 403 && error == "share_removed") {
          showErrorModal(
            modals,
            t("share.error.access-denied.title"),
            t("share.error.access-denied.description"),
          );
        } else {
          showErrorModal(modals, t("common.error"), t("common.error.unknown"));
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <SplitTransferLayout width={CARD_WIDTH}>
        <Box sx={{ position: "relative", minHeight: 240 }}>
          <LoadingOverlay visible />
        </Box>
      </SplitTransferLayout>
    );
  }

  return (
    <>
      <Meta title={t("share.edit.title", { shareId })} />
      <SplitTransferLayout width={CARD_WIDTH}>
        <MantineProvider inherit theme={glassFormTheme}>
          <EditableUpload
            shareId={shareId}
            files={share?.files || []}
            maxShareSize={
              share?.creator?.shareSizeLimit
                ? parseInt(share.creator.shareSizeLimit)
                : undefined
            }
          />
        </MantineProvider>
      </SplitTransferLayout>
    </>
  );
};

export default Share;
