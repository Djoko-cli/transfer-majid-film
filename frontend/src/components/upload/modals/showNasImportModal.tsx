import { Alert, Button, Group, MantineProvider, Stack, Text } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useState } from "react";
import { TbAlertCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import nasImportService from "../../../services/nasImport.service";
import { NasImportPreview } from "../../../types/nasImport.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import toast from "../../../utils/toast.util";
import NasImportBrowser from "../NasImportBrowser";
import glassFormTheme from "../glassFormTheme";
import { glassModalStyles } from "../glassModalTheme";

// Browse → preview → confirm. onConfirm hands back the raw top-level
// selection (paths, relative to the configured NAS root) plus the
// recursive-walk preview result — UploadPage.tsx's importFromNas uses the
// paths for the actual import and the preview's fileCount/totalSize only
// for a progress bar and a synthetic file list to open
// showCreateUploadModal with (that modal only ever needs name/size, see
// its own comment).
const showNasImportModal = (
  modals: ModalsContextProps,
  onConfirm: (paths: string[], preview: NasImportPreview) => void,
) => {
  const t = translateOutsideContext();

  modals.openModal({
    title: t("upload.nasImport.modal.title"),
    size: "lg",
    styles: glassModalStyles,
    children: (
      <MantineProvider inherit theme={glassFormTheme}>
        <NasImportModalBody onConfirm={onConfirm} />
      </MantineProvider>
    ),
  });
};

const NasImportModalBody = ({
  onConfirm,
}: {
  onConfirm: (paths: string[], preview: NasImportPreview) => void;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewResult, setPreviewResult] = useState<NasImportPreview | null>(
    null,
  );
  const [previewing, setPreviewing] = useState(false);

  // Any selection change invalidates a previous preview — re-running it is
  // an explicit action rather than automatic-on-every-click specifically so
  // a large folder isn't recursively walked on every single checkbox toggle.
  const handleSelectionChange = (next: Set<string>) => {
    setSelected(next);
    setPreviewResult(null);
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const result = await nasImportService.preview(Array.from(selected));
      setPreviewResult(result);
      if (result.fileCount === 0) {
        toast.error(t("upload.nasImport.modal.empty-selection"));
      }
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setPreviewing(false);
    }
  };

  const confirm = () => {
    if (!previewResult || previewResult.fileCount === 0) return;
    // Close *before* calling onConfirm, not after: onConfirm (UploadPage's
    // openNasImportModal) synchronously opens showCreateUploadModal as its
    // very next step — closeAll() afterward would indiscriminately close
    // that newly-opened modal too, since it doesn't distinguish "this
    // modal" from "whatever's in the stack now". Closing first leaves
    // nothing else open for it to catch.
    modals.closeAll();
    onConfirm(Array.from(selected), previewResult);
  };

  return (
    <Stack>
      <NasImportBrowser
        selected={selected}
        onSelectionChange={handleSelectionChange}
      />
      <Group position="apart">
        <Text size="sm" color="dimmed">
          {t("upload.nasImport.modal.selected-count", {
            count: selected.size,
          })}
        </Text>
        <Button
          variant="light"
          size="xs"
          disabled={selected.size === 0}
          loading={previewing}
          onClick={runPreview}
        >
          <FormattedMessage id="upload.nasImport.modal.preview-button" />
        </Button>
      </Group>
      {previewResult && previewResult.fileCount > 0 && (
        <Alert color="primary" icon={<TbAlertCircle size={16} />}>
          {t("upload.nasImport.modal.preview-result", {
            count: previewResult.fileCount,
            size: byteToHumanSizeString(previewResult.totalSize),
          })}
        </Alert>
      )}
      <Group position="right">
        <Button variant="subtle" onClick={() => modals.closeAll()}>
          <FormattedMessage id="common.button.cancel" />
        </Button>
        <Button
          disabled={!previewResult || previewResult.fileCount === 0}
          onClick={confirm}
        >
          <FormattedMessage id="common.button.confirm" />
        </Button>
      </Group>
    </Stack>
  );
};

export default showNasImportModal;
