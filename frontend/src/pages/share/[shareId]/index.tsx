import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  MantineProvider,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import moment from "moment";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import { TbDownload, TbEdit, TbFiles, TbLink } from "react-icons/tb";
import Meta from "../../../components/Meta";
import showShareLinkModal from "../../../components/account/showShareLinkModal";
import CollectionDropzone from "../../../components/share/CollectionDropzone";
import DownloadAllButton from "../../../components/share/DownloadAllButton";
import FileList from "../../../components/share/FileList";
import showEnterPasswordModal from "../../../components/share/showEnterPasswordModal";
import showErrorModal from "../../../components/share/showErrorModal";
import showShareInformationsModal from "../../../components/share/showShareInformationsModal";
import glassFormTheme from "../../../components/upload/glassFormTheme";
import SplitTransferLayout from "../../../components/upload/SplitTransferLayout";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import useUser from "../../../hooks/user.hook";
import shareService from "../../../services/share.service";
import { MyShare, Share as ShareType } from "../../../types/share.type";
import toast from "../../../utils/toast.util";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import { getQueryString } from "../../../utils/router.util";
import { HoverTip } from "../../../components/core/HoverTip";

// Wider than the upload card (440) — a file table with a name column plus
// up to 3 action icons per row needs more room than a form does before it
// starts feeling cramped.
const CARD_WIDTH = 640;

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { shareId: context.params!.shareId },
  };
}

