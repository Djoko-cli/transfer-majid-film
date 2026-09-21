import { ActionIcon, Box, Group, Skeleton, Table, Text } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import moment from "moment";
import {
  Dispatch,
  Fragment,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import { TbDownload, TbEye, TbClipboard } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileMetaData } from "../../types/File.type";
import { Share, ShareCollectionContribution } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import TableSortIcon, { TableSort } from "../core/SortIcon";
import showFilePreviewModal from "./modals/showFilePreviewModal";
import { HoverTip } from "../core/HoverTip";
import api from "../../services/api.service";

// Geometry of one row's action buttons, used to derive the actions column's
// width below. Kept next to each other so they stay in sync with the
// ActionIcon `size` and the <Group> spacing actually used in the render.
const ACTION_ICON_SIZE = 25;
const ACTION_ICON_GAP = 16; // <Group>'s default "md" spacing
const CELL_PADDING = 10; // Mantine's Table cell padding, per side

// How many action buttons a given file's row will render — mirrors the
// conditionals in the actions cell exactly (download is unconditional
// unless the share is a locked paywall, the clipboard and preview ones
// depend on the file type).
const countActionIcons = (file: FileMetaData, isLocked: boolean) =>
  (isLocked ? 0 : 1) +
  (shareService.isShareTextFile(file.name) ? 1 : 0) +
  (shareService.doesFileSupportPreview(file.name) ? 1 : 0);

const actionsColumnWidth = (iconCount: number) =>
  iconCount * ACTION_ICON_SIZE +
  Math.max(0, iconCount - 1) * ACTION_ICON_GAP +
  2 * CELL_PADDING;

const renderFileName = (name: string) => {
  const parts = name.split("/");
  if (parts.length === 1) return name;
  const fileName = parts.pop();
  const folderPath = parts.join("/");
  return (
    <span>
      <span style={{ opacity: 0.5 }}>{folderPath}/</span>
      <span style={{ fontWeight: 600 }}>{fileName}</span>
    </span>
  );
};

type FileGroup = {
  key: string;
  header: ReactNode | null;
  files: FileMetaData[];
};

// Partitions `files` into contribution-labelled groups when `contributions`
// is provided (a collection — see ShareController.buildCollectionState()),
// preserving each file's position from the array it was handed — so
// sorting by name/size (sortFiles below, which reorders that same array)
// still sorts within each group instead of fighting the grouping, with no
// extra logic needed here. `contributions` undefined is the plain,
// ungrouped case every other transfer uses: one group, no header, the
// exact rendering this had before grouping existed.
const buildGroups = (
  files: FileMetaData[],
  contributions: ShareCollectionContribution[] | undefined,
  anonymousLabel: string,
): FileGroup[] => {
  if (!contributions) return [{ key: "all", header: null, files }];

  const groups = contributions
    .map((contribution) => ({
      key: contribution.id,
      header: (
        <FormattedMessage
          id="share.collection.contributed-by"
          values={{
            count: files.filter(
              (file) => file.contributionId === contribution.id,
            ).length,
            name: contribution.name || anonymousLabel,
            date: moment(contribution.createdAt).format("LL"),
          }}
        />
      ),
      files: files.filter((file) => file.contributionId === contribution.id),
    }))
    .filter((group) => group.files.length > 0);

  // Files with no contribution at all: predate the column, or were
  // uploaded directly by the collection's own owner through the ordinary
  // route (FileDTO.contributionId's own comment) rather than a deposit.
  // Never silently dropped — they get their own fallback group instead.
  const unattributed = files.filter((file) => !file.contributionId);
  if (unattributed.length > 0) {
    groups.push({
      key: "unattributed",
      header: <FormattedMessage id="share.collection.anonymous" />,
      files: unattributed,
    });
  }

  return groups;
};

