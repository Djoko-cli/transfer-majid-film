import {
  ActionIcon,
  Box,
  Button,
  createStyles,
  Group,
  Progress,
  Stack,
  Text,
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

// Matches Mantine Collapse's own default feel (`ease`, ~200ms for a row-
// sized height) so a row arriving reads like the rest of the card's
// reveals, not like a different animation vocabulary.
const ROW_ENTER_MS = 200;

// A CSS grid rather than Mantine's <Table>, though it reproduces that
// table's rendered geometry exactly (measured live: cells 7px/10px padding,
// 14px text, 700-weight 70%-alpha header with a 1px hairline under it,
// no separators between body rows). The reason is animation: a table row
// cannot animate its own height - `<tr>` ignores height transitions, a
// `<div>` can't legally wrap it inside `<tbody>`, and an animated height on
// `<tbody>` is mishandled by table layout, Safari especially. A grid row
// is a plain block that can. Each row owns its own height, so when one
// animates in, the card above (height: auto all the way up - see
// TransferCard) follows in the same layout pass, exactly like the card's
// Collapse-driven reveals; nothing measures or chases anything. role=
// table/row/cell/columnheader keep the semantics a real table gave.
//
// Column widths are the same constants the <Table> used: the name column
// takes the remainder (this is what `tableLayout: fixed` + explicit
// <th> widths achieved), and it needs minWidth: 0 - a grid item's default
// min-width is its content, which would silently disable the ellipsis.
const useStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  return {
    grid: {
      width: "100%",
      fontSize: theme.fontSizes.sm,
      // The <Table> this replaces rendered body text pure white in dark
      // mode (measured), not the card's inherited dark[0] grey - set
      // explicitly so file names keep the same weight against the glass.
      color: dark ? theme.white : theme.black,
    },
    row: {
      display: "grid",
      gridTemplateColumns: `minmax(0, 1fr) ${SIZE_COLUMN_WIDTH}px ${ACTIONS_COLUMN_WIDTH}px`,
      alignItems: "center",
    },
    headerRow: {
      borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)"}`,
    },
    cell: {
      padding: `7px ${CELL_PADDING}px`,
      lineHeight: 1.55,
    },
    headerCell: {
      fontWeight: 700,
      color: dark ? "rgba(255, 255, 255, 0.7)" : theme.colors.gray[7],
    },
    nameCell: {
      minWidth: 0,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    sizeCell: {
      whiteSpace: "nowrap",
    },
    // The enter reveal, opt-in per FileList (see animateRowEnter), on a
    // presentational wrapper around each row (ARIA allows a
    // role=presentation node between table and row). A pure CSS @keyframes
    // animation, not a transition: an animation plays its `from` state on
    // an element's very first paint, which is exactly the moment a new
    // row exists - no mount-then-flip state, no timer. It animates the
    // wrapper's single grid track from 0fr to 1fr (fileRowIn, global in
    // liquidGlassKeyframes.tsx like every other @keyframes in this
    // codebase), i.e. the row's real layout height from 0 to whatever its
    // content needs - so everything above it grows with it, in lockstep,
    // the same way the card's Collapses work. The row itself is the sole
    // item in that track and stretches with it; its own content overflows
    // downward and is clipped, so the reveal is anchored at the top -
    // Collapse's look. (Putting the track on `.row` directly would put
    // its `alignItems: center` inside a 0px track and reveal the content
    // from the middle outward instead.) Removal is not animated: a
    // removed row unmounts and the list reflows at once - a plain
    // relayout, not a desync.
    //
    // `& > *` minHeight: 0 is load-bearing, not tidiness. A grid item's
    // default min-height is `auto` = its own content height, and a track
    // can never be sized below its item's minimum - so a 0fr track holding
    // a 39px row still resolves to 39px, and the animation runs from 39px
    // to 39px: declared, running, invisible. Measured exactly that before
    // this line existed (resolved grid-template-rows read 39px from the
    // first frame). Letting the item shrink to 0 is what lets the track
    // actually start at 0.
    enterAnimated: {
      display: "grid",
      gridTemplateRows: "1fr",
      overflow: "hidden",
      animation: `fileRowIn ${ROW_ENTER_MS}ms ease`,
      "& > *": {
        minHeight: 0,
      },
      "@media (prefers-reduced-motion: reduce)": {
        animation: "none",
      },
    },
  };
});

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
  animateEnter = false,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
  onRetry?: () => void;
  animateEnter?: boolean;
}) => {
  {
    const { classes, cx } = useStyles();
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
      <Box
        role="presentation"
        className={cx(animateEnter && classes.enterAnimated)}
      >
        <Box
          role="row"
          className={classes.row}
          style={{
            color: deleted ? "rgba(120, 120, 120, 0.5)" : "inherit",
            textDecoration: deleted ? "line-through" : "none",
          }}
        >
          <Box role="cell" className={cx(classes.cell, classes.nameCell)}>
            <HoverTip label={fileNameOrPath}>
              <span>{renderFileName(fileNameOrPath)}</span>
            </HoverTip>
          </Box>
          <Box role="cell" className={cx(classes.cell, classes.sizeCell)}>
            {byteToHumanSizeString(+file.size)}
          </Box>
          <Box role="cell" className={classes.cell}>
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
          </Box>
        </Box>
      </Box>
    );
  }
};

