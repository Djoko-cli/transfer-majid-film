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
import { FormattedMessage, useIntl } from "react-intl";
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
import showEmailVerificationModal from "../../../components/upload/modals/showEmailVerificationModal";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import useUser from "../../../hooks/user.hook";
import shareService from "../../../services/share.service";
import { useSubmitButtonStyles } from "../../../components/core/submitButtonStyles";
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
  const intl = useIntl();
  const { classes: shimmer } = useSubmitButtonStyles();
  const [share, setShare] = useState<ShareType>();
  const [isRestricted, setIsRestricted] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const { user } = useUser();
  const config = useConfig();
  const t = useTranslate();

  const isOwner = !!user && !!share && share.creator?.id === user.id;
  const recipientId = getQueryString(router.query.recipient);
  // Step 2 of task 11: the true gate is shareSecurity.guard.ts, this is only
  // what decides which buttons this page shows.
  const isLocked = !!share?.priceCents && !share?.isPaidForViewer;

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

  // Rend le transfert rechargé, et non plus rien : deux appelants ont besoin
  // de savoir ce que le serveur a répondu — le retour de Stripe et « J'ai
  // déjà payé ». Sans ça, ils ne peuvent que recharger et espérer.
  const getFiles = async () => {
    return shareService
      .get(shareId)
      .then((share) => {
        setShare(share);
        return share;
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

  // Step 4: the return trip from Stripe Checkout. success_url carries
  // ?payment=<session id> (payment.service.ts's createSession) — task 8's
  // /confirm route turns that into a verdict without needing a share
  // token, which is exactly what makes step 5 (a return from a different
  // browser, with no token at all) work too.
  useEffect(() => {
    const sessionId = getQueryString(router.query.payment);
    if (!sessionId) return;

    // Stripped right away, before the response comes back: a reload while
    // confirmation is in flight must not resubmit the same session id, and
    // Stripe won't hand it back a second time once we've left this URL.
    const query = { ...router.query };
    delete query.payment;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });

    const enAttente = () =>
      // Volontairement persistant : un bandeau vert de quatre secondes sur
      // une page dont l'argent vient de partir, et qui affiche encore le mur,
      // se rate. Celui-ci reste jusqu'à ce qu'on le ferme.
      toast.success(t("share.payment.pending"), {
        autoClose: false,
        title: t("share.payment.pending.title"),
      });

    shareService
      .confirmPayment(shareId, sessionId)
      .then(({ paid }) => {
        if (paid) getFiles();
        // Pas une erreur sèche : l'argent est parti, et « pas encore
        // confirmé » (le webhook n'a pas atterri) n'est pas un échec sur une
        // page où quelqu'un vient de payer.
        else enAttente();
      })
      .catch((e) => {
        // Un 400 veut dire que ce paramètre ne désigne rien qui nous
        // concerne — session inconnue, ou appartenant à un autre transfert.
        // On se tait : rassurer sur un paiement à quelqu'un qui n'a rien payé
        // serait pire que ne rien dire, et n'importe qui peut fabriquer un
        // `?payment=` et l'envoyer à n'importe qui.
        if (e?.response?.status === 400) return;
        enAttente();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.payment]);

  const handleUnlock = async () => {
    setIsStartingCheckout(true);
    try {
      const { url } = await shareService.createPaymentSession(shareId);
      // No new tab: Stripe's own redirect back has to land in this same
      // page (the ?payment= handling above), not a tab the visitor may
      // have already closed.
      window.location.href = url;
    } catch (e) {
      setIsStartingCheckout(false);
      toast.axiosError(e);
    }
  };

  // Step 5: paid, but from a browser with no proven address yet (a
  // different device, or this one after the cookie was cleared).
  // showEmailVerificationModal does the OTP round trip; once it resolves,
  // re-fetching the share is what actually finds the payment, since
  // GET /shares/:id now carries the freshly-proven email as a cookie.
  const handleAlreadyPaid = () => {
    showEmailVerificationModal(
      modals,
      async () => {
        const rafraichi = await getFiles();

        // Prouver une adresse qui n'a pas payé rechargeait la même page
        // verrouillée, sans un mot : le visiteur en concluait que le site est
        // cassé, alors qu'il s'est simplement trompé d'adresse.
        if (rafraichi?.priceCents && !rafraichi.isPaidForViewer)
          // Persistant, comme le message d'attente : il demande au visiteur
          // de vérifier quelque chose, et un bandeau de quatre secondes sur
          // une page qui n'a visiblement pas changé se rate.
          toast.error(t("share.payment.no-payment-for-address"), {
            autoClose: false,
          });
      },
      undefined,
      "share.payment.verify.description",
    );
  };

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
              {/* Never for a collection — the second door onto the same
                  edit page "Mes transferts" also used to offer, and the
                  same reason to close it: that page's save() begins by
                  unlocking the transfert, which for a container means
                  making the transfer invisible and then letting the
                  unfinished-shares cron delete it. The server refuses it
                  outright (ShareService.revertComplete); this keeps the
                  owner from being offered a button that can only fail. */}
              {isOwner && !share?.isCollection && (
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
            // Step 2 of task 11: sells the way in instead of offering the
            // download buttons at all. share.priceCents/isPaidForViewer
            // come from the server (ShareController.get()) — never
            // computed here, see isLocked's own comment above.
          }
          {isLocked && (
            <Stack spacing="xs" mb="lg">
              <Button
                fullWidth
                size="md"
                loading={isStartingCheckout}
                onClick={handleUnlock}
                // Le même scintillement que « Obtenir un lien » côté envoi :
                // c'est l'action principale de cet écran, et la seule qui
                // demande une décision. Retiré pendant l'aller chez Stripe —
                // un bouton qui scintille en chargeant dit deux choses
                // contradictoires.
                className={isStartingCheckout ? undefined : shimmer.ready}
              >
                <FormattedMessage
                  id="share.payment.unlock"
                  values={{
                    price: intl.formatNumber((share?.priceCents ?? 0) / 100, {
                      style: "currency",
                      currency: "EUR",
                    }),
                  }}
                />
              </Button>
              <Button
                fullWidth
                variant="subtle"
                size="sm"
                onClick={handleAlreadyPaid}
              >
                <FormattedMessage id="share.payment.already-paid" />
              </Button>
            </Stack>
          )}

          {
            // A primary, unconditional download action — previously this
            // only appeared (as DownloadAllButton) for shares with more
            // than one file, so the common single-file case left the
            // recipient with nothing but a 25px row icon to find. A single
            // file downloads directly rather than through the zip
            // pipeline, so it doesn't wait on isZipReady either.
          }
          {!isLocked && share?.files?.length === 1 && (
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
          {!isLocked && share?.files?.length > 1 && (
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

          {
            // Skipped entirely when there is nothing to list. Only a
            // collection can be empty — a direct transfer always has at
            // least one file — and while it was, this printed its "Nom /
            // Taille" header with no rows beneath it, directly above the
            // deposit form: two sets of column headings on one page, the
            // top one belonging to a table that wasn't there. The
            // skeleton still shows while `share` is loading, because then
            // the count isn't known yet.
            (!share || share.files.length > 0) && (
              <FileList
                files={share?.files}
                setShare={setShare}
                share={share!}
                isLoading={!share}
                recipientId={recipientId}
                contributions={share?.collection?.contributions}
              />
            )
          }

          {
            // The deposit, appended to the transfer's own page rather than a
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
