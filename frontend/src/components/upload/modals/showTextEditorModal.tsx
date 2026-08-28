import { ModalsContextProps } from "@mantine/modals/lib/context";
import mime from "mime-types";
import { translateOutsideContext } from "../../../hooks/useTranslate.hook";
import { FileListItem, FileUpload } from "../../../types/File.type";
import { glassModalStyles } from "../glassModalTheme";
import TextEditor from "../TextEditor";

const showTextEditorModal = <T extends FileListItem>(
  index: number,
  files: T[],
  setFiles: (files: T[]) => void,
  text: string,
  modals: ModalsContextProps,
) => {
  const t = translateOutsideContext();
  const originalFile = files[index] as unknown as File;
  const mimeType = (mime.contentType(originalFile.name) || "").split(";")[0];

  modals.openModal({
    title: t("upload.text-editor.title", { fileName: originalFile.name }),
    size: "xl",
    styles: glassModalStyles,
    children: (
      <TextEditor
        initialText={text}
        onCancel={() => modals.closeAll()}
        onSave={(newText) => {
          const newFile = new File([newText], originalFile.name, {
            type: mimeType || "text/plain",
          });

          const fileUpload = newFile as FileUpload;
          fileUpload.uploadingProgress = 0;

          const updatedFiles = [...files];
          updatedFiles[index] = fileUpload as unknown as T;
          setFiles(updatedFiles);
          modals.closeAll();
        }}
      />
    ),
  });
};

export default showTextEditorModal;
