import {
  Button,
  Center,
  Collapse,
  createStyles,
  Group,
  Text,
  Menu,
  useMantineColorScheme,
} from "@mantine/core";
import { Dropzone as MantineDropzone } from "@mantine/dropzone";
import React, { ForwardedRef, useEffect, useRef, useState } from "react";
import { TbCloudUpload, TbUpload, TbFolder } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import { fromEvent } from "file-selector";
import useTranslate from "../../hooks/useTranslate.hook";
import { FileUpload } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";

const useStyles = createStyles(
  (
    theme,
    {
      compact,
      tightenWhenEmpty,
    }: { compact: boolean; tightenWhenEmpty: boolean },
  ) => {
    const dark = theme.colorScheme === "dark";
    const accent = theme.colors[theme.primaryColor][dark ? 4 : 6];

    return {
      // Reserves room for the floating "add a folder" button below
      // (control, further down), which hangs outside the dropzone's own box
      // via `bottom: -20`. 30 — the original, unconditional value — unless
      // both compact is false (nothing has narrowed this to the slim bar
      // yet) *and* the caller opted into tightenWhenEmpty: with
      // files.length === 0 in TransferCard specifically, this dropzone
      // usually *is* the entire visible card, so any slack here stacks
      // directly on top of the card's own bottom padding — the top of the
      // dropzone has no equivalent floating element eating into its own
      // margin, and the mismatch reads as an off-center card. Opt-in rather
      // than unconditional: the only other caller (UploadPage's
      // reverse-share flow) puts a file table directly below with no
      // padded container absorbing the difference, where the original 30
      // is still the right amount of breathing room.
      wrapper: {
        position: "relative",
        marginBottom: !compact && tightenWhenEmpty ? 20 : 30,
      },

      dropzone: {
        borderWidth: 1,
        paddingBottom: 50,
      },

      // Once files are already selected, the full "how to drop files"
      // instructions are redundant with the file list right below it —
      // this shrinks the dropzone to a slim "add more" bar instead of
      // keeping ~120px of onboarding copy a visitor no longer needs.
      dropzoneCompact: {
        borderWidth: 1,
        paddingTop: 14,
        paddingBottom: 34,
      },

      // Reuses liquidGlassKeyframes' global @keyframes (see TransferCard,
      // where this same pulse used to live on the submit button — moved here
      // since the dropzone is the element a waiting user actually needs to
      // act on). Glow lives on a pseudo-element with a fixed (unanimated)
      // box-shadow, animating only its opacity — box-shadow itself isn't a
      // compositable property, so animating its blur/spread radius directly
      // forces a repaint on every frame and reads as stuttery rather than a
      // smooth breath.
      waitingPulse: {
        position: "relative",

        "&::after": {
          content: "''",
          position: "absolute",
          // Flush with the dropzone's own edge, not offset outward from it —
          // a box-shadow already radiates outward from wherever this box's
          // own boundary sits, so an inset here just pushes that boundary
          // out and leaves a visible gap of nothing in between.
          inset: 0,
          borderRadius: "inherit",
          boxShadow: `0 0 18px 4px ${accent}66`,
          opacity: 0,
          animation: "waitingPulse 2.8s ease-in-out infinite",
          pointerEvents: "none",
        },

        "@media (prefers-reduced-motion: reduce)": {
          "&::after": { animation: "none" },
        },
      },

      icon: {
        color: dark ? theme.colors.dark[3] : theme.colors.gray[4],
      },

      control: {
        position: "absolute",
        bottom: -20,
      },
    };
  },
);