const Share = ({ shareId }: { shareId: string }) => {
  const clipboard = useClipboard();
  const modals = useModals();
  const router = useRouter();
  const [share, setShare] = useState<ShareType>();
  const [isRestricted, setIsRestricted] = useState(false);
  const { user } = useUser();
  const config = useConfig();
  const t = useTranslate();

  const isOwner = !!user && !!share && share.creator?.id === user.id;
  const recipientId = getQueryString(router.query.recipient);

  const handleEditClick = async () => {
    try {
      const myShares = await shareService.getMyShares();
      const myShare = myShares.find((s) => s.id === shareId);
      // The modal edits a MyShare, and GET /shares only returns the ones
      // this account created and that are still live. Nothing here can
      // conjure the rest, so say so instead of returning in silence — a
      // button that does nothing at all is read as a broken app, and this
      // one was. Reachable now only for a share of one's own that has
      // expired since the page was opened; the button is otherwise shown
      // only to the creator.
      if (!myShare) {
        toast.error(t("share.edit.notify.generic-error"));
        return;
      }
      showShareInformationsModal(
        modals,
        myShare,
        parseInt(config.get("share.maxSize")),
        config.get("general.appUrl"),
        config.get("general.appUrl", true),
        user?.isAdmin || user?.canCreatePermanentShares
          ? { value: 0, unit: "days" }
          : config.get("share.maxExpiration"),
        (updatedShare: MyShare) => {
          setShare((prev) =>
            prev
              ? {
                  ...prev,
                  name: updatedShare.name,
                  description: updatedShare.description,
                  expiration: updatedShare.expiration,
                  hasPassword:
                    updatedShare.security?.passwordProtected ??
                    prev.hasPassword,
                }
              : prev,
          );
        },
        true,
      );
    } catch (e) {
      toast.axiosError(e);
    }
  };

  const getShareToken = async (password?: string) => {
    await shareService
      .getShareToken(shareId, password)
      .then(() => {
        modals.closeAll();
        getFiles();
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (error == "share_max_views_exceeded") {
          showErrorModal(
            modals,
            t("share.error.visitor-limit-exceeded.title"),
            t("share.error.visitor-limit-exceeded.description"),
            "go-home",
          );
        } else if (error == "share_password_required") {
          showEnterPasswordModal(modals, getShareToken);
        } else {
          toast.axiosError(e);
        }
      });
  };

  const getFiles = async () => {
    shareService
      .get(shareId)
      .then((share) => {
        setShare(share);
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (e.response.status == 404) {
          if (error == "share_removed") {
            showErrorModal(
              modals,
              t("share.error.removed.title"),
              e.response.data.message,
              "go-home",
            );
          } else {
            showErrorModal(
              modals,
              t("share.error.not-found.title"),
              t("share.error.not-found.description"),
              "go-home",
            );
          }
        } else if (
          e.response.status == 403 &&
          error == "share_restricted_to_recipients"
        ) {
          setIsRestricted(true);
        } else if (error == "share_password_required") {
          showEnterPasswordModal(modals, getShareToken);
        } else if (error == "share_token_required") {
          getShareToken();
        } else {
          showErrorModal(
            modals,
            t("common.error"),
            t("common.error.unknown"),
            "go-home",
          );
        }
      });
  };

  useEffect(() => {
    getFiles();
  }, []);

  if (isRestricted) {
    return (
      <SplitTransferLayout width={CARD_WIDTH}>
        <MantineProvider inherit theme={glassFormTheme}>
          <Center>
            <Stack align="center" spacing="md">
              <Title order={2}>
                <FormattedMessage id="share.error.restricted.title" />
              </Title>
              <Text color="dimmed" align="center">
                <FormattedMessage id="share.error.restricted.description" />
              </Text>
              <Button
                component={Link}
                href={`/auth/signIn?redirect=/share/${shareId}`}
              >
                <FormattedMessage id="share.error.restricted.button" />
              </Button>
            </Stack>
          </Center>
        </MantineProvider>
      </SplitTransferLayout>
    );
  }

  return (
    <>
      <Meta
        title={t("share.title", { shareId: share?.name || shareId })}
        description={t("share.description")}
      />

      <SplitTransferLayout width={CARD_WIDTH}>
        <MantineProvider inherit theme={glassFormTheme}>
          <Group position="apart" mb="lg" noWrap align="flex-start">
            <Box style={{ minWidth: 0 }}>
              <Title order={2}>{share?.name || share?.id}</Title>
              <Text size="sm">{share?.description}</Text>
              {share?.files?.length > 0 && (
                <Text size="sm" color="dimmed" mt={5}>
                  <FormattedMessage
                    id="share.fileCount"
                    values={{
                      count: share?.files?.length || 0,
                      size: byteToHumanSizeString(
                        share?.files?.reduce(
                          (total: number, file: { size: string }) =>
                            total + parseInt(file.size),
                          0,
                        ) || 0,
                      ),
                    }}
                  />
                </Text>
              )}
              {
                // The recipient — the actual point of this page — previously
                // had no way to know when their link stops working.
                share?.expiration &&
                  (moment(share.expiration).unix() === 0 ? (
                    <Text size="sm" color="dimmed">
                      <FormattedMessage id="upload.modal.completed.never-expires" />
                    </Text>
                  ) : (
                    <Text size="sm" color="dimmed">
                      <FormattedMessage
                        id="upload.modal.completed.expires-on"
                        values={{
                          expiration: moment(share.expiration).format("LLL"),
                        }}
                      />
                    </Text>
                  ))
              }
            </Box>

            <Group spacing="xs" noWrap>
              {/* Not gated on isOwner: forwarding the link is the
                  recipient's need, not the owner's. And the canonical link
                  rather than window.location.href — the current URL can
                  carry a ?recipient= that a recipient would then hand on as
                  their own. */}
              <HoverTip label={t("common.button.copy-link")}>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label={t("common.button.copy-link")}
                  onClick={() => {
                    const appUrl =
                      config.get("general.appUrl") !==
                      config.get("general.appUrl", true)
                        ? config.get("general.appUrl")
                        : window.location.origin;

                    if (window.isSecureContext) {
                      clipboard.copy(`${appUrl}/s/${shareId}`);
                      toast.success(t("common.notify.copied-link"));
                    } else {
                      showShareLinkModal(
                        modals,
                        shareId,
                        config.get("general.appUrl"),
                        config.get("general.appUrl", true),
                      );
                    }
                  }}
                >
                  <TbLink />
                </ActionIcon>
              </HoverTip>
              {isOwner && (
                <HoverTip label={t("account.shares.button.edit")}>
                  <ActionIcon
                    component={Link}
                    href={`/share/${shareId}/edit`}
                    variant="light"
                    color="orange"
                    size="lg"
                    aria-label={t("account.shares.button.edit")}
                  >
                    <TbFiles />
                  </ActionIcon>
                </HoverTip>
              )}
              {/* The creator, not merely an admin. The modal is filled
                  from GET /shares, which returns only what this account
                  created — so for an admin looking at anyone else's
                  transfer, and for every transfer sent through a file
                  request (those have no creator at all), the lookup
                  could never find anything and the click did nothing.
                  The sibling button above has always been gated this
                  way; the two now agree. Managing someone else's
                  transfer belongs in the admin console, which has this
                  same modal. */}
              {isOwner && (
                <HoverTip label={t("share.button.edit-details")}>
                  <ActionIcon
                    variant="light"
                    color="blue"
                    size="lg"
                    onClick={handleEditClick}
                    aria-label={t("share.button.edit-details")}
                  >
                    <TbEdit />
                  </ActionIcon>
                </HoverTip>
              )}
            </Group>
          </Group>

          {
            // A primary, unconditional download action — previously this
            // only appeared (as DownloadAllButton) for shares with more
            // than one file, so the common single-file case left the
            // recipient with nothing but a 25px row icon to find. A single
            // file downloads directly rather than through the zip
            // pipeline, so it doesn't wait on isZipReady either.
          }
          {share?.files?.length === 1 && (
            <Button
              fullWidth
              size="md"
              mb="lg"
              leftIcon={<TbDownload />}
              onClick={() =>
                shareService.downloadFile(
                  shareId,
                  share.files[0].id,
                  recipientId,
                )
              }
            >
              <FormattedMessage id="common.button.download" />
            </Button>
          )}
          {share?.files?.length > 1 && (
            <Box mb="lg">
              <DownloadAllButton
                shareId={shareId}
                recipientId={recipientId}
                fullWidth
                size="md"
                totalSize={share?.size}
              />
            </Box>
          )}

          <FileList
            files={share?.files}
            setShare={setShare}
            share={share!}
            isLoading={!share}
            recipientId={recipientId}
            contributions={share?.collection?.contributions}
          />

          {
            // The deposit, appended to the album's own page rather than a
            // page of its own — see docs/collecte-conteneur-unique.md §5.
            // Held back until `share` has actually loaded: isOpen/endsAt
            // would otherwise read as "closed" for the one render before
            // the real collection state arrives.
            share?.isCollection && share.collection && (
              <CollectionDropzone
                shareId={shareId}
                isOpen={share.collection.isOpen}
                endsAt={share.collection.endsAt}
                maxShareSize={parseInt(config.get("share.maxSize"))}
                onDeposited={getFiles}
              />
            )
          }
        </MantineProvider>
      </SplitTransferLayout>
    </>
  );
};

export default Share;
