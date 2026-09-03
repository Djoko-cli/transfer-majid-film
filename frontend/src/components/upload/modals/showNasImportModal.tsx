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

// Browse → select → preview → confirm, nothing else - the share-options
// form (expiration, name, recipients, security) lives in TransferCard,
// same as it does for a regular drag-and-drop upload, not duplicated
// here. This modal's only job is handing back which NAS paths were
// picked; UploadPage.tsx puts that into its own state and TransferCard
// renders the rest inline, right where the dropzone/file-list normally
// are, with the same "Partager" button driving both flows. (An earlier
// version of this modal also collected the share-options form itself, as
// a second internal step - reworked after the user clarified that
// wasn't what they wanted: the whole point was for the *existing* inline
// form to handle it, not a second copy of those same fields anywhere,
// modal or not.)
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
    // Close *before* calling onConfirm — this used to matter because
    // onConfirm synchronously opened a second modal; it no longer does,
    // but closing first (rather than relying on onConfirm's own caller to
    // do it) still keeps this modal in charge of its own lifecycle.
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
