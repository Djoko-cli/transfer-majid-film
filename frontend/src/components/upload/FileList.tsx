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
import {
  AnimationEvent as ReactAnimationEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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
// sized height) so a row arriving or leaving reads like the rest of the
// card's reveals, not like a different animation vocabulary. Both
// directions share it: a row closes exactly the way it opened.
const ROW_ANIM_MS = 200;
// Names of the global @keyframes (liquidGlassKeyframes.tsx). Also what the
// wrapper filters its animationend events and its getAnimations() check on.
const ROW_ENTER_KEYFRAMES = "fileRowIn";
const ROW_EXIT_KEYFRAMES = "fileRowOut";

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
    // The enter/exit reveal, opt-in per FileList (see animateRows), on a
    // presentational wrapper around each row (ARIA allows a
    // role=presentation node between table and row). Pure CSS @keyframes
    // animations, not transitions: an animation plays its `from` state on
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
    // from the middle outward instead.)
    //
    // Removal is the same track run backwards (fileRowOut, 1fr to 0fr) on
    // the same wrapper, switched on by data-exiting while FileList keeps
    // the file in the list; the animation's own end event is what finally
    // removes it (FileListRow -> FileList.finishExit) - no timer to keep
    // equal to the CSS duration. `forwards` holds the closed 0fr state
    // until React unmounts the row: animationend fires before this frame
    // paints, but React commits the removal in a later task, so without it
    // the row would snap back to full height for a frame. pointer-events:
    // none because a row on its way out has no actions left to offer.
    //
    // Not a transition to 0fr, though that would let a row removed while
    // still entering turn back from where it was: measured in Chromium, a
    // transition does not start on a property a CSS animation was driving
    // at the moment of the change - the track jumped to 0 at once, no end
    // event ever came, and the row sat in the list at 0px for good. With a
    // second animation the same case restarts from 1fr and closes from
    // there (a sub-200ms double action, accepted) and always ends.
    //
    // `& > *`: two declarations, both load-bearing. minHeight: 0 - a grid
    // item's default min-height is `auto` = its own content height, and a
    // track can never be sized below its item's minimum, so a 0fr track
    // holding a 39px row still resolves to 39px and the animation runs from
    // 39px to 39px: declared, running, invisible (measured, before this
    // line existed). alignSelf: start - the wrapper's own height follows the
    // fr value linearly, but the track inside it need not: Chromium re-runs
    // track sizing once the container's height is known, and a lone Xfr
    // track in a definite space takes only X of it (spec behaviour for flex
    // sums below 1), so the track - and a row stretched to it - measured
    // X² of the row height while the wrapper measured X: half-way through,
    // the box was 80% open but only 64% of the text showed, an empty band
    // trailing under it. A row that keeps its natural height and is merely
    // clipped by the wrapper shows exactly as much of itself as the box is
    // tall, on any engine, whatever the track does.
    animated: {
      display: "grid",
      gridTemplateRows: "1fr",
      overflow: "hidden",
      animation: `${ROW_ENTER_KEYFRAMES} ${ROW_ANIM_MS}ms ease`,
      "& > *": {
        minHeight: 0,
        alignSelf: "start",
      },
      "&[data-exiting]": {
        animation: `${ROW_EXIT_KEYFRAMES} ${ROW_ANIM_MS}ms ease forwards`,
        pointerEvents: "none",
      },
      // Both directions dropped. An exit that never animates would never
      // end either - FileListRow checks for the animation it is waiting on
      // and removes the row at once when there is none (its useEffect).
      "@media (prefers-reduced-motion: reduce)": {
        animation: "none",
        "&[data-exiting]": {
          animation: "none",
        },
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
  animate = false,
  exiting = false,
  onExited,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
  onRetry?: () => void;
  animate?: boolean;
  exiting?: boolean;
  onExited?: () => void;
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

    const wrapperRef = useRef<HTMLDivElement>(null);
    // Latest callback without making it an effect dependency: the effect
    // below must run once per exit, not once per parent render.
    const onExitedRef = useRef(onExited);
    onExitedRef.current = onExited;

    // Once data-exiting is committed, make sure the exit animation this row
    // now waits on actually exists - reduced motion sets it to none, an
    // engine could drop it - and finish at once when it does not. A check
    // of the real state, not a fallback timer: nothing can leave a row in
    // the list at 0px waiting for an event that will never come.
    useEffect(() => {
      if (!exiting) return;
      const running = wrapperRef.current
        ?.getAnimations?.()
        .some(
          (a) =>
            (a as { animationName?: string }).animationName ===
            ROW_EXIT_KEYFRAMES,
        );
      if (!running) onExitedRef.current?.();
    }, [exiting]);

    return (
      <Box
        ref={wrapperRef}
        role="presentation"
        className={cx(animate && classes.animated)}
        data-exiting={exiting || undefined}
        onAnimationEnd={(e: ReactAnimationEvent<HTMLDivElement>) => {
          // Only this wrapper's own exit: the enter animation ends on the
          // same element, and anything inside could bubble one up too.
          if (e.target !== e.currentTarget) return;
          if (e.animationName !== ROW_EXIT_KEYFRAMES) return;
          onExited?.();
        }}
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
  animateRows = false,
}: {
  files: T[];
  setFiles: (files: T[]) => void;
  isUploading?: boolean;
  onCancel?: () => void;
  onRetry?: (index: number) => void;
  // Animate a row's height in when it is added and out when it is removed
  // (see useStyles.animated). Opt-in rather than default: this list also
  // renders inside EditableUpload's AnimatedHeight, and a row animating
  // its own height inside a ResizeObserver-driven box is precisely the
  // nested-animation conflict TransferCard just got rid of. Callers whose
  // surrounding chain is height: auto all the way up (TransferCard, the
  // reverse-share card) turn it on; nothing else changes behavior.
  animateRows?: boolean;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const { classes, cx } = useStyles();

  // Files whose row is currently closing. They stay in `files` (and so in
  // the DOM, where the row can animate) until the exit animation's own end
  // event calls finishExit - the CSS decides when the row is gone, not a
  // timer that would have to be kept equal to it. Held by identity, not by
  // key: a stale entry (a file the parent replaced or cleared mid-exit) can
  // then never be mistaken for a later file that happens to share its name.
  const [exiting, setExiting] = useState<T[]>([]);
  // Always the list as last rendered. finishExit reads this rather than the
  // closure's `files` so that two rows finishing in the same React batch
  // remove two files, instead of the second call resurrecting the first.
  const latestFiles = useRef(files);
  latestFiles.current = files;

  const removeNow = (file: T) => {
    const next = latestFiles.current.filter((f) => f !== file);
    latestFiles.current = next;
    setFiles(next);
  };

  const finishExit = (file: T) => {
    removeNow(file);
    setExiting((prev) =>
      prev.filter((f) => f !== file && latestFiles.current.includes(f)),
    );
  };

  const remove = (index: number) => {
    const file = files[index];

    if (!("uploadingProgress" in file)) {
      // Editing an existing share: deletion is a soft flag the row keeps
      // showing (struck through, restorable), so there is no row to
      // animate out.
      files[index] = { ...file, deleted: true };
      setFiles([...files]);
      return;
    }

    if (exiting.includes(file)) return;

    // The last row standing goes at once, not through its own exit: with
    // no file left the parent's Collapse closes the whole disclosure,
    // header row included, and that single motion should own the removal
    // rather than follow a 200ms row-only prelude.
    const survivors = files.filter((f) => !exiting.includes(f)).length;
    if (!animateRows || survivors <= 1) {
      removeNow(file);
      return;
    }

    setExiting((prev) => [...prev, file]);
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
      animate={animateRows}
      exiting={exiting.includes(file)}
      onExited={() => finishExit(file)}
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
