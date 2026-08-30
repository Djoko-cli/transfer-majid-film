import {
  Anchor,
  Breadcrumbs,
  Center,
  Checkbox,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { TbFile, TbFolder } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import nasImportService from "../../services/nasImport.service";
import { NasEntry } from "../../types/nasImport.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";

// Selecting a folder selects its whole subtree — the checkbox never expands
// into a per-descendant selection client-side (that's exactly the job of
// the server-side recursive walk in NasImportService.preview/importBatch).
// Clicking a folder *row* navigates into it for browsing; the checkbox next
// to it is the only thing that actually selects it for import.
const NasImportBrowser = ({
  selected,
  onSelectionChange,
}: {
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}) => {
  const t = useTranslate();
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<NasEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    nasImportService
      .browse(currentPath)
      .then(setEntries)
      .catch((e) => {
        toast.axiosError(e);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [currentPath]);

  const crumbs = currentPath ? currentPath.split("/") : [];

  const toggle = (entryPath: string) => {
    const next = new Set(selected);
    if (next.has(entryPath)) next.delete(entryPath);
    else next.add(entryPath);
    onSelectionChange(next);
  };

  return (
    <Stack spacing="xs">
      <Breadcrumbs>
        <Anchor size="sm" onClick={() => setCurrentPath("")}>
          {t("upload.nasImport.browser.root")}
        </Anchor>
        {crumbs.map((crumb, i) => (
          <Anchor
            key={i}
            size="sm"
            onClick={() => setCurrentPath(crumbs.slice(0, i + 1).join("/"))}
          >
            {crumb}
          </Anchor>
        ))}
      </Breadcrumbs>
      <ScrollArea h={280}>
        {loading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : entries.length === 0 ? (
          <Text color="dimmed" size="sm" py="md" align="center">
            <FormattedMessage id="upload.nasImport.browser.empty" />
          </Text>
        ) : (
          <Table verticalSpacing={4}>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.path}>
                  <td style={{ width: 32 }}>
                    <Checkbox
                      checked={selected.has(entry.path)}
                      onChange={() => toggle(entry.path)}
                      aria-label={entry.name}
                    />
                  </td>
                  <td style={{ width: 24 }}>
                    {entry.isDirectory ? <TbFolder /> : <TbFile />}
                  </td>
                  <td
                    style={{
                      cursor: entry.isDirectory ? "pointer" : "default",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      maxWidth: 0, // forces the ellipsis to respect the table's own layout instead of growing the column
                    }}
                    onClick={() =>
                      entry.isDirectory && setCurrentPath(entry.path)
                    }
                  >
                    {entry.name}
                  </td>
                  <td style={{ width: 80, whiteSpace: "nowrap" }}>
                    {entry.size !== null
                      ? byteToHumanSizeString(entry.size)
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ScrollArea>
    </Stack>
  );
};

export default NasImportBrowser;
