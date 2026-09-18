import { ActionIcon, Box, Group, Skeleton, Table } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { TbDownload, TbEye, TbClipboard } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
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

// Geometry of one row's action buttons, used to derive the actions column's
// width below. Kept next to each other so they stay in sync with the
// ActionIcon `size` and the <Group> spacing actually used in the render.
const ACTION_ICON_SIZE = 25;
const ACTION_ICON_GAP = 16; // <Group>'s default "md" spacing
const CELL_PADDING = 10; // Mantine's Table cell padding, per side

// How many action buttons a given file's row will render — mirrors the
// conditionals in the actions cell exactly (download is unconditional,
// the clipboard and preview ones depend on the file type).
const countActionIcons = (file: FileMetaData) =>
  1 +
  (shareService.isShareTextFile(file.name) ? 1 : 0) +
  (shareService.doesFileSupportPreview(file.name) ? 1 : 0);

const actionsColumnWidth = (iconCount: number) =>
  iconCount * ACTION_ICON_SIZE +
  Math.max(0, iconCount - 1) * ACTION_ICON_GAP +
  2 * CELL_PADDING;

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

  useEffect(sortFiles, [sort]);

  // One width for the whole actions column (a table column can only have
  // one — that's what keeps every column vertically aligned), but derived
  // from the most buttons any row in *this* share actually renders rather
  // than a hardcoded worst case. So a share of plain, non-previewable
  // binaries reserves room for 2 buttons, and only one containing a text
  // file (which adds the copy-contents button, on top of the preview one
  // text also qualifies for) reserves room for 3 — no dead space either
  // way, and whatever isn't reserved goes to the name column, since that's
  // the one with `width: auto` under table-layout: fixed.
  const maxActionIcons =
    files && files.length > 0
      ? Math.max(...files.map((file) => countActionIcons(file)))
      : 3;

  return (
    <Box sx={{ display: "block", overflowX: "auto" }}>
      {/* table-layout: fixed so the size/actions columns keep exactly the
          widths set below and the name column absorbs the remainder —
          under the default auto layout a long file name would instead grow
          the name column and squeeze the other two, wrapping their header's
          sort icon onto its own line and, at the extreme, clipping the last
          action button past the card's edge. The name column's own overflow
          then wraps onto extra lines (see the name cell) rather than
          widening the table or truncating the name away. */}
      <Table style={{ tableLayout: "fixed", width: "100%" }}>
        <thead>
          <tr>
            <th>
              <Group spacing="xs" noWrap>
                <FormattedMessage id="share.table.name" />
                <TableSortIcon
                  sort={sort}
                  setSort={setSort}
                  property="name"
                  label={t("share.table.name")}
                />
              </Group>
            </th>
            {/* Left-aligned like "Nom": 90px is this column's real minimum
                ("Taille" ≈ 35px + the Group's 10px gap + the sort icon's
                18px + 10px padding per side), so right-aligning the values
                inside it would only stagger them against the header rather
                than tidy anything up. */}
            <th style={{ width: 90 }}>
              <Group spacing="xs" noWrap>
                <FormattedMessage id="share.table.size" />
                <TableSortIcon
                  sort={sort}
                  setSort={setSort}
                  property="size"
                  label={t("share.table.size")}
                />
              </Group>
            </th>
            <th style={{ width: actionsColumnWidth(maxActionIcons) }}></th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? skeletonRows
            : files!.map((file) => (
                <tr key={file.name}>
                  <td
                    style={{
                      whiteSpace: "normal",
                      overflowWrap: "break-word",
                      verticalAlign: "top",
                    }}
                  >
                    {file.thumbnailStatus === "ready" ? (
                      <Group spacing="xs" noWrap>
                        <img
                          src={shareService.getThumbnailUrl(
                            share.id,
                            file.id,
                            recipientId,
                          )}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          style={{
                            width: 48,
                            height: 32,
                            objectFit: "cover",
                            borderRadius: 6,
                            flexShrink: 0,
                          }}
                        />
                        {renderFileName(file.name)}
                      </Group>
                    ) : (
                      renderFileName(file.name)
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {byteToHumanSizeString(parseInt(file.size))}
                  </td>
                  <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                    <Group position="right" noWrap>
                      {shareService.isShareTextFile(file.name) && (
                        <HoverTip label={t("share.copy-text-contents")}>
                          <ActionIcon
                            color="blue"
                            variant="light"
                            size={ACTION_ICON_SIZE}
                            aria-label={t("share.copy-text-contents")}
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
                            size={ACTION_ICON_SIZE}
                            aria-label={t("common.button.preview")}
                            onClick={() =>
                              showFilePreviewModal(share.id, file, modals)
                            }
                          >
                            <TbEye />
                          </ActionIcon>
                        </HoverTip>
                      )}
                      <HoverTip label={t("common.button.download")}>
                        <ActionIcon
                          color="cyan"
                          variant="light"
                          size={ACTION_ICON_SIZE}
                          aria-label={t("common.button.download")}
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

// Three cells, matching the real rows' name/size/actions columns —
// table-layout: fixed assigns widths by index, so a mismatched cell count
// would visibly misalign the skeleton against the header above it.
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
