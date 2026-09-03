import {
  Center,
  MantineProvider,
  Paper,
  Space,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import { GetServerSidePropsContext } from "next";
import moment from "moment";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../../components/Meta";
import CenterLoader from "../../../components/core/CenterLoader";
import GlassPageBackdrop from "../../../components/core/GlassPageBackdrop";
import showErrorModal from "../../../components/share/showErrorModal";
import glassFormTheme from "../../../components/upload/glassFormTheme";
import useTranslate from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { ShareDownload } from "../../../types/share.type";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { shareId: context.params!.shareId },
  };
}

// Reporting page, not a transfer card — GlassPageBackdrop + a plain glass
// Table (same shell as account/shares.tsx) rather than SplitTransferLayout,
// which this same [shareId] route group's own edit.tsx uses for its
// single-card upload-editing UI. This page just lists rows.
const Downloads = ({ shareId }: { shareId: string }) => {
  const t = useTranslate();
  const modals = useModals();

  const [isLoading, setIsLoading] = useState(true);
  const [downloads, setDownloads] = useState<ShareDownload[]>([]);

  useEffect(() => {
    shareService
      .getDownloads(shareId)
      .then(setDownloads)
      .catch((e) => {
        if (e.response?.status === 404) {
          showErrorModal(
            modals,
            t("share.error.not-found.title"),
            t("share.error.not-found.description"),
          );
        } else if (e.response?.status === 403) {
          // Not share.error.access-denied.* - that copy ("Partage privé")
          // was written for a private *share*, a different situation from
          // lacking permission to see one's *download history*.
          showErrorModal(
            modals,
            t("share.downloads.error.access-denied.title"),
            t("share.downloads.error.access-denied.description"),
          );
        } else {
          showErrorModal(
            modals,
            t("common.error"),
            t("common.error.unknown"),
          );
        }
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <CenterLoader />;

  return (
    <>
      <Meta title={t("share.downloads.title", { shareId })} />
      <GlassPageBackdrop />
      <Title mt="xl" mb={30} order={2}>
        {t("share.downloads.title", { shareId })}
      </Title>
      {downloads.length === 0 ? (
        <Center style={{ height: "70vh" }}>
          <Stack align="center" spacing={10}>
            <Title order={2}>
              <FormattedMessage id="share.downloads.empty.title" />
            </Title>
            <Text>
              <FormattedMessage id="share.downloads.empty.description" />
            </Text>
            <Space h={5} />
          </Stack>
        </Center>
      ) : (
        // Glass-themed to match the rest of the account/upload chrome —
        // same reasoning as account/shares.tsx's identical wrapper.
        <MantineProvider inherit theme={glassFormTheme}>
          <Paper withBorder p="md" sx={{ overflowX: "auto" }}>
            <Table>
              <thead>
                <tr>
                  <th>
                    <FormattedMessage id="share.downloads.table.date" />
                  </th>
                  <th>
                    <FormattedMessage id="share.downloads.table.file" />
                  </th>
                  <th>
                    <FormattedMessage id="share.downloads.table.recipient" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {downloads.map((download) => (
                  <tr key={download.id}>
                    <td>{moment(download.createdAt).format("LLL")}</td>
                    <td>
                      {download.fileName ??
                        t("share.downloads.table.whole-archive")}
                    </td>
                    <td>
                      {download.recipientEmail ??
                        t("share.downloads.table.anonymous")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Paper>
        </MantineProvider>
      )}
    </>
  );
};

export default Downloads;