const FileList = <T extends FileListItem = FileListItem>({
  files,
  setFiles,
  isUploading,
  onCancel,
  onRetry,
  animateRowEnter = false,
}: {
  files: T[];
  setFiles: (files: T[]) => void;
  isUploading?: boolean;
  onCancel?: () => void;
  onRetry?: (index: number) => void;
  // Animate a newly added row's height in (see useStyles.enterAnimated).
  // Opt-in rather than default: this list also renders inside
  // EditableUpload's AnimatedHeight, and a row animating its own height
  // inside a ResizeObserver-driven box is precisely the nested-animation
  // conflict TransferCard just got rid of. Callers whose surrounding
  // chain is height: auto all the way up (TransferCard, the reverse-share
  // card) turn it on; nothing else changes behavior.
  animateRowEnter?: boolean;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const { classes, cx } = useStyles();
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

  // Keyed on identity, not index. With index keys, removing a middle file
  // made React reuse every following row's element for the file that
  // shifted into its slot and unmount the *last* one - harmless for a
  // static table, wrong the moment rows animate (the entering/leaving
  // element must be the row that was actually added/removed). Uploaded
  // files (FileMetaData) carry an id; dropped ones are File objects with
  // no id, but their normalized path is already unique within a share -
  // filterDuplicateFiles rejects a second file with the same one - so it
  // is the same identity the rest of the upload flow relies on.
  const rowKey = (file: T) =>
    "id" in file ? file.id : getFileNameOrPath(file);

  const rows = files.map((file, i) => (
    <FileListRow
      key={rowKey(file)}
      file={file}
      onRemove={() => remove(i)}
      onRestore={() => restore(i)}
      onEdit={() => edit(i)}
      onRetry={onRetry ? () => onRetry(i) : undefined}
      animateEnter={animateRowEnter}
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
      <Box role="table" className={classes.grid}>
        <Box role="row" className={cx(classes.row, classes.headerRow)}>
          <Box
            role="columnheader"
            className={cx(classes.cell, classes.headerCell)}
          >
            <FormattedMessage id="upload.filelist.name" />
          </Box>
          <Box
            role="columnheader"
            className={cx(classes.cell, classes.headerCell)}
          >
            <FormattedMessage id="upload.filelist.size" />
          </Box>
          <Box
            role="columnheader"
            className={cx(classes.cell, classes.headerCell)}
          />
        </Box>
        {rows}
      </Box>
    </Stack>
  );
};

export default FileList;