const FileList = ({
  files,
  setShare,
  share,
  isLoading,
  recipientId,
  contributions,
}: {
  files?: FileMetaData[];
  setShare: Dispatch<SetStateAction<Share | undefined>>;
  share: Share;
  isLoading: boolean;
  recipientId?: string;
  // Present only for a collection's page — see the page that renders this
  // (share/[shareId]/index.tsx). Grouping is entirely additive: omitted,
  // this renders exactly the same flat list every other transfer gets.
  contributions?: ShareCollectionContribution[];
}) => {
  const clipboard = useClipboard();
  const modals = useModals();
  const t = useTranslate();

  const [sort, setSort] = useState<TableSort>({
    property: "name",
    direction: "desc",
  });

  const sortFiles = () => {
    if (files && sort.property) {
      const sortedFiles = files.sort((a: any, b: any) => {
        if (sort.direction === "asc") {
          return b[sort.property!].localeCompare(a[sort.property!], undefined, {
            numeric: true,
          });
        } else {
          return a[sort.property!].localeCompare(b[sort.property!], undefined, {
            numeric: true,
          });
        }
      });

      setShare({
        ...share,
        files: sortedFiles,
      });
    }
  };

  useEffect(sortFiles, [sort]);

  // One width for the whole actions column (a table column can only have
  // one — that's what keeps every column vertically aligned), but derived
  // from the most buttons any row in *this* share actually renders rather
  // than a hardcoded worst case. So a share of plain, non-previewable
  // binaries reserves room for 1 button, and only one containing a text
  // file (which adds the copy-contents button, on top of the preview one
  // text also qualifies for) reserves room for 3 — no dead space either
  // way, and whatever isn't reserved goes to the name column, since that's
  // the one with `width: auto` under table-layout: fixed.
  // The per-file download icon follows the same condition as index.tsx's
  // own download buttons — priced and not yet paid for. Preview stays: the
  // thumbnail it's built on isn't behind the paywall either (no
  // @RequiresPayment() on GET .../thumbnail), and seeing what's on offer is
  // the point.
  //
  // `share?.` rather than `share.`: the page passes `share!` while it's
  // still loading (isLoading true, share genuinely undefined — that `!` is
  // only a compile-time promise, not a runtime one), and this line runs on
  // every render regardless of isLoading.
  const isLocked = !!share?.priceCents && !share?.isPaidForViewer;

  const maxActionIcons =
    files && files.length > 0
      ? Math.max(...files.map((file) => countActionIcons(file, isLocked)))
      : 3;

  return (
    <Box sx={{ display: "block", overflowX: "auto" }}>
      {/* table-layout: fixed so the size/actions columns keep exactly the
          widths set below and the name column absorbs the remainder —
          under the default auto layout a long file name would instead grow
          the name column and squeeze the other two, wrapping their header's
          sort icon onto its own line and, at the extreme, clipping the last
          action button past the card's edge. The name column's own overflow
          then wraps onto extra lines (see the name cell) rather than
          widening the table or truncating the name away. */}
      <Table style={{ tableLayout: "fixed", width: "100%" }}>
        <thead>
          <tr>
            <th>
              <Group spacing="xs" noWrap>
                <FormattedMessage id="share.table.name" />
                <TableSortIcon
                  sort={sort}
                  setSort={setSort}
                  property="name"
                  label={t("share.table.name")}
                />
              </Group>
            </th>
            {/* Left-aligned like "Nom": 90px is this column's real minimum
                ("Taille" ≈ 35px + the Group's 10px gap + the sort icon's
                18px + 10px padding per side), so right-aligning the values
                inside it would only stagger them against the header rather
                than tidy anything up. */}
            <th style={{ width: 90 }}>
              <Group spacing="xs" noWrap>
                <FormattedMessage id="share.table.size" />
                <TableSortIcon
                  sort={sort}
                  setSort={setSort}
                  property="size"
                  label={t("share.table.size")}
                />
              </Group>
            </th>
            <th style={{ width: actionsColumnWidth(maxActionIcons) }}></th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? skeletonRows
            : buildGroups(
                files!,
                contributions,
                t("share.collection.anonymous"),
              ).map((group) => (
                <Fragment key={group.key}>
                  {group.header && (
                    <tr>
                      <td
                        colSpan={3}
                        style={{ paddingTop: 16, paddingBottom: 4 }}
                      >
                        <Text size="sm" weight={600} color="dimmed">
                          {group.header}
                        </Text>
                      </td>
                    </tr>
                  )}
                  {group.files.map((file) => (
                    <tr key={file.id}>
                      <td
                        style={{
                          whiteSpace: "normal",
                          overflowWrap: "break-word",
                          verticalAlign: "top",
                        }}
                      >
                        {file.thumbnailStatus === "ready" ? (
                          <Group spacing="xs" noWrap>
                            <img
                              src={shareService.getThumbnailUrl(
                                share.id,
                                file.id,
                                recipientId,
                              )}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                              style={{
                                width: 48,
                                height: 32,
                                objectFit: "cover",
                                borderRadius: 6,
                                flexShrink: 0,
                              }}
                            />
                            {renderFileName(file.name)}
                          </Group>
                        ) : (
                          renderFileName(file.name)
                        )}
                      </td>
                      <td
                        style={{ whiteSpace: "nowrap", verticalAlign: "top" }}
                      >
                        {byteToHumanSizeString(parseInt(file.size))}
                      </td>
                      <td
                        style={{ whiteSpace: "nowrap", verticalAlign: "top" }}
                      >
                        <Group position="right" noWrap>
                          {/* Masqué avec les téléchargements, et non avec
                                les prévisualisations : ce bouton lit la route
                                d'octets, celle que le garde ferme derrière le
                                paiement. Laissé visible, il rendrait 403 sans
                                rien dire — le `.then` plus bas n'a pas de
                                `.catch` — et pour un fichier texte, il
                                livrerait le contenu entier s'il marchait.
                                On voit ce qu'on achète, on ne l'emporte
                                pas. */}
                          {!isLocked &&
                            shareService.isShareTextFile(file.name) && (
                              <HoverTip label={t("share.copy-text-contents")}>
                                <ActionIcon
                                  color="blue"
                                  variant="light"
                                  size={ACTION_ICON_SIZE}
                                  aria-label={t("share.copy-text-contents")}
                                  onClick={() => {
                                    api
                                      .get(
                                        `/shares/${share.id}/files/${file.id}?download=false`,
                                      )
                                      .then((res) => {
                                        if (window.isSecureContext) {
                                          clipboard.copy(res.data);
                                          toast.success(
                                            t("share.notify.copied-contents"),
                                          );
                                        } else {
                                          toast.error(
                                            t(
                                              "share.notify.copy-not-supported",
                                            ),
                                          );
                                        }
                                      });
                                  }}
                                >
                                  <TbClipboard />
                                </ActionIcon>
                              </HoverTip>
                            )}
                          {shareService.doesFileSupportPreview(file.name) && (
                            <HoverTip label={t("common.button.preview")}>
                              <ActionIcon
                                color="green"
                                variant="light"
                                size={ACTION_ICON_SIZE}
                                aria-label={t("common.button.preview")}
                                onClick={() =>
                                  showFilePreviewModal(share.id, file, modals)
                                }
                              >
                                <TbEye />
                              </ActionIcon>
                            </HoverTip>
                          )}
                          {!isLocked && (
                            <HoverTip label={t("common.button.download")}>
                              <ActionIcon
                                color="cyan"
                                variant="light"
                                size={ACTION_ICON_SIZE}
                                aria-label={t("common.button.download")}
                                onClick={async () => {
                                  await shareService.downloadFile(
                                    share.id,
                                    file.id,
                                    recipientId,
                                  );
                                }}
                              >
                                <TbDownload />
                              </ActionIcon>
                            </HoverTip>
                          )}
                        </Group>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
        </tbody>
      </Table>
    </Box>
  );
};

// Three cells, matching the real rows' name/size/actions columns —
// table-layout: fixed assigns widths by index, so a mismatched cell count
// would visibly misalign the skeleton against the header above it.
const skeletonRows = [...Array(5)].map((c, i) => (
  <tr key={i}>
    <td>
      <Skeleton height={14} />
    </td>
    <td>
      <Skeleton height={14} width={70} />
    </td>
    <td>
      <Skeleton height={25} width={25} ml="auto" />
    </td>
  </tr>
));

export default FileList;
