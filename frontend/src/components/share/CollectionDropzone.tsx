import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { cleanNotifications } from "@mantine/notifications";
import { AxiosError } from "axios";
import moment from "moment";
import pLimit from "p-limit";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import CollectionDepositDone from "./CollectionDepositDone";
import Dropzone from "../upload/Dropzone";
import PageDropOverlay from "../upload/PageDropOverlay";
import FileList from "../upload/FileList";
import showEmailVerificationModal from "../upload/modals/showEmailVerificationModal";
import useConfig from "../../hooks/config.hook";
import { usePageFileDrop } from "../../hooks/pageFileDrop.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import { useSubmitButtonStyles } from "../core/submitButtonStyles";
import shareService from "../../services/share.service";
import { FileUpload } from "../../types/File.type";
import toast from "../../utils/toast.util";
import {
  getNormalizedFileName,
  filterDuplicateFiles,
} from "../../utils/file.util";
import { byteToHumanSizeString } from "../../utils/fileSize.util";

const promiseLimit = pLimit(3);

// Same budget as UploadPage's own chunk loop — a short, fixed retry
// window rather than a genuinely dead connection retrying silently
// forever behind an unclosable spinner.
const MAX_CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_DELAY_MS = 2000;

// The visitor's own drop, appended to the container's page rather than a
// page of its own — see docs/collecte-conteneur-unique.md §5: a deposit
// link no longer has a page of its own, there's just the transfer, and
// this is what turns its page into both the transfer and the drop. Mirrors
// UploadPage's chunked upload loop (per-chunk retry/backoff, per-file
// progress) but aimed at the contribution routes (task 3) instead of the
// plain upload one, and without any of UploadPage's NAS-import or
// S3-direct-upload machinery — neither exists for a contribution.
const CollectionDropzone = ({
  shareId,
  isOpen,
  endsAt,
  notifiesCreator,
  maxShareSize,
  onDeposited,
}: {
  shareId: string;
  isOpen: boolean;
  // Only meaningful (and only ever passed) once the collection is closed —
  // the date the "closed since" message reads.
  endsAt?: Date;
  // Whether completing a deposit emails the collection's creator — what
  // the confirmation may truthfully say about it.
  notifiesCreator: boolean;
  maxShareSize: number;
  // Reloads the transfer (the page's own getFiles) once a contribution has
  // completed, so the visitor sees their own files land among everyone
  // else's without a manual refresh.
  onDeposited: () => void;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const config = useConfig();
  const { user } = useUser();
  const { classes: shimmer } = useSubmitButtonStyles();

  const [name, setName] = useState("");
  // Asked for here, beside the first name, rather than sprung as a modal
  // after "Envoyer" — which is where it used to appear, and which meant a
  // visitor had already queued their files and committed to sending before
  // learning an address was wanted at all. The verification modal still
  // opens, but only ever to take the code: it receives this address as its
  // `knownEmail` and sends the code on mount, exactly as UploadPage's own
  // anonymous send already does.
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Set once the one-time code has proven an address in this page visit —
  // persists across more than one deposit, exactly like UploadPage's own
  // isEmailVerified, so dropping a second batch under a different first
  // name (the brief's own live-check step) doesn't re-send a code for an
  // address that hasn't changed.
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);
  // The last deposit, once it has landed: while set, the confirmation
  // stands where the drop zone was. Cleared by "déposer d'autres
  // fichiers", or by simply dropping more files on the page.
  const [deposited, setDeposited] = useState<{
    fileCount: number;
    totalSize: number;
  } | null>(null);

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
          setDeposited({
            fileCount: files.length,
            totalSize: files.reduce((acc, file) => acc + file.size, 0),
          });
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
    setDeposited(null);
    setFiles((oldArr) => [...oldArr, ...filtered]);
  };

  // Le plein écran existait sur la page d'envoi direct et nulle part
  // ailleurs : déposer un fichier n'importe où sur la page d'un transfert
  // inversé ne faisait rien, alors que c'est exactement le geste que ce
  // mode attend de chaque contributeur. Même hook, même plafond de taille
  // que le Dropzone juste en dessous.
  const isDraggingFileOverPage = usePageFileDrop({
    enabled: !isUploading && isOpen,
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

      handleFilesChanged(
        droppedFiles.map((file) => {
          file.uploadingProgress = 0;
          return file;
        }),
      );
    },
  });

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  // Same shape the verification modal validates with — worth repeating
  // rather than importing, because the two must agree and this one is what
  // decides whether the button is even clickable.
  const isEmailValid = /^\S+@\S+\.\S+$/.test(trimmedEmail);
  const canSubmit =
    files.length > 0 && (!!user || (trimmedName.length > 0 && isEmailValid));

  const handleSubmit = () => {
    if (!canSubmit || isUploading) return;

    // A snapshot, not the state variable itself — the modal below can sit
    // open for as long as the visitor takes to read their code out of
    // their inbox, and depositFiles must act on exactly the files that
    // were queued at the moment "Envoyer" was clicked.
    const filesToUpload = files;

    if (!user && !isIdentityVerified) {
      showEmailVerificationModal(
        modals,
        // The address that comes back is not necessarily the one passed
        // in: the modal offers "changer d'adresse", and what was actually
        // proven is what this field should show afterwards.
        (verifiedEmail) => {
          setEmail(verifiedEmail);
          setIsIdentityVerified(true);
          depositFiles(trimmedName, filesToUpload);
        },
        trimmedEmail,
      );
      return;
    }

    depositFiles(user ? undefined : trimmedName, filesToUpload);
  };

  // Before the closed check, not after: the reload that follows a deposit
  // can close the collection — when this deposit took its last use — and
  // the person who just filled it must still read that it worked, not
  // "this transfer accepts no more deposits" in its place. They only lose
  // the button to drop more.
  if (deposited)
    return (
      <>
        <PageDropOverlay visible={isDraggingFileOverPage} />
        <CollectionDepositDone
          fileCount={deposited.fileCount}
          totalSize={deposited.totalSize}
          notifiesCreator={notifiesCreator}
          verifiedEmail={!user && isIdentityVerified ? trimmedEmail : undefined}
          onDepositMore={isOpen ? () => setDeposited(null) : undefined}
        />
      </>
    );

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
      {/* `position: fixed` — hors flux, donc sa place dans l'arbre n'a pas
          d'importance et le Stack ne lui réserve aucun espace. */}
      <PageDropOverlay visible={isDraggingFileOverPage} />
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
          <TextInput
            type="email"
            label={t("share.collection.identity.email-label")}
            description={
              isIdentityVerified
                ? undefined
                : t("share.collection.identity.email-description")
            }
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            onBlur={() => setEmailTouched(true)}
            // Only once they have left the field, and only if they put
            // something in it: an address is invalid for the whole time it
            // is being typed, and shouting about it from the first
            // keystroke is noise, not help.
            error={
              emailTouched && trimmedEmail.length > 0 && !isEmailValid
                ? t("common.error.invalid-email")
                : undefined
            }
            disabled={isUploading || isIdentityVerified}
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
          {/* Directement dans le Stack, qui étire ses enfants : ce bouton
              était né dans un `<Group position="right">` alors qu'il y est
              seul — la forme qu'on écrit quand on attend une paire
              « Annuler / Envoyer ». Il n'y en a jamais eu qu'un, et déposer
              dans une collecte est le même geste qu'envoyer un transfert :
              même taille, même largeur, même scintillement. */}
          <Button
            size="md"
            onClick={handleSubmit}
            loading={isUploading}
            disabled={!canSubmit}
            className={canSubmit && !isUploading ? shimmer.ready : undefined}
          >
            <FormattedMessage id="common.button.submit" />
          </Button>
        </>
      )}
    </Stack>
  );
};

export default CollectionDropzone;
