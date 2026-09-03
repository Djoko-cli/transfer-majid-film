import {
  Button,
  Center,
  Loader,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import Markdown, { MarkdownToJSX } from "markdown-to-jsx";
import Link from "next/link";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import api from "../../services/api.service";

const FilePreviewContext = React.createContext<{
  shareId: string;
  fileId: string;
  mimeType: string;
  setIsNotSupported: Dispatch<SetStateAction<boolean>>;
}>({
  shareId: "",
  fileId: "",
  mimeType: "",
  setIsNotSupported: () => {},
});

const FilePreview = ({
  shareId,
  fileId,
  mimeType,
}: {
  shareId: string;
  fileId: string;
  mimeType: string;
}) => {
  const [isNotSupported, setIsNotSupported] = useState(false);
  if (isNotSupported) return <UnSupportedFile />;

  return (
    <Stack>
      <FilePreviewContext.Provider
        value={{ shareId, fileId, mimeType, setIsNotSupported }}
      >
        <FileDecider />
      </FilePreviewContext.Provider>
      <Button
        variant="subtle"
        component={Link}
        onClick={() => modals.closeAll()}
        target="_blank"
        href={`/api/shares/${shareId}/files/${fileId}?download=false`}
      >
        <FormattedMessage id="share.modal.file-preview.view-original" />
      </Button>
    </Stack>
  );
};

const FileDecider = () => {
  const { mimeType, setIsNotSupported } = React.useContext(FilePreviewContext);

  if (mimeType == "application/pdf") {
    return <PdfPreview />;
  } else if (mimeType.startsWith("video/")) {
    return <VideoPreview />;
  } else if (mimeType.startsWith("image/")) {
    return <ImagePreview />;
  } else if (mimeType.startsWith("audio/")) {
    return <AudioPreview />;
  } else if (mimeType.startsWith("text/")) {
    return <TextPreview />;
  } else {
    setIsNotSupported(true);
    return null;
  }
};

const AudioPreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" spacing={10} style={{ width: "100%" }}>
        <audio controls preload="metadata" style={{ width: "100%" }}>
          <source
            src={`/api/shares/${shareId}/files/${fileId}?download=false`}
            onError={() => setIsNotSupported(true)}
          />
        </audio>
      </Stack>
    </Center>
  );
};

const VideoPreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  return (
    <video width="100%" controls preload="metadata">
      <source
        src={`/api/shares/${shareId}/files/${fileId}?download=false`}
        onError={() => setIsNotSupported(true)}
      />
    </video>
  );
};

const ImagePreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/shares/${shareId}/files/${fileId}?download=false`}
      alt={`${fileId}_preview`}
      width="100%"
      onError={() => setIsNotSupported(true)}
    />
  );
};

const TextPreview = () => {
  const { shareId, fileId } = React.useContext(FilePreviewContext);
  const [text, setText] = useState<string>("");
  const { colorScheme } = useMantineTheme();

  useEffect(() => {
    api
      .get(`/shares/${shareId}/files/${fileId}?download=false`)
      .then((res) => setText(res.data ?? "Preview couldn't be fetched."));
  }, [shareId, fileId]);

  const options: MarkdownToJSX.Options = {
    disableParsingRawHTML: true,
    overrides: {
      pre: {
        props: {
          style: {
            backgroundColor:
              colorScheme == "dark"
                ? "rgba(50, 50, 50, 0.5)"
                : "rgba(220, 220, 220, 0.5)",
            padding: "0.75em",
            whiteSpace: "pre-wrap",
          },
        },
      },
      table: {
        props: {
          className: "md",
        },
      },
    },
  };

  return <Markdown options={options}>{text}</Markdown>;
};

const PdfPreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    let objectUrl = "";
    api
      .get(`/shares/${shareId}/files/${fileId}?download=false`, {
        responseType: "blob",
      })
      .then((res) => {
        // Loaded as a blob and re-typed as application/pdf here rather than
        // pointed at the API URL directly: the file endpoint always answers
        // with `Content-Security-Policy: sandbox` (an anti-XSS measure for
        // arbitrary inline-served uploads), and that header disables
        // plugins in the framed document — which is exactly how Chrome
        // implements its built-in PDF viewer, so the iframe rendered blank.
        // A blob: URL carries no such header, so the viewer loads normally
        // while the original endpoint keeps its sandboxing for any other,
        // untrusted way of reaching it (e.g. the "view original" link).
        objectUrl = URL.createObjectURL(
          new Blob([res.data], { type: "application/pdf" }),
        );
        setBlobUrl(objectUrl);
      })
      .catch(() => setIsNotSupported(true));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shareId, fileId, setIsNotSupported]);

  // A slow connection otherwise sees a blank gray box for as long as the
  // blob fetch takes, with nothing to distinguish "still loading" from
  // "this preview is broken".
  if (!blobUrl) {
    return (
      <Center style={{ height: 600 }}>
        <Loader />
      </Center>
    );
  }

  return (
    <iframe
      src={blobUrl}
      title={`${fileId}_preview`}
      width="100%"
      height="600"
      style={{ border: "none" }}
    />
  );
};

const UnSupportedFile = () => {
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" spacing={10}>
        <Title order={3}>
          <FormattedMessage id="share.modal.file-preview.error.not-supported.title" />
        </Title>
        <Text>
          <FormattedMessage id="share.modal.file-preview.error.not-supported.description" />
        </Text>
      </Stack>
    </Center>
  );
};

export default FilePreview;