const traverseDirectory = async (entry: any, path = ""): Promise<File[]> => {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file: File) => {
        const relativePath = path ? `${path}/${file.name}` : file.name;
        Object.defineProperty(file, "webkitRelativePath", {
          value: relativePath,
          writable: true,
          configurable: true,
        });
        resolve([file]);
      });
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const readEntries = (): Promise<any[]> => {
      return new Promise((resolve) => {
        dirReader.readEntries(
          (entries: any[]) => resolve(entries),
          () => resolve([]),
        );
      });
    };

    let entries: any[] = [];
    let readBatch = await readEntries();
    while (readBatch.length > 0) {
      entries = entries.concat(readBatch);
      readBatch = await readEntries();
    }

    const promises = entries.map((e) =>
      traverseDirectory(e, path ? `${path}/${entry.name}` : entry.name),
    );
    const results = await Promise.all(promises);
    return results.flat();
  }
  return [];
};

// Exported so a page-wide drop target (anywhere outside this component's
// own box) can reuse the exact same folder-traversal/dataTransfer handling
// instead of only accepting flat file lists.
export const getFilesFromEvent = async (event: any): Promise<any[]> => {
  if (Array.isArray(event)) {
    const filePromises = event.map(async (item: any) => {
      if (item && typeof item.getFile === "function") {
        return await item.getFile();
      }
      return item;
    });
    return await Promise.all(filePromises);
  }

  if (event?.dataTransfer) {
    const items = event.dataTransfer.items;
    if (!items) return [];

    const filePromises: Promise<File[]>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          filePromises.push(traverseDirectory(entry));
        } else {
          const file = item.getAsFile();
          if (file) {
            filePromises.push(Promise.resolve([file]));
          }
        }
      }
    }
    const fileArrays = await Promise.all(filePromises);
    return fileArrays.flat();
  }

  if (event?.target?.files) {
    return Array.from(event.target.files) as File[];
  }

  return await fromEvent(event);
};

