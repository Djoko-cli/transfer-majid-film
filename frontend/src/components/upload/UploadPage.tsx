import { Button, Group, Progress, Stack, Text } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { cleanNotifications } from "@mantine/notifications";
import { AxiosError } from "axios";
import pLimit from "p-limit";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import AuthGlassLayout from "../auth/AuthGlassLayout";
import AnimatedHeight from "../core/AnimatedHeight";
import Meta from "../Meta";
import Dropzone, { getFilesFromEvent } from "./Dropzone";
import FileList from "./FileList";
import PageDropOverlay from "./PageDropOverlay";
import SplitTransferLayout from "./SplitTransferLayout";
import TransferCard from "./TransferCard";
import showCompletedUploadModal from "./modals/showCompletedUploadModal";
import showCreateUploadModal from "./modals/showCreateUploadModal";
import showEmailVerificationModal from "./modals/showEmailVerificationModal";
import showNasImportModal from "./modals/showNasImportModal";
import useConfig from "../../hooks/config.hook";
import useConfirmLeave from "../../hooks/confirm-leave.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import nasImportService from "../../services/nasImport.service";
import shareService from "../../services/share.service";
import { FileUpload } from "../../types/File.type";
import { NasImportPreview } from "../../types/nasImport.type";
import { CreateShare, Mode, Share } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import {
  getNormalizedFileName,
  filterDuplicateFiles,
  getDefaultShareName,
} from "../../utils/file.util";
import { generateAvailableShareId } from "../../utils/share.util";

const promiseLimit = pLimit(3);

