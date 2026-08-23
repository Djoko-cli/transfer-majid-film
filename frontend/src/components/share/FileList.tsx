import {
  ActionIcon,
  Box,
  Group,
  Skeleton,
  Stack,
  Table,
  TextInput,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { TbDownload, TbEye, TbLink, TbClipboard } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileMetaData } from "../../types/File.type";
import { Share } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import TableSortIcon, { TableSort } from "../core/SortIcon";
import showFilePreviewModal from "./modals/showFilePreviewModal";
import { HoverTip } from "../core/HoverTip";
import api from "../../services/api.service";

const renderFileName = (name: string) => {
  const parts = name.split("/");
  if (parts.length === 1) return name;
  const fileName = parts.pop();
  const folderPath = parts.join("/");
  return (
    <span>
      <span style={{ opacity: 0.5 }}>{folderPath}/</span>
      <span style={{ fontWeight: 600 }}>{fileName}</span>
    </span>
  );
};

const FileList = ({
  files,
  setShare,
  share,
  isLoading,
  recipientId,
}: {
  files?: FileMetaData[];
  setShare: Dispatch<SetStateAction<Share | undefined>>;
  share: Share;
  isLoading: boolean;
  recipientId?: string;
}) => {
  const clipboard = useClipboard();
  const config = useConfig();
  const modals = useModals();
  const t = useTranslate();

  const [sort, setSort] = useState<TableSort>({
    property: "name",
    direction: "desc",
  });

  const sortFiles = () => {
    if (files && sort.property) {
      const sortedFiles = files.sort((a: any, b: any) => {
        if (sort.direction === "asc") {
          return b[sort.property!].localeCompare(a[sort.property!], undefined, {
            numeric: true,
          });
        } else {
          return a[sort.property!].localeCompare(b[sort.property!], undefined, {
            numeric: true,
          });
        }
      });

      setShare({
        ...share,
        files: sortedFiles,
      });
    }
  };

  const copyFileLink = (file: FileMetaData) => {
    const recipientQuery = recipientId
      ? `?recipient=${encodeURIComponent(recipientId)}`
      : "";
    const link = `${config.get("general.appUrl") !== config.get("general.appUrl", true) ? config.get("general.appUrl") : window.location.origin}/api/shares/${
      share.id
    }/files/${file.id}${recipientQuery}`;

    if (window.isSecureContext) {
      clipboard.copy(link);
      toast.success(t("common.notify.copied-link"));
    } else {
      modals.openModal({
        title: t("share.modal.file-link"),
        children: (
          <Stack align="stretch">
            <TextInput variant="filled" value={link} />
          </Stack>
        ),
      });
    }
  };

  useEffect(sortFiles, [sort]);

  return (
    <Box sx={{ display: "block", overflowX: "auto" }}>
      {/* table-layout: fixed pins the size/actions columns to an explicit
          width (their content never varies enough to need more) and lets
          the name column take whatever's left — under the default auto
          layout, a long file name grew the name column and squeezed the
          other two instead, both wrapping their header's icon onto its own
          line and, at the extreme, clipping the last action icon past the
          card's own edge. The name column's own overflow is then handled
          by truncating with an ellipsis (below) rather than growing. */}
      <Table style={{ tableLayout: "fixed", width: "100%" }}>
        <thead>
          <tr>
            <th>
              <Group spacing="xs" noWrap>
                <FormattedMessage id="share.table.name" />
                <TableSortIcon sort={sort} setSort={setSort} property="name" />
              </Group>
            </th>
            <th style={{ width: 110 }}>
              <Group spacing="xs" noWrap>
                <FormattedMessage id="share.table.size" />
                <TableSortIcon sort={sort} setSort={setSort} property="size" />
              </Group>
            </th>
            <th style={{ width: 160 }}></th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? skeletonRows
            : files!.map((file) => (
                <tr key={file.name}>
                  <td
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {renderFileName(file.name)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {byteToHumanSizeString(parseInt(file.size))}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Group position="right" noWrap>
                      {shareService.isShareTextFile(file.name) && (
                        <HoverTip label={t("share.copy-text-contents")}>
                          <ActionIcon
                            color="blue"
                            variant="light"
                            size={25}
                            onClick={() => {
                              api
                                .get(
                                  `/shares/${share.id}/files/${file.id}?download=false`,
                                )
                                .then((res) => {
                                  if (window.isSecureContext) {
                                    clipboard.copy(res.data);
                                    toast.success(
                                      t("share.notify.copied-contents"),
                                    );
                                  } else {
                                    toast.error(
                                      t("share.notify.copy-not-supported"),
                                    );
                                  }
                                });
                            }}
                          >
                            <TbClipboard />
                          </ActionIcon>
                        </HoverTip>
                      )}
                      {shareService.doesFileSupportPreview(file.name) && (
                        <HoverTip label={t("common.button.preview")}>
                          <ActionIcon
                            color="green"
                            variant="light"
                            size={25}
                            onClick={() =>
                              showFilePreviewModal(share.id, file, modals)
                            }
                          >
                            <TbEye />
                          </ActionIcon>
                        </HoverTip>
                      )}
                      {!share.hasPassword && (
                        <HoverTip label={t("common.button.copy-link")}>
                          <ActionIcon
                            color="victoria"
                            variant="light"
                            size={25}
                            onClick={() => copyFileLink(file)}
                          >
                            <TbLink />
                          </ActionIcon>
                        </HoverTip>
                      )}

                      <HoverTip label={t("common.button.download")}>
                        <ActionIcon
                          color="cyan"
                          variant="light"
                          size={25}
                          onClick={async () => {
                            await shareService.downloadFile(
                              share.id,
                              file.id,
                              recipientId,
                            );
                          }}
                        >
                          <TbDownload />
                        </ActionIcon>
                      </HoverTip>
                    </Group>
                  </td>
                </tr>
              ))}
        </tbody>
      </Table>
    </Box>
  );
};

// Three cells — matching the real table's Name/Size/Actions columns.
// Previously had a stray 4th cell, invisible under the old auto table
// layout (the browser just quietly folded it in), but table-layout: fixed
// above assigns column widths by index, so a mismatched cell count would
// now visibly misalign the skeleton against the real header.
const skeletonRows = [...Array(5)].map((c, i) => (
  <tr key={i}>
    <td>
      <Skeleton height={14} />
    </td>
    <td>
      <Skeleton height={14} width={70} />
    </td>
    <td>
      <Skeleton height={25} width={25} ml="auto" />
    </td>
  </tr>
));

export default FileList;