const Dropzone = ({
  title,
  isUploading,
  maxShareSize,
  currentFilesSize = 0,
  onFilesChanged,
  glass = false,
  waiting = false,
  compact = false,
  tightenWhenEmpty = false,
}: {
  title?: string;
  isUploading: boolean;
  maxShareSize: number;
  currentFilesSize?: number;
  onFilesChanged: (files: FileUpload[]) => void;
  glass?: boolean;
  // Pulses gently to draw the eye while there's nothing to act on yet
  // (see TransferCard, the only caller that currently sets this) — off by
  // default so append-mode dropzones (EditableUpload, UploadPage) that
  // always have at least one file already keep their plain look.
  waiting?: boolean;
  // Shrinks the instructional copy down to a slim bar — set once files
  // already exist, when the full onboarding text is no longer needed.
  compact?: boolean;
  // Off by default (unconditional 30px reserve below the box, same as
  // always) — set only by TransferCard, the one caller where this dropzone
  // can be the entire visible card with nothing padded around it to absorb
  // the extra. See wrapper's own comment in useStyles for the full reasoning.
  tightenWhenEmpty?: boolean;
}) => {
  const t = useTranslate();
  const { classes, cx } = useStyles({ compact, tightenWhenEmpty });
  const openRef = useRef<() => void>();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { colorScheme } = useMantineColorScheme();
  const dark = colorScheme === "dark";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isFolderUploadSupported =
    isMounted &&
    typeof HTMLInputElement !== "undefined" &&
    "webkitdirectory" in HTMLInputElement.prototype;

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = event.target.files;
    if (!filesList) return;
    const filesArray = Array.from(filesList) as FileUpload[];

    const files = filesArray.map((newFile) => {
      newFile.uploadingProgress = 0;
      return newFile;
    });

    const fileSizeSum = files.reduce((n, { size }) => n + size, 0);

    if (fileSizeSum + currentFilesSize > maxShareSize) {
      toast.error(
        t("upload.dropzone.notify.file-too-big", {
          maxSize: byteToHumanSizeString(maxShareSize),
        }),
      );
    } else {
      onFilesChanged(files);
    }

    event.target.value = "";
  };

  return (
    <div className={classes.wrapper}>
      <input
        type="file"
        ref={folderInputRef}
        style={{ display: "none" }}
        {...({
          webkitdirectory: "",
          directory: "",
        } as any)}
        multiple
        onChange={handleFolderSelect}
      />
      <MantineDropzone
        onReject={(e) => {
          toast.error(e[0].errors[0].message);
        }}
        disabled={isUploading}
        openRef={openRef as ForwardedRef<() => void>}
        getFilesFromEvent={getFilesFromEvent}
        onDrop={(files: FileUpload[]) => {
          const fileSizeSum = files.reduce((n, { size }) => n + size, 0);

          if (fileSizeSum + currentFilesSize > maxShareSize) {
            toast.error(
              t("upload.dropzone.notify.file-too-big", {
                maxSize: byteToHumanSizeString(maxShareSize),
              }),
            );
          } else {
            files = files.map((newFile) => {
              newFile.uploadingProgress = 0;
              return newFile;
            });
            onFilesChanged(files);
          }
        }}
        className={cx(
          compact ? classes.dropzoneCompact : classes.dropzone,
          !compact && waiting && classes.waitingPulse,
        )}
        radius="md"
        styles={
          glass
            ? (theme) => {
                const dark = theme.colorScheme === "dark";
                return {
                  root: {
                    backgroundColor: dark
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(255, 255, 255, 0.28)",
                    borderColor: dark
                      ? "rgba(255, 255, 255, 0.22)"
                      : "rgba(255, 255, 255, 0.6)",
                    // Mantine's own Dropzone hover style is a solid dark
                    // fill that doesn't know about this glass treatment —
                    // without this it flashes flat grey on hover instead
                    // of staying translucent.
                    "&:hover": {
                      backgroundColor: dark
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(255, 255, 255, 0.38)",
                    },
                  },
                };
              }
            : undefined
        }
      >
        <div style={{ pointerEvents: "none" }}>
          <Group position="center">
            {
              // A plain `size` prop swap on the icon (like the Text's own
              // `size`/`mt` below) can't be animated — it sets width/height
              // as SVG attributes, outside CSS's reach. An explicit style
              // with its own transition covers both this and the Text
              // props below, since Mantine's size-token classes still
              // resolve to real computed font-size/margin values that a
              // transition on the element (or an ancestor, since it's
              // inherited) picks up regardless of *how* they changed.
            }
            <TbCloudUpload
              size={50}
              style={{
                width: compact ? 24 : 50,
                height: compact ? 24 : 50,
                transition: "width 200ms ease, height 200ms ease",
              }}
            />
          </Group>
          <Text
            align="center"
            weight={700}
            size={compact ? "sm" : "xl"}
            mt={compact ? "xs" : "xl"}
            sx={{
              transition: "font-size 200ms ease, margin-top 200ms ease",
            }}
          >
            {compact ? (
              <FormattedMessage id="upload.dropzone.title.compact" />
            ) : (
              title || <FormattedMessage id="upload.dropzone.title" />
            )}
          </Text>
          {
            // Collapse rather than a bare conditional — this text
            // disappearing/appearing is what makes the dropzone (and with
            // it, the whole card above/below it) visibly jump the instant
            // the first file lands, since nothing was animating the
            // height change before.
          }
          <Collapse in={!compact}>
            <Text
              align="center"
              size="sm"
              mt="xs"
              color="dimmed"
              sx={{ whiteSpace: "pre-line" }}
            >
              <FormattedMessage
                id="upload.dropzone.description"
                values={{ maxSize: byteToHumanSizeString(maxShareSize) }}
              />
            </Text>
          </Collapse>
        </div>
      </MantineDropzone>
      <Center>
        {isFolderUploadSupported && (
          <Button
            className={classes.control}
            sx={{ bottom: compact ? -14 : -20 }}
            variant={dark ? "filled" : "light"}
            size="sm"
            radius="xl"
            disabled={isUploading}
            onClick={() => folderInputRef.current?.click()}
          >
            <TbFolder style={{ marginRight: 6 }} />
            <FormattedMessage
              id={
                currentFilesSize > 0
                  ? "upload.button.folder.append"
                  : "upload.button.folder"
              }
            />
          </Button>
        )}
      </Center>
    </div>
  );
};
export default Dropzone;
