import {
  ActionIcon,
  Box,
  Group,
  Skeleton,
  Stack,
  TextInput,
  useMantineTheme,
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
  const theme = useMantineTheme();
  const dark = theme.colorScheme === "dark";
  // Real <table> borders/colors used to come from glassFormTheme's Table
  // override, scoped to actual table/th/td selectors — replicated by hand
  // below now that this is a flex-based "table" instead (see the render's
  // own comment for why a real table couldn't do what was asked here).
  const borderColor = dark
    ? "rgba(255, 255, 255, 0.14)"
    : "rgba(255, 255, 255, 0.5)";
  const headerColor = dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)";
  const cellColor = dark ? theme.white : theme.black;

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

  const cellPadding = "10px";

  return (
    // A real <table> can't do what was asked here: table-layout: fixed (or
    // even auto) assigns each COLUMN a single width shared by every row —
    // there's no way for a row with 2 action icons to have a narrower
    // actions column than a row with 4, they're the same column. Flexbox
    // rows have no such constraint: each row lays itself out independently,
    // so the actions cell can size to exactly what that row's own icon
    // count needs, and the name cell (flex: 1) absorbs whatever's left —
    // more of it on rows with fewer icons, less on rows with more. The
    // size cell keeps a fixed width so it still reads as one aligned
    // column top to bottom; only the actions cell doesn't.
    // role="table"/"row"/"columnheader"/"cell" replicate a real table's
    // semantics for assistive tech, since the markup itself no longer is.
    <Box role="table" sx={{ display: "block", overflowX: "auto" }}>
      <Box
        role="row"
        sx={{ display: "flex", borderBottom: `1px solid ${borderColor}` }}
      >
        <Box
          role="columnheader"
          sx={{
            flex: 1,
            minWidth: 0,
            padding: cellPadding,
            color: headerColor,
          }}
        >
          <Group spacing="xs" noWrap>
            <FormattedMessage id="share.table.name" />
            <TableSortIcon sort={sort} setSort={setSort} property="name" />
          </Group>
        </Box>
        <Box
          role="columnheader"
          sx={{
            width: 90,
            flexShrink: 0,
            padding: cellPadding,
            color: headerColor,
          }}
        >
          <Group spacing="xs" noWrap>
            <FormattedMessage id="share.table.size" />
            <TableSortIcon sort={sort} setSort={setSort} property="size" />
          </Group>
        </Box>
        {/* No label lives here, so no width to reserve — the actions cell
            is empty in the header and every data row sizes its own. */}
      </Box>

      {isLoading
        ? skeletonRows
        : files!.map((file) => (
            <Box
              role="row"
              key={file.name}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                borderTop: `1px solid ${borderColor}`,
                color: cellColor,
              }}
            >
              <Box
                role="cell"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  padding: cellPadding,
                  whiteSpace: "normal",
                  overflowWrap: "break-word",
                }}
              >
                {renderFileName(file.name)}
              </Box>
              <Box
                role="cell"
                sx={{
                  width: 90,
                  flexShrink: 0,
                  padding: cellPadding,
                  whiteSpace: "nowrap",
                }}
              >
                {byteToHumanSizeString(parseInt(file.size))}
              </Box>
              <Box
                role="cell"
                sx={{
                  flexShrink: 0,
                  padding: cellPadding,
                  whiteSpace: "nowrap",
                }}
              >
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
              </Box>
            </Box>
          ))}
    </Box>
  );
};

// Three cells — matching the real row's name/size/actions cells.
const skeletonRows = [...Array(5)].map((c, i) => (
  <Box role="row" key={i} sx={{ display: "flex" }}>
    <Box role="cell" sx={{ flex: 1, minWidth: 0, padding: "10px" }}>
      <Skeleton height={14} />
    </Box>
    <Box role="cell" sx={{ width: 90, flexShrink: 0, padding: "10px" }}>
      <Skeleton height={14} width={70} />
    </Box>
    <Box role="cell" sx={{ flexShrink: 0, padding: "10px" }}>
      <Skeleton height={25} width={25} />
    </Box>
  </Box>
));

export default FileList;
