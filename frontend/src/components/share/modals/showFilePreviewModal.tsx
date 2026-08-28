import { MantineProvider } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import mime from "mime-types";
import { FileMetaData } from "../../../types/File.type";
import glassFormTheme from "../../upload/glassFormTheme";
import { glassModalStyles } from "../../upload/glassModalTheme";
import FilePreview from "../FilePreview";

const showFilePreviewModal = (
  shareId: string,
  file: FileMetaData,
  modals: ModalsContextProps,
) => {
  const mimeType = (mime.contentType(file.name) || "").split(";")[0];
  return modals.openModal({
    size: "xl",
    title: file.name,
    styles: glassModalStyles,
    children: (
      <MantineProvider inherit theme={glassFormTheme}>
        <FilePreview shareId={shareId} fileId={file.id} mimeType={mimeType} />
      </MantineProvider>
    ),
  });
};

export default showFilePreviewModal;
