import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { cleanNotifications } from "@mantine/notifications";
import { AxiosError } from "axios";
import moment from "moment";
import pLimit from "p-limit";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import Dropzone from "../upload/Dropzone";
import FileList from "../upload/FileList";
import showEmailVerificationModal from "../upload/modals/showEmailVerificationModal";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import shareService from "../../services/share.service";
import { FileUpload } from "../../types/File.type";
import toast from "../../utils/toast.util";
import {
  getNormalizedFileName,
  filterDuplicateFiles,
} from "../../utils/file.util";

const promiseLimit = pLimit(3);

// Same budget as UploadPage's own chunk loop — a short, fixed retry
// window rather than a genuinely dead connection retrying silently
// forever behind an unclosable spinner.
const MAX_CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_DELAY_MS = 2000;

// The visitor's own drop, appended to the container's page rather than a
// page of its own — see docs/collecte-conteneur-unique.md §5: a deposit
// link no longer has a page of its own, there's just the transfer, and
// this is what turns its page into both the album and the drop. Mirrors
// UploadPage's chunked upload loop (per-chunk retry/backoff, per-file
// progress) but aimed at the contribution routes (task 3) instead of the
// plain upload one, and without any of UploadPage's NAS-import or
// S3-direct-upload machinery — neither exists for a contribution.
const CollectionDropzone = ({
  shareId,
  isOpen,
  endsAt,
  maxShareSize,
  onDeposited,
}: {
  shareId: string;
  isOpen: boolean;
  // Only meaningful (and only ever passed) once the collection is closed —
  // the date the "closed since" message reads.
  endsAt?: Date;
  maxShareSize: number;
  // Reloads the album (the page's own getFiles) once a contribution has
  // completed, so the visitor sees their own files land among everyone
  // else's without a manual refresh.
  onDeposited: () => void;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const config = useConfig();
  const { user } = useUser();

  const [name, setName] = useState("");
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Set once the one-time code has proven an address in this page visit —
  // persists across more than one deposit, exactly like UploadPage's own
  // isEmailVerified, so dropping a second batch under a different first
  // name (the brief's own live-check step) doesn't re-send a code for an
  // address that hasn't changed.
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);

  const chunkSize = useRef(parseInt(config.get("share.chunkSize")));
  const contributionIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const currentFilesSize = files.reduce((acc, file) => acc + file.size, 0);

  const setFileProgress = (file: FileUpload, progress: number) => {
    // Mutates in place — see UploadPage's own setFileProgress for why:
    // FileUpload's real data lives in File's internal slots, not
    // enumerable own properties, so `{...file}` would silently drop it.
    file.uploadingProgress = progress;
    setFiles((files) => (files.includes(file) ? [...files] : files));
  };

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
          .uploadContributionFile(
            shareId,
            contributionIdRef.current!,
            blob,
            { id: fileId, name: getNormalizedFileName(file) },
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
          chunkIndex = e.response!.data!.expectedChunkIndex - 1;
          continue;
        }

        attempts++;
        setFileProgress(file, -1);
        if (attempts >= MAX_CHUNK_ATTEMPTS) {
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

  const retryFile = (fileIndex: number) => {
    const file = files[fileIndex] as FileUpload;
    promiseLimit(() => uploadOneFile(file));
  };

  const cancelUpload = () => {
    cancelledRef.current = true;
    setIsUploading(false);
    setFiles([]);
    cleanNotifications();
    toast.success(t("upload.notify.cancelled"));
  };

  // Opens the contribution, then fires every file's upload without
  // awaiting them — exactly UploadPage's own uploadFiles, and for the
  // same reason: completion is decided in exactly one place, the effect
  // below watching `files`, not here. Earlier this function itself
  // awaited Promise.all and called completeContribution when every result
  // came back true — which worked for a clean run, but had no way to
  // notice a file that failed here and was later fixed by FileList's own
  // retry action (retryFile below): the bytes would land, and then
  // nothing would ever close the contribution — no zip rebuild, no owner
  // notification — and clicking "Envoyer" again (the only visible next
  // step) opened a SECOND contribution, re-uploaded everything including
  // the files that had already succeeded, and spent another use for it.
  const depositFiles = async (
    contributorName: string | undefined,
    filesToUpload: FileUpload[],
  ) => {
    cancelledRef.current = false;
    setIsUploading(true);

    try {
      const contribution = await shareService.openContribution(
        shareId,
        contributorName,
      );
      contributionIdRef.current = contribution.id;
    } catch (e) {
      toast.axiosError(e);
      setIsUploading(false);
      return;
    }

    if (cancelledRef.current) return;

    Promise.all(
      filesToUpload.map((file) => promiseLimit(() => uploadOneFile(file))),
    );
  };

  // The single trigger for closing a contribution — mirrors UploadPage's
  // own completion effect. Runs after every change to `files`, which
  // covers both a clean run (depositFiles' own uploads all reaching 100)
  // and a delayed one (a permanently-failed file that FileList's retry
  // button later pushed to 100 on its own) the same way: this is the only
  // place either path is ever noticed.
  useEffect(() => {
    const fileErrorCount = files.filter(
      (file) => file.uploadingProgress == -1,
    ).length;

    if (fileErrorCount > 0) {
      toast.error(t("upload.notify.count-failed", { count: fileErrorCount }), {
        id: "collection-deposit-error",
        withCloseButton: true,
        autoClose: false,
      });
    } else {
      cleanNotifications();
    }

    if (
      files.length > 0 &&
      files.every((file) => file.uploadingProgress >= 100) &&
      fileErrorCount == 0
    ) {
      shareService
        .completeContribution(shareId, contributionIdRef.current!)
        .then(() => {
          setIsUploading(false);
          setFiles([]);
          setName("");
          contributionIdRef.current = null;
          onDeposited();
        })
        .catch(() => toast.error(t("upload.notify.generic-error")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const handleFilesChanged = (newFiles: FileUpload[]) => {
    const filtered = filterDuplicateFiles(newFiles, files, (normalizedName) =>
      toast.error(
        t("upload.notify.duplicate-skipped", { name: normalizedName }),
      ),
    );
    if (filtered.length === 0) return;
    setFiles((oldArr) => [...oldArr, ...filtered]);
  };

  const trimmedName = name.trim();
  const canSubmit = files.length > 0 && (!!user || trimmedName.length > 0);

  const handleSubmit = () => {
    if (!canSubmit || isUploading) return;

    // A snapshot, not the state variable itself — the modal below can sit
    // open for as long as the visitor takes to read their code out of
    // their inbox, and depositFiles must act on exactly the files that
    // were queued at the moment "Envoyer" was clicked.
    const filesToUpload = files;

    if (!user && !isIdentityVerified) {
      showEmailVerificationModal(modals, () => {
        setIsIdentityVerified(true);
        depositFiles(trimmedName, filesToUpload);
      });
      return;
    }

    depositFiles(user ? undefined : trimmedName, filesToUpload);
  };

  if (!isOpen) {
    // isOpen folds two different closures together (the window, and the
    // use count — see ShareController.buildCollectionState). Only one of
    // them makes "fermée depuis le {date}" true: a collection that filled
    // up while its window was still running printed that sentence
    // followed by a date in the future.
    const hasWindowLeft = moment(endsAt).isAfter(moment());
    return (
      <Text size="sm" color="dimmed" mt="lg">
        {hasWindowLeft ? (
          <FormattedMessage id="share.collection.closed-full" />
        ) : (
          <FormattedMessage
            id="share.collection.closed-since"
            values={{ date: moment(endsAt).format("LLL") }}
          />
        )}
      </Text>
    );
  }

  return (
    <Stack spacing="sm" mt="lg">
      {user ? (
        <Text size="sm" color="dimmed">
          <FormattedMessage
            id="share.collection.identity.signed-in-as"
            values={{ name: user.username }}
          />
        </Text>
      ) : (
        <Stack spacing={4}>
          <Text size="sm" weight={600}>
            <FormattedMessage id="share.collection.identity.title" />
          </Text>
          <TextInput
            label={t("share.collection.identity.name-label")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={isUploading}
          />
        </Stack>
      )}

      <Dropzone
        title={t("share.collection.add-files")}
        maxShareSize={maxShareSize}
        currentFilesSize={currentFilesSize}
        onFilesChanged={handleFilesChanged}
        isUploading={isUploading}
        compact={files.length > 0}
        glass
      />

      {files.length > 0 && (
        <>
          <FileList
            files={files}
            setFiles={setFiles}
            isUploading={isUploading}
            onCancel={cancelUpload}
            onRetry={retryFile}
          />
          <Group position="right">
            <Button
              onClick={handleSubmit}
              loading={isUploading}
              disabled={!canSubmit}
            >
              <FormattedMessage id="common.button.submit" />
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
};

export default CollectionDropzone;
