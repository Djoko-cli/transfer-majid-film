import { Collapse } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { cleanNotifications } from "@mantine/notifications";
import { AxiosError } from "axios";
import pLimit from "p-limit";
import { useEffect, useMemo, useRef, useState } from "react";
import Meta from "../Meta";
import FileList from "./FileList";
import PageDropOverlay from "./PageDropOverlay";
import { usePageFileDrop } from "../../hooks/pageFileDrop.hook";
import SplitTransferLayout from "./SplitTransferLayout";
import TermsGate from "./TermsGate";
import TransferCard from "./TransferCard";
import showCompletedUploadModal from "./modals/showCompletedUploadModal";
import showEmailVerificationModal from "./modals/showEmailVerificationModal";
import showNasImportModal from "./modals/showNasImportModal";
import useConfig from "../../hooks/config.hook";
import useConfirmLeave from "../../hooks/confirm-leave.hook";
import useTermsAcceptance from "../../hooks/termsAcceptance.hook";
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
} from "../../utils/file.util";

const promiseLimit = pLimit(3);

const Upload = ({ maxShareSize }: { maxShareSize?: number }) => {
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
  // A confirmed-but-not-yet-submitted NAS selection - set once the browse
  // modal hands back a choice, cleared once importFromNas finishes
  // successfully (or the user removes it via TransferCard's own clear
  // affordance). While this is set, TransferCard shows a summary of it
  // instead of the dropzone/file-list, using the exact same inline share-
  // options form and "Partager" button a regular upload does - the NAS
  // button used to hand off to its own second modal collecting that same
  // form again, which is exactly the duplication this replaces.
  const [nasImportSelection, setNasImportSelection] = useState<{
    paths: string[];
    preview: NasImportPreview;
  } | null>(null);

  // Cookie-backed (see _app.tsx) rather than localStorage - the server can
  // read a cookie back off the request, so a returning visitor's very
  // first server-rendered byte already reflects their prior "accepted"
  // choice instead of showing the gate again until a client-only effect
  // corrects it. That was this component's original approach, and it was
  // fine in the always-hydrates-in-a-frame-or-two production build, but
  // dev mode's much larger unminified bundle stretched that correction
  // window wide enough to clearly see - reported by the user from a real
  // Safari reload, caught on video, after this session's own faster
  // synthetic testing had missed it.
  const { hasAcceptedTerms, acceptTerms } = useTermsAcceptance();

  const requiresEmailVerification =
    !user && config.get("share.requireEmailVerificationForAnonymousShares");

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
  // True for the whole duration of any importFromNas-driven submission —
  // NAS-only, or combined with dropped files. Suppresses the plain
  // upload-completion effect further down (see its own comment): that
  // effect still needs to watch `files` unconditionally so dropped files'
  // progress bars keep updating during a combined submission, but must
  // not independently call completeShare() on its own the moment those
  // finish — importFromNas already awaits everything (NAS commit, and any
  // dropped files) together and drives completion itself once both are
  // actually done.
  const nasSubmissionActiveRef = useRef(false);
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

  // Addressed by the file itself, never by its position. A visitor can
  // remove a queued or failed file while other uploads are still running
  // (FileList keeps the delete action on those rows on purpose), which
  // shifts every later index: progress then landed on the neighbouring
  // row, and the file that had moved up read its predecessor's 100% - so
  // the share completed while that file was still in flight, or its own
  // updates addressed a slot past the end of the array and its row sat
  // frozen forever with the submit button spinning. Identity survives a
  // removal; a position does not.
  const setFileProgress = (file: FileUpload, progress: number) => {
    // Mutates in place rather than spreading — `FileUpload` extends the
    // browser's native `File`, whose real data (name, size, slice()...)
    // lives in internal slots, not enumerable own properties. `{...file}`
    // silently produces a plain object missing all of it.
    file.uploadingProgress = progress;
    // A new array so this renders and the completion effect re-runs. A
    // file the visitor removed mid-upload is no longer in the list: its
    // late progress updates simply have nothing to show, and skipping the
    // state write keeps them from re-rendering the card for nothing.
    setFiles((files) => (files.includes(file) ? [...files] : files));
  };

  // Returns whether the file made it all the way through — read by
  // importFromNas's combined path (below) to know, once every dropped
  // file has settled, whether it's clear to complete the share; ignored
  // by this function's other two callers (uploadFiles's own Promise.all,
  // retryFile), which learn the same thing by watching `files` state
  // instead.
  const uploadOneFile = async (file: FileUpload): Promise<boolean> => {
    let fileId;

    setFileProgress(file, 1);

    let chunks = Math.ceil(file.size / chunkSize.current);

    // If the file is 0 bytes, we still need to upload 1 chunk
    if (chunks == 0) chunks++;

    let attempts = 0;

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      if (cancelledRef.current) return false;

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
                setFileProgress(file, Math.min(overallPercent, 99.9));
              }
            },
          )
          .then((response) => {
            fileId = response.id;
          });

        setFileProgress(file, ((chunkIndex + 1) / chunks) * 100);
        attempts = 0;
      } catch (e) {
        if (cancelledRef.current) return false;
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
        setFileProgress(file, -1);
        if (attempts >= MAX_CHUNK_ATTEMPTS) {
          // Give up on this file — it stays at -1 (an honest, terminal
          // "failed" state) until the visitor retries it manually via
          // FileList's retry action, rather than looping forever unseen.
          return false;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_RETRY_DELAY_MS),
        );
        chunkIndex = -1;
        continue;
      }
    }
    return true;
  };

  const uploadFiles = async (share: CreateShare, files: FileUpload[]) => {
    cancelledRef.current = false;
    setisUploading(true);

    try {
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      createdShareRef.current = await shareService.create({
        ...share,
        size: totalSize,
      });
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
      files.map((file) =>
        // Limit the number of concurrent uploads to 3
        promiseLimit(() => uploadOneFile(file)),
      ),
    );
  };

  // Re-runs a single file's upload from scratch — safe to call once that
  // file has reached the terminal -1 state above, since uploadOneFile has
  // already returned and nothing else is still touching it.
  const retryFile = (fileIndex: number) => {
    const file = files[fileIndex] as FileUpload;
    promiseLimit(() => uploadOneFile(file));
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
  // A pending NAS selection takes a completely different path (no OTP
  // gate - see importFromNas's own comment) and is checked first, before
  // any of that machinery - including when dropped files are also
  // present: NAS import only ever runs for a signed-in admin, and the OTP
  // gate only ever applies to an anonymous sender, so the two conditions
  // can never both apply to the same submission.
  const startUpload = (share: CreateShare, mode: Mode = "link") => {
    if (nasImportSelection) {
      importFromNas(
        share,
        nasImportSelection.paths,
        nasImportSelection.preview,
        mode,
        files,
      );
      return;
    }

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

  // Drives a NAS-import submission, alone or combined with dropped files
  // sharing the same share (droppedFiles, possibly []). Mirrors
  // uploadFiles above (create → wait → complete → show the same
  // completion modal) but stays entirely self-contained rather than
  // reactive: the plain-upload completion effect further down explicitly
  // steps aside for the whole duration (nasSubmissionActiveRef) since
  // this function already awaits everything itself — the resumable NAS
  // commit loop and any dropped files' own chunk uploads, run
  // concurrently via Promise.allSettled rather than one after the other,
  // since neither depends on the other finishing first.
  //
  // size passed to shareService.create() only covers droppedFiles' real
  // bytes (undefined when there are none, exactly like a NAS-only
  // submission today) — a symlinked NAS import consumes ~0 real local
  // disk regardless of the NAS content's actual size, so it was never
  // counted toward the disk-space/quota pre-check that size triggers,
  // and folding it in would only make that check needlessly stricter for
  // the part that isn't actually using local disk.
  const importFromNas = async (
    share: CreateShare,
    paths: string[],
    preview: NasImportPreview,
    mode: Mode,
    droppedFiles: FileUpload[],
  ) => {
    nasSubmissionActiveRef.current = true;
    setisUploading(true);
    setNasImportProgress({ done: 0, total: preview.fileCount });

    try {
      createdShareRef.current = await shareService.create(
        droppedFiles.length > 0
          ? {
              ...share,
              size: droppedFiles.reduce((acc, file) => acc + file.size, 0),
            }
          : share,
      );
    } catch (e) {
      toast.axiosError(e);
      setisUploading(false);
      setNasImportProgress(null);
      nasSubmissionActiveRef.current = false;
      return;
    }

    const runNasCommit = async () => {
      let cursor: number | undefined;
      let importedSoFar = 0;
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
    };

    // A file already at 100 is skipped rather than re-uploaded — matters
    // on a retry after a partial failure (e.g. the NAS commit failed but
    // these had already finished): re-running them from scratch would
    // create duplicate file entries instead of actually retrying
    // anything, since the regular upload endpoint has no name-collision
    // dedup the way NAS import's own commit does.
    const runDroppedUploads = () =>
      Promise.all(
        droppedFiles.map((file) =>
          file.uploadingProgress >= 100
            ? Promise.resolve(true)
            : promiseLimit(() => uploadOneFile(file)),
        ),
      );

    const [nasResult, droppedResult] = await Promise.allSettled([
      runNasCommit(),
      runDroppedUploads(),
    ]);

    if (nasResult.status === "rejected") {
      toast.axiosError(nasResult.reason);
      setisUploading(false);
      setNasImportProgress(null);
      nasSubmissionActiveRef.current = false;
      return;
    }
    setNasImportProgress(null);

    // droppedResult can't itself reject (uploadOneFile never throws), but
    // individual files inside it can still have failed. Same rule as the
    // plain-upload path below: don't complete until every file's
    // through — step aside instead (the effect below already shows its
    // own error toast off the same `files` state) so FileList's per-file
    // retry can pick up from here, the NAS side already being done.
    const droppedOk =
      droppedResult.status === "fulfilled"
        ? droppedResult.value.every((ok) => ok)
        : false;
    if (!droppedOk) {
      nasSubmissionActiveRef.current = false;
      return;
    }

    try {
      const completedShare = await shareService.completeShare(
        createdShareRef.current!.id,
      );
      setisUploading(false);
      nasSubmissionActiveRef.current = false;
      // Only cleared on real success — left intact on any of the errors
      // above so "Partager" retries the same selection, the same way a
      // failed regular upload leaves `files` alone for its own retry.
      setNasImportSelection(null);
      setFiles([]);
      showCompletedUploadModal(
        modals,
        completedShare,
        config.get("general.appUrl"),
        config.get("general.appUrl", true),
        undefined,
        true,
        mode,
        config.get("smtp.enabled") &&
          config.get("email.enableShareDownloadNotifications"),
      );
    } catch {
      toast.error(t("upload.notify.generic-error"));
      setisUploading(false);
      nasSubmissionActiveRef.current = false;
    }
  };

  // Reopening seeds the browse modal's own selection from whatever's
  // already confirmed, so picking more paths adds to it instead of
  // starting over — see showNasImportModal's own initialSelected comment.
  const openNasImportModal = () => {
    showNasImportModal(
      modals,
      nasImportSelection?.paths ?? [],
      (paths, preview) => {
        setNasImportSelection({ paths, preview });
      },
    );
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

  // Anywhere-on-the-page drag & drop, shared with the collection page's own
  // deposit form — see usePageFileDrop for why the window is the target and
  // how the enter/leave counting works. Only the size ceiling is this
  // page's own business.
  const isDraggingFileOverPage = usePageFileDrop({
    enabled: !isUploading && hasAcceptedTerms,
    onDrop: (droppedFiles) => {
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
    },
  });

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (modals.modals.length > 0 || !hasAcceptedTerms) {
        return;
      }

      // Pasting into an actual text field (the recipient/name/message/
      // email inputs below, or a searchable MultiSelect's own input) must
      // paste text there as normal — without this, Cmd+V anywhere on the
      // page always landed here first and turned the clipboard into a new
      // .txt file dropped into the share instead, reported directly after
      // it ate an email address someone meant to paste into "Votre
      // e-mail". Confined to genuinely blank space (or a click that
      // landed on non-editable page chrome) is exactly this feature's own
      // intent — quickly turning clipboard text/images into a shareable
      // file — so this only needs to step aside for editable targets, not
      // stop doing that anywhere else.
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) {
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
  }, [modals.modals.length, hasAcceptedTerms]);

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

    // Complete share — stands aside while importFromNas is driving this
    // submission itself (see nasSubmissionActiveRef's own comment), even
    // though this effect keeps running unconditionally above so dropped
    // files' progress/error toast still update live during a combined
    // submission.
    if (
      !nasSubmissionActiveRef.current &&
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
            // Both flows sit on a glass backdrop now (AuthGlassLayout for
            // reverse-share, SplitTransferLayout for the main flow) - see
            // showCompletedUploadModal's own comment on this parameter.
            true,
            submittedModeRef.current,
            config.get("smtp.enabled") &&
              config.get("email.enableShareDownloadNotifications"),
          );
          setFiles([]);
        })
        .catch(() => toast.error(t("upload.notify.generic-error")));
    }
  }, [files]);

  // Passed to TransferCard (which forwards it straight to Dropzone - see
  // its own prop comment for the full history of where this used to live
  // and why). Gated here exactly as before: hidden until hasAcceptedTerms,
  // admin-only, behind the config toggle. Only the button's onClick now -
  // once a selection exists, TransferCard hides the dropzone (and this
  // button along with it) entirely, so there's nothing left here that
  // ever needs to reflect import progress.
  const nasImport =
    hasAcceptedTerms && user?.isAdmin && config.get("share.enableNasImport")
      ? { onClick: openNasImportModal }
      : undefined;

  // The actual content each flow shows once past the terms gate -
  // pulled out so both this and TermsGate itself can sit as siblings in
  // the Collapse pair below (see gatedContent), one glass card whose
  // height morphs from the gate's to this one's instead of the two being
  // separate return branches (and so separate mounts of
  // SplitTransferLayout/AuthGlassLayout) with nothing animating the cut
  // between them at all. Reported by the user from their own viewing:
  // it read as a hard jump.
  const realContent = (
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
      nasImport={nasImport}
      nasImportPreview={nasImportSelection?.preview ?? null}
      nasImportProgress={nasImportProgress}
      onClearNasImport={() => setNasImportSelection(null)}
    />
  );

  // Gate and content as a pair of Mantine Collapses, one closing while
  // the other opens, so the card's height morphs from one to the other
  // without a hard cut. This replaces an AnimatedHeight wrapping the
  // whole swap - and that AnimatedHeight was the root cause of the
  // card's animation desync reported from a desktop recording: as the
  // *only* child of SplitTransferLayout's `.card`, it governed the box
  // height of the entire card for the whole session, not just the one
  // gate-to-content morph it was added for (95cdc2b). Every content
  // change inside TransferCard (a field appearing on Lien/E-mail, a file
  // row added) re-laid-out instantly, then this wrapper's ResizeObserver
  // saw the new size and re-targeted its own height transition - on
  // every tick, for as long as anything inside was still animating -
  // so the visible card grew in steps behind its own content, then
  // eased on alone for another 300ms after the content had stopped.
  // Removing TransferCard's inner AnimatedHeight (its own history) moved
  // the seam up one level; it had to go here too. Measured directly:
  // with this in place, `.card` moved 929 -> 933 -> 947 -> 960 in
  // discrete jumps while its content grew every frame, then 969 -> 989
  // on its own after the content was done.
  //
  // Collapse animates the content's own height directly, so `.card`
  // (height: auto, no transition of its own) follows in the same layout
  // pass - content, box and SplitTransferLayout's flex-centering move as
  // one, deterministically, with nothing measuring anything. Both
  // children stay mounted (Collapse needs them there to animate; the
  // closed one settles at display:none, so nothing in it is focusable or
  // in flow). SSR-correct for a returning visitor by construction:
  // useCollapse derives its very first styles from `in`, so a visitor
  // whose terms cookie already says yes gets the content on the first
  // painted byte and the gate at display:none - the flash 95cdc2b fixed
  // can't come back through this. The keyed fade-in Box this used to
  // wrap is gone with it: Collapse's own animateOpacity (on by default)
  // already fades the incoming half in as it opens. One shared duration
  // for the pair rather than Mantine's per-height auto duration, which
  // would close the short gate (~230ms) well before the tall content
  // finished opening (~430ms) and dip the card's height mid-swap.
  const gatedContent = (
    <>
      <Collapse in={!hasAcceptedTerms} transitionDuration={300}>
        <TermsGate onAccept={acceptTerms} maxShareSize={maxShareSize} />
      </Collapse>
      <Collapse in={hasAcceptedTerms} transitionDuration={300}>
        {realContent}
      </Collapse>
    </>
  );

  return (
    <>
      <Meta title={t("upload.title")} ogTitle={t("upload.ogTitle")} />
      <PageDropOverlay visible={isDraggingFileOverPage} />
      <SplitTransferLayout>{gatedContent}</SplitTransferLayout>
    </>
  );
};
export default Upload;