const Upload = ({
  maxShareSize,
  isReverseShare = false,
}: {
  maxShareSize?: number;
  isReverseShare: boolean;
}) => {
  const modals = useModals();
  const t = useTranslate();

  const { user } = useUser();
  const config = useConfig();
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setisUploading] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  // Separate from `files`/setFileProgress above — a NAS import has no real
  // per-file upload to track (nothing is uploaded, see importFromNas), just
  // an overall count from the server-side batched commit loop.
  const [nasImportProgress, setNasImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const requiresEmailVerification =
    !user &&
    !isReverseShare &&
    config.get("share.requireEmailVerificationForAnonymousShares");

  useConfirmLeave({
    message: t("upload.notify.confirm-leave"),
    enabled: isUploading,
  });

  const chunkSize = useRef(parseInt(config.get("share.chunkSize")));
  // Per-invocation state that the upload/retry/cancel closures below need to
  // share, without the cross-instance leakage of a module-level `let` (the
  // previous approach here) — a fresh pair every time this component mounts.
  const createdShareRef = useRef<Share | null>(null);
  const cancelledRef = useRef(false);
  // The request payload never round-trips back through the completion
  // response (ShareDTO deliberately doesn't echo senderEmail — see
  // ShareService.complete()'s reasoning), so the modal that reacts to that
  // response reads these instead: what was actually submitted, kept
  // entirely client-side.
  const submittedSenderEmailRef = useRef<string | null>(null);
  const submittedModeRef = useRef<Mode>("link");

  maxShareSize ??= user?.shareSizeLimit
    ? parseInt(user.shareSizeLimit)
    : parseInt(config.get("share.maxSize"));

  const currentFilesSize = useMemo(() => {
    return files.reduce((acc, file) => acc + file.size, 0);
  }, [files]);

  // 3 attempts total (1 initial + 2 retries) with a short fixed backoff —
  // long enough to ride out a transient blip, short enough that a genuinely
  // dead connection reaches an honest, actionable "failed" state in under
  // 10s instead of retrying silently forever behind an unclosable toast.
  const MAX_CHUNK_ATTEMPTS = 3;
  const CHUNK_RETRY_DELAY_MS = 2000;

  const setFileProgress = (fileIndex: number, progress: number) => {
    // Mutates in place rather than spreading — `FileUpload` extends the
    // browser's native `File`, whose real data (name, size, slice()...)
    // lives in internal slots, not enumerable own properties. `{...file}`
    // silently produces a plain object missing all of it.
    setFiles((files) =>
      files.map((file, i) => {
        if (i === fileIndex) file.uploadingProgress = progress;
        return file;
      }),
    );
  };

  const uploadOneFile = async (file: FileUpload, fileIndex: number) => {
    let fileId;

    setFileProgress(fileIndex, 1);

    let chunks = Math.ceil(file.size / chunkSize.current);

    // If the file is 0 bytes, we still need to upload 1 chunk
    if (chunks == 0) chunks++;

    let attempts = 0;

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      if (cancelledRef.current) return;

      const from = chunkIndex * chunkSize.current;
      const to = from + chunkSize.current;
      const blob = file.slice(from, to);
      try {
        await shareService
          .uploadFile(
            createdShareRef.current!.id,
            blob,
            {
              id: fileId,
              name: getNormalizedFileName(file),
            },
            chunkIndex,
            chunks,
            (progressEvent) => {
              if (progressEvent.total && file.size > 0) {
                const chunkProgress =
                  progressEvent.loaded / progressEvent.total;
                const uploadedBytesBeforeThisChunk =
                  chunkIndex * chunkSize.current;
                const uploadedBytesInThisChunk = blob.size * chunkProgress;
                const totalUploaded =
                  uploadedBytesBeforeThisChunk + uploadedBytesInThisChunk;
                const overallPercent = (totalUploaded / file.size) * 100;
                setFileProgress(fileIndex, Math.min(overallPercent, 99.9));
              }
            },
          )
          .then((response) => {
            fileId = response.id;
          });

        setFileProgress(fileIndex, ((chunkIndex + 1) / chunks) * 100);
        attempts = 0;
      } catch (e) {
        if (cancelledRef.current) return;
        if (
          e instanceof AxiosError &&
          e.response?.data.error == "unexpected_chunk_index"
        ) {
          // Not a failure — the server is telling us where it actually got
          // to, so resume from there rather than counting it as an attempt.
          chunkIndex = e.response!.data!.expectedChunkIndex - 1;
          continue;
        }

        attempts++;
        setFileProgress(fileIndex, -1);
        if (attempts >= MAX_CHUNK_ATTEMPTS) {
          // Give up on this file — it stays at -1 (an honest, terminal
          // "failed" state) until the visitor retries it manually via
          // FileList's retry action, rather than looping forever unseen.
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_RETRY_DELAY_MS),
        );
        chunkIndex = -1;
        continue;
      }
    }
  };

  const uploadFiles = async (share: CreateShare, files: FileUpload[]) => {
    cancelledRef.current = false;
    setisUploading(true);

    try {
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      createdShareRef.current = await shareService.create(
        { ...share, size: totalSize },
        isReverseShare,
      );
    } catch (e) {
      toast.axiosError(e);
      setisUploading(false);
      return;
    }

    if (cancelledRef.current) {
      await shareService.expire(createdShareRef.current!.id).catch(() => {});
      return;
    }

    Promise.all(
      files.map((file, fileIndex) =>
        // Limit the number of concurrent uploads to 3
        promiseLimit(() => uploadOneFile(file, fileIndex)),
      ),
    );
  };

  // Re-runs a single file's upload from scratch — safe to call once that
  // file has reached the terminal -1 state above, since uploadOneFile has
  // already returned and nothing else is still touching it.
  const retryFile = (fileIndex: number) => {
    const file = files[fileIndex] as FileUpload;
    promiseLimit(() => uploadOneFile(file, fileIndex));
  };

  const cancelUpload = async () => {
    cancelledRef.current = true;
    const shareId = createdShareRef.current?.id;
    setisUploading(false);
    setFiles([]);
    cleanNotifications();
    if (shareId) {
      await shareService.expire(shareId).catch(() => {});
    }
    toast.success(t("upload.notify.cancelled"));
  };

  // Gates the actual upload behind the anonymous email-OTP check when
  // required. share.senderEmail is already populated whenever the sender
  // typed their email into TransferCard (any mode, not just "email"), so
  // the OTP modal only needs to ask for the code, not the address again.
  const startUpload = (share: CreateShare, mode: Mode = "link") => {
    submittedSenderEmailRef.current = share.senderEmail || null;
    submittedModeRef.current = mode;

    if (!requiresEmailVerification || isEmailVerified) {
      uploadFiles(share, files);
      return;
    }

    showEmailVerificationModal(
      modals,
      (email) => {
        setIsEmailVerified(true);
        // The confirmed address can differ from share.senderEmail if the
        // sender used "change email" inside the OTP modal — keep both the
        // outgoing request and our own record of what was submitted in
        // sync with whatever was actually verified.
        submittedSenderEmailRef.current = email;
        uploadFiles({ ...share, senderEmail: email }, files);
      },
      share.senderEmail || undefined,
    );
  };

  // The reverse share's own creator already set name/description/security
  // at creation time (showCreateReverseShareModal.tsx) — ShareService
  // .create()'s own override applies those, ignoring whatever this sends
  // for them, so there's no modal left to show here: clicking "Partager"
  // submits directly. name still carries a files-based fallback, the same
  // default a direct share falls back to, for when the creator also left
  // the reverse share's own name blank.
  const submitReverseShare = async () => {
    startUpload({
      id: await generateAvailableShareId(config.get("share.shareIdLength")),
      name: getDefaultShareName(files, t),
      recipients: [],
      // Ignored — ShareService.create() always substitutes the reverse
      // share's own shareExpiration when a reverseShareToken is present.
      expiration: "never",
      security: {},
    });
  };

  // Mirrors uploadFiles above (create → wait → complete → show the same
  // completion modal), but there's no byte upload at all: the share is
  // created without `size` (ShareService.create() skips its disk-space/
  // quota pre-check entirely when it's omitted — correct here, since a
  // symlinked import consumes ~0 real local disk regardless of the NAS
  // content's actual size), and instead of uploadOneFile's chunk loop this
  // repeatedly calls the resumable nas-import commit endpoint until it
  // reports done, updating nasImportProgress from each batch's count.
  const importFromNas = async (
    share: CreateShare,
    paths: string[],
    preview: NasImportPreview,
  ) => {
    setisUploading(true);
    setNasImportProgress({ done: 0, total: preview.fileCount });

    try {
      createdShareRef.current = await shareService.create(
        share,
        isReverseShare,
      );
    } catch (e) {
      toast.axiosError(e);
      setisUploading(false);
      setNasImportProgress(null);
      return;
    }

    let cursor: number | undefined;
    let importedSoFar = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await nasImportService.commit(
          createdShareRef.current!.id,
          paths,
          cursor,
        );
        importedSoFar += result.importedThisBatch;
        setNasImportProgress({ done: importedSoFar, total: preview.fileCount });
        if (result.skippedCollisions.length > 0) {
          toast.error(
            t("upload.nasImport.notify.collisions", {
              count: result.skippedCollisions.length,
            }),
          );
        }
        if (result.done) break;
        cursor = result.cursor!;
      }
    } catch (e) {
      toast.axiosError(e);
      setisUploading(false);
      setNasImportProgress(null);
      return;
    }

    try {
      const completedShare = await shareService.completeShare(
        createdShareRef.current!.id,
      );
      setisUploading(false);
      setNasImportProgress(null);
      showCompletedUploadModal(
        modals,
        completedShare,
        config.get("general.appUrl"),
        config.get("general.appUrl", true),
        undefined,
        !isReverseShare,
        "link",
        config.get("smtp.enabled") &&
          config.get("email.enableShareDownloadNotifications"),
      );
    } catch {
      toast.error(t("upload.notify.generic-error"));
      setisUploading(false);
      setNasImportProgress(null);
    }
  };

  const openNasImportModal = () => {
    showNasImportModal(modals, (paths, preview) => {
      const syntheticFiles = paths.map((p) => ({
        name: p.split("/").pop() || p,
        size: preview.totalSize,
      }));
      showCreateUploadModal(
        modals,
        {
          isUserSignedIn: user ? true : false,
          allowUnauthenticatedShares: config.get(
            "share.allowUnauthenticatedShares",
          ),
          enableEmailRecepients: config.get("email.enableShareEmailRecipients"),
          enableUserRecipients: config.get("share.enableUserRecipients"),
          maxExpiration:
            user?.isAdmin || user?.canCreatePermanentShares
              ? { value: 0, unit: "days" }
              : config.get("share.maxExpiration"),
          defaultExpiration: config.get("share.defaultExpiration"),
          shareIdLength: config.get("share.shareIdLength"),
        },
        syntheticFiles,
        (share) => importFromNas(share, paths, preview),
      );
    });
  };

  const handleDropzoneFilesChanged = (newFiles: FileUpload[]) => {
    const filtered = filterDuplicateFiles(newFiles, files, (normalizedName) =>
      toast.error(
        t("upload.notify.duplicate-skipped", { name: normalizedName }),
      ),
    );
    if (filtered.length === 0) return;

    setFiles((oldArr) => [...oldArr, ...filtered]);
  };

  // Anywhere-on-the-page drag & drop: a visitor dragging from their file
  // manager has no reason to aim precisely for the Dropzone placeholder, so
  // the whole window is a valid drop target, with this overlay as the
  // feedback that the drop registered. dragenter/dragleave fire in
  // mismatched pairs as the pointer crosses child element boundaries within
  // the window (entering a child fires enter on it *and* bubbles, leaving
  // does the same) — a plain boolean flips back off between those, causing
  // visible flicker; a nesting counter that only reaches/leaves zero once
  // is the standard fix.
  const [isDraggingFileOverPage, setIsDraggingFileOverPage] = useState(false);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types || []).includes("Files");

    const handleDragEnter = (e: DragEvent) => {
      if (isUploading || !isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFileOverPage(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (isUploading || !isFileDrag(e)) return;
      // Required for the drop event to fire at all — browsers otherwise
      // treat an unhandled dragover as "not a valid drop target" and, for
      // a bare window listener, would navigate to/open the dropped file.
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFileOverPage(false);
    };

    const handleDrop = async (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFileOverPage(false);
      if (isUploading) return;

      const droppedFiles = (await getFilesFromEvent(e)) as FileUpload[];
      const fileSizeSum = droppedFiles.reduce((n, { size }) => n + size, 0);

      if (fileSizeSum + currentFilesSize > maxShareSize) {
        toast.error(
          t("upload.dropzone.notify.file-too-big", {
            maxSize: byteToHumanSizeString(maxShareSize),
          }),
        );
        return;
      }

      handleDropzoneFilesChanged(
        droppedFiles.map((file) => {
          file.uploadingProgress = 0;
          return file;
        }),
      );
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUploading, currentFilesSize, maxShareSize, files]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (modals.modals.length > 0) {
        return;
      }

      const clipboardData = e.clipboardData;

      if (!clipboardData) {
        return;
      }

      if (clipboardData?.getData("text/plain")) {
        const pastedText = clipboardData.getData("text/plain");
        if (!pastedText) {
          return;
        }

        // Create a sanitised file name from the pasted text
        const safeName = pastedText
          .substring(0, 50)
          .replace(/[^a-zA-Z0-9 ]/g, "")
          .trim();
        const fileName = `${safeName || "clipboard_paste"}.txt`;

        const file = new File([pastedText], fileName, {
          type: "text/plain",
        });
        const fileUpload = file as FileUpload;
        fileUpload.uploadingProgress = 0;

        const filtered = filterDuplicateFiles(
          [fileUpload],
          files,
          (normalizedName) =>
            toast.error(
              t("upload.notify.duplicate-skipped", { name: normalizedName }),
            ),
        );
        if (filtered.length === 0) return;

        setFiles((oldArr) => [...oldArr, ...filtered]);
      }
    };

    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [modals.modals.length]);

  useEffect(() => {
    // Check if there are any files that failed to upload
    const fileErrorCount = files.filter(
      (file) => file.uploadingProgress == -1,
    ).length;

    if (fileErrorCount > 0) {
      // A stable id makes this idempotent — Mantine updates the existing
      // notification in place instead of stacking a new one every time this
      // effect re-runs, so no separate "already shown" flag is needed. Each
      // failed file now has its own retry action in FileList, so this is
      // dismissable and just reports state rather than issuing an
      // instruction ("please retry") the toast itself has no way to fulfill.
      toast.error(t("upload.notify.count-failed", { count: fileErrorCount }), {
        id: "upload-error",
        withCloseButton: true,
        autoClose: false,
      });
    } else {
      cleanNotifications();
    }

    // Complete share
    if (
      files.length > 0 &&
      files.every((file) => file.uploadingProgress >= 100) &&
      fileErrorCount == 0
    ) {
      shareService
        .completeShare(createdShareRef.current!.id)
        .then((share) => {
          setisUploading(false);
          showCompletedUploadModal(
            modals,
            share,
            config.get("general.appUrl"),
            config.get("general.appUrl", true),
            !user && submittedSenderEmailRef.current
              ? submittedSenderEmailRef.current
              : undefined,
            !isReverseShare,
            submittedModeRef.current,
            config.get("smtp.enabled") &&
              config.get("email.enableShareDownloadNotifications"),
          );
          setFiles([]);
        })
        .catch(() => toast.error(t("upload.notify.generic-error")));
    }
  }, [files]);

  if (isReverseShare) {
    return (
      <>
        <Meta title={t("upload.title")} />
        <PageDropOverlay visible={isDraggingFileOverPage} />
        {
          // AuthGlassLayout, not SplitTransferLayout: this is a single
          // bounded task (pick files, hand them over) centered on the
          // brand backdrop, the same shape as signing in, not
          // SplitTransferLayout's asymmetric split (built specifically
          // for TransferCard's own two-column layout) or
          // GlassPageBackdrop's ambient scrim (for a page-length document
          // like account settings, which this isn't — the file list is
          // real content but stays within one card, scrolling internally
          // past a height cap exactly like TransferCard's own).
        }
        <AuthGlassLayout>
          <Stack align="stretch" spacing={0}>
            <Dropzone
              title={
                files.length > 0 ? t("share.edit.append-upload") : undefined
              }
              maxShareSize={maxShareSize}
              currentFilesSize={currentFilesSize}
              onFilesChanged={handleDropzoneFilesChanged}
              isUploading={isUploading}
              waiting={files.length === 0}
              compact={files.length > 0}
              tightenWhenEmpty
              glass
            />
            {
              // The share button used to sit in a top-right corner above
              // the dropzone, always visible but disabled until files
              // existed — read fine on the old full-width bare page, but
              // cramped and inconsistent with every other glass card in
              // this app (TransferCard's own submit, every modal's) once
              // this became a narrow centered card. Moved below the file
              // list, full width, and — same reasoning as TransferCard's
              // own progressive disclosure — not rendered at all until
              // there's something to share, rather than shown-but-inert:
              // nothing to decide about, nothing to click, before a file
              // exists.
            }
            <AnimatedHeight duration={300} gapWhenOpen={16}>
              {files.length > 0 ? (
                <Stack align="stretch">
                  <FileList<FileUpload>
                    files={files}
                    setFiles={setFiles}
                    isUploading={isUploading}
                    onCancel={cancelUpload}
                    onRetry={retryFile}
                  />
                  <Button
                    fullWidth
                    loading={isUploading}
                    onClick={submitReverseShare}
                  >
                    <FormattedMessage id="common.button.share" />
                  </Button>
                </Stack>
              ) : null}
            </AnimatedHeight>
          </Stack>
        </AuthGlassLayout>
      </>
    );
  }

  return (
    <>
      <Meta title={t("upload.title")} />
      <PageDropOverlay visible={isDraggingFileOverPage} />
      {user?.isAdmin && config.get("share.enableNasImport") && (
        <Stack spacing={4} mb="sm">
          <Group position="right">
            <Button
              variant="subtle"
              size="xs"
              disabled={isUploading}
              onClick={openNasImportModal}
            >
              <FormattedMessage id="upload.nasImport.button" />
            </Button>
          </Group>
          {nasImportProgress && (
            <Stack spacing={2}>
              <Text size="xs" color="dimmed" align="right">
                {t("upload.nasImport.progress", {
                  done: nasImportProgress.done,
                  total: nasImportProgress.total,
                })}
              </Text>
              <Progress
                value={
                  nasImportProgress.total > 0
                    ? (nasImportProgress.done / nasImportProgress.total) * 100
                    : 0
                }
                size="sm"
                animate
              />
            </Stack>
          )}
        </Stack>
      )}
      <SplitTransferLayout>
        <TransferCard
          files={files}
          isUploading={isUploading}
          onCancelUpload={cancelUpload}
          onRetryFile={retryFile}
          maxShareSize={maxShareSize}
          currentFilesSize={currentFilesSize}
          onFilesChanged={handleDropzoneFilesChanged}
          setFiles={setFiles}
          onSubmit={startUpload}
          isUserSignedIn={user ? true : false}
          userEmail={user?.email}
          enableEmailRecepients={config.get("email.enableShareEmailRecipients")}
          enableUserRecipients={config.get("share.enableUserRecipients")}
          maxExpiration={
            user?.isAdmin || user?.canCreatePermanentShares
              ? { value: 0, unit: "days" }
              : config.get("share.maxExpiration")
          }
          defaultExpiration={config.get("share.defaultExpiration")}
          shareIdLength={config.get("share.shareIdLength")}
        />
      </SplitTransferLayout>
    </>
  );
};
export default Upload;
