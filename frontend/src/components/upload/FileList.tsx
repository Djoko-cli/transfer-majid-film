import {
  ActionIcon,
  Table,
  Group,
  Stack,
  Progress,
  Text,
  Button,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import { TbTrash, TbEdit, TbRefresh, TbX } from "react-icons/tb";
import { GrUndo } from "react-icons/gr";
import { FileListItem } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import UploadProgressIndicator from "./UploadProgressIndicator";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import { HoverTip } from "../core/HoverTip";
import showTextEditorModal from "./modals/showTextEditorModal";
import shareService from "../../services/share.service";

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

// Geometry of the actions cell, mirroring the same fixed-width approach the
// share-page FileList.tsx already uses. Unlike that version, this one's
// action set is bounded rather than data-dependent: editable+removable can
// co-occur (2), and failed+removable can co-occur (2, since a failed file
// stays removable) — 2 is the real ceiling, uploading/restorable/plain
// rows never exceed 1. A `table-layout: auto` table with no name-column
// cap lets a long filename (routine for exported masters) push this whole
// column, and the only delete affordance in it, past the card's own
// clipping boundary — invisible and unreachable, not just scrolled off.
const ACTION_ICON_SIZE = 25;
const ACTION_ICON_GAP = 8; // Group spacing="xs"
const CELL_PADDING = 10;
const MAX_ACTION_ICONS = 2;
const ACTIONS_COLUMN_WIDTH =
  MAX_ACTION_ICONS * ACTION_ICON_SIZE +
  (MAX_ACTION_ICONS - 1) * ACTION_ICON_GAP +
  2 * CELL_PADDING;
const SIZE_COLUMN_WIDTH = 80;

const getFileNameOrPath = (file: FileListItem) => {
  const pathName =
    "webkitRelativePath" in file && file.webkitRelativePath
      ? file.webkitRelativePath
      : file.name;
  return pathName.replace(/\\/g, "/").replace(/^\//, "");
};

const FileListRow = ({
  file,
  onRemove,
  onRestore,
  onEdit,
  onRetry,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
  onRetry?: () => void;
}) => {
  {
    const uploadable = "uploadingProgress" in file;
    const uploading = uploadable && file.uploadingProgress !== 0;
    const failed = uploadable && file.uploadingProgress === -1;
    // Still removable once a file has given up retrying on its own — a
    // visitor who'd rather drop that one file than fight a flaky upload
    // shouldn't be stuck with no way off it.
    const removable = uploadable
      ? file.uploadingProgress === 0 || failed
      : onRemove && !file.deleted;
    const restorable = onRestore && !uploadable && !!file.deleted;
    const deleted = !uploadable && !!file.deleted;

    const fileNameOrPath = getFileNameOrPath(file);
    const isTextFile = shareService.isShareTextFile(fileNameOrPath);
    const editable = isTextFile && uploadable && file.uploadingProgress === 0;

    const t = useTranslate();

    return (
      <tr
        style={{
          color: deleted ? "rgba(120, 120, 120, 0.5)" : "inherit",
          textDecoration: deleted ? "line-through" : "none",
        }}
      >
        <td
          style={{
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          <HoverTip label={fileNameOrPath}>
            <span>{renderFileName(fileNameOrPath)}</span>
          </HoverTip>
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {byteToHumanSizeString(+file.size)}
        </td>
        <td>
          <Group position="right" spacing="xs" noWrap>
            {editable && (
              <HoverTip label={t("common.button.edit")}>
                <ActionIcon
                  color="blue"
                  variant="light"
                  size={25}
                  aria-label={t("common.button.edit")}
                  onClick={onEdit}
                >
                  <TbEdit />
                </ActionIcon>
              </HoverTip>
            )}
            {removable && (
              <HoverTip label={t("common.button.delete")}>
                <ActionIcon
                  color="red"
                  variant="light"
                  size={25}
                  aria-label={t("common.button.delete")}
                  onClick={onRemove}
                >
                  <TbTrash />
                </ActionIcon>
              </HoverTip>
            )}
            {uploading && (
              <UploadProgressIndicator progress={file.uploadingProgress} />
            )}
            {failed && onRetry && (
              <HoverTip label={t("common.button.retry")}>
                <ActionIcon
                  color="orange"
                  variant="light"
                  size={25}
                  aria-label={t("common.button.retry")}
                  onClick={onRetry}
                >
                  <TbRefresh />
                </ActionIcon>
              </HoverTip>
            )}
            {restorable && (
              <HoverTip label={t("common.button.undo")}>
                <ActionIcon
                  variant="light"
                  size={25}
                  aria-label={t("common.button.undo")}
                  onClick={onRestore}
                >
                  <GrUndo />
                </ActionIcon>
              </HoverTip>
            )}
          </Group>
        </td>
      </tr>
    );
  }
};

const FileList = <T extends FileListItem = FileListItem>({
  files,
  setFiles,
  isUploading,
  onCancel,
  onRetry,
}: {
  files: T[];
  setFiles: (files: T[]) => void;
  isUploading?: boolean;
  onCancel?: () => void;
  onRetry?: (index: number) => void;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const remove = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      files.splice(index, 1);
    } else {
      files[index] = { ...file, deleted: true };
    }

    setFiles([...files]);
  };

  const restore = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      return;
    } else {
      files[index] = { ...file, deleted: false };
    }

    setFiles([...files]);
  };

  const edit = async (index: number) => {
    const originalFile = files[index] as unknown as File;
    const text = await originalFile.text();

    showTextEditorModal(index, files, setFiles, text, modals);
  };

  const rows = files.map((file, i) => (
    <FileListRow
      key={i}
      file={file}
      onRemove={() => remove(i)}
      onRestore={() => restore(i)}
      onEdit={() => edit(i)}
      onRetry={onRetry ? () => onRetry(i) : undefined}
    />
  ));

  // Per-file rings/percentages tell you how one file is doing, but not the
  // transfer as a whole — the thing a visitor watching a 15GB upload
  // actually wants to know. Uploaded-so-far only counts files that are
  // genuinely in flight or done; a -1 (failed, waiting on manual retry)
  // contributes nothing until it actually resumes.
  const fileBytes = (file: T) =>
    "uploadingProgress" in file ? file.size : parseInt(file.size);
  const totalBytes = files.reduce((acc, file) => acc + fileBytes(file), 0);
  const uploadedBytes = files.reduce((acc, file) => {
    if (!("uploadingProgress" in file)) return acc + fileBytes(file);
    const progress = file.uploadingProgress;
    return (
      acc +
      (progress > 0 ? fileBytes(file) * (Math.min(progress, 100) / 100) : 0)
    );
  }, 0);

  return (
    <Stack spacing="xs">
      {isUploading && (
        <Stack spacing={4}>
          <Group position="apart" noWrap>
            <Text size="xs" color="dimmed">
              {t("upload.filelist.aggregate-progress", {
                uploaded: byteToHumanSizeString(uploadedBytes),
                total: byteToHumanSizeString(totalBytes),
              })}
            </Text>
            {onCancel && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                compact
                leftIcon={<TbX size={14} />}
                onClick={onCancel}
              >
                <FormattedMessage id="common.button.cancel" />
              </Button>
            )}
          </Group>
          <Progress
            value={totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0}
            size="sm"
            animate
          />
        </Stack>
      )}
      <Table style={{ tableLayout: "fixed", width: "100%" }}>
        <thead>
          <tr>
            <th>
              <FormattedMessage id="upload.filelist.name" />
            </th>
            <th style={{ width: SIZE_COLUMN_WIDTH }}>
              <FormattedMessage id="upload.filelist.size" />
            </th>
            <th style={{ width: ACTIONS_COLUMN_WIDTH }}></th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </Table>
    </Stack>
  );
};

export default FileList;
