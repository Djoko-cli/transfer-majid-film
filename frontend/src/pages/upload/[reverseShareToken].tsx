import { Box, LoadingOverlay } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { GetServerSidePropsContext } from "next";
import { useEffect, useState } from "react";
import Upload from "../../components/upload/UploadPage";
import AuthGlassLayout from "../../components/auth/AuthGlassLayout";
import showErrorModal from "../../components/share/showErrorModal";
import shareService from "../../services/share.service";
import useTranslate from "../../hooks/useTranslate.hook";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { reverseShareToken: context.params!.reverseShareToken },
  };
}

const Share = ({ reverseShareToken }: { reverseShareToken: string }) => {
  const modals = useModals();
  const t = useTranslate();
  const [isLoading, setIsLoading] = useState(true);

  const [maxShareSize, setMaxShareSize] = useState(0);

  useEffect(() => {
    shareService
      .setReverseShare(reverseShareToken)
      .then((reverseShareTokenData) => {
        setMaxShareSize(parseInt(reverseShareTokenData.maxShareSize));
        setIsLoading(false);
      })
      .catch(() => {
        showErrorModal(
          modals,
          t("upload.reverse-share.error.invalid.title"),
          t("upload.reverse-share.error.invalid.description"),
          "go-home",
        );
        setIsLoading(false);
      });
  }, []);

  // Same glass shell (BrandPanel + card) the real content below mounts
  // into once the token resolves — a bare LoadingOverlay here used to
  // flash a blank page first, then hard-cut to the glass card the moment
  // loading finished. min-height keeps the card from collapsing around
  // nothing but a spinner, roughly matching the at-rest dropzone card
  // that's about to replace it, so that cut isn't a resize either.
  if (isLoading)
    return (
      <AuthGlassLayout>
        <Box sx={{ position: "relative", minHeight: 320 }}>
          <LoadingOverlay visible />
        </Box>
      </AuthGlassLayout>
    );

  return <Upload isReverseShare maxShareSize={maxShareSize} />;
};

export default Share;
