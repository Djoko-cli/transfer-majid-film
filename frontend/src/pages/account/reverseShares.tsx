import {
  ActionIcon,
  Button,
  Center,
  Group,
  MantineProvider,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import moment from "moment";
import { useEffect, useState } from "react";
import {
  TbExternalLink,
  TbInfoCircle,
  TbLink,
  TbPlus,
  TbTrash,
} from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import showReverseShareLinkModal from "../../components/account/showReverseShareLinkModal";
import { HoverTip } from "../../components/core/HoverTip";
import CenterLoader from "../../components/core/CenterLoader";
import GlassPageBackdrop from "../../components/core/GlassPageBackdrop";
import showCreateReverseShareModal from "../../components/share/modals/showCreateReverseShareModal";
import glassFormTheme from "../../components/upload/glassFormTheme";
import { glassModalStyles } from "../../components/upload/glassModalTheme";
import useConfig from "../../hooks/config.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyReverseShare } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";

const MyShares = () => {
  const modals = useModals();
  const clipboard = useClipboard();
  const t = useTranslate();

  const config = useConfig();
  const { user } = useUser();
  const appUrl = config.get("general.appUrl");
  const defaultAppUrl = config.get("general.appUrl", true);

  const userMaxShareSize = user?.shareSizeLimit
    ? parseInt(user.shareSizeLimit)
    : parseInt(config.get("share.maxSize"));

  const [reverseShares, setReverseShares] = useState<MyReverseShare[]>();

  const getReverseShares = () => {
    shareService
      .getMyReverseShares()
      .then((shares) => setReverseShares(shares));
  };

  useEffect(() => {
    getReverseShares();
  }, []);

  if (!reverseShares) return <CenterLoader />;

  // window.location.origin only ever read here, after the loading guard
  // above — this component still renders server-side while reverseShares
  // is undefined, and `window` doesn't exist there.
  const linkOrigin =
    appUrl !== defaultAppUrl ? appUrl : window.location.origin;

  const copyLink = (token: string) => {
    if (window.isSecureContext) {
      clipboard.copy(`${linkOrigin}/s/${token}`);
      toast.success(t("common.notify.copied-link"));
    } else {
      showReverseShareLinkModal(modals, token, appUrl, defaultAppUrl);
    }
  };

  return (
    <>
      <Meta title={t("account.reverseShares.title")} />
      <GlassPageBackdrop />
      <Group position="apart" align="baseline" mt="xl" mb={20}>
        <Group align="center" spacing={3} mb={30}>
          <Title order={2}>
            <FormattedMessage id="account.reverseShares.title" />
          </Title>
          <HoverTip label={t("account.reverseShares.description")}>
            <ActionIcon color="blue">
              <TbInfoCircle />
            </ActionIcon>
          </HoverTip>
        </Group>
        {config.get("share.enableReverseShares") ? (
          <Button
            onClick={() =>
              showCreateReverseShareModal(
                modals,
                config.get("smtp.enabled"),
                user?.isAdmin || user?.canCreatePermanentShares
                  ? { value: 0, unit: "days" }
                  : config.get("share.maxExpiration"),
                config.get("share.defaultExpiration"),
                appUrl,
                defaultAppUrl,
                userMaxShareSize,
                getReverseShares,
                config.get("share.shareIdLength"),
              )
            }
            leftIcon={<TbPlus size={20} />}
          >
            <FormattedMessage id="common.button.create" />
          </Button>
        ) : (
          <Text
            color="dimmed"
            size="sm"
            sx={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <TbInfoCircle />
            <FormattedMessage id="account.reverseShares.disabled-notice" />
          </Text>
        )}
      </Group>
      {reverseShares.length == 0 ? (
        <Center style={{ height: "70vh" }}>
          <Stack align="center" spacing={10}>
            <Title order={2}>
              <FormattedMessage id="account.reverseShares.title.empty" />
            </Title>
            <Text>
              <FormattedMessage id="account.reverseShares.description.empty" />
            </Text>
          </Stack>
        </Center>
      ) : (
        <MantineProvider inherit theme={glassFormTheme}>
          <Paper withBorder p="md" sx={{ overflowX: "auto" }}>
            <Table>
              <thead>
                <tr>
                  <th>
                    <FormattedMessage id="account.reverseShares.table.name" />
                  </th>
                  <th>
                    <FormattedMessage id="account.reverseShares.table.contributors" />
                  </th>
                  <th>
                    <FormattedMessage id="account.reverseShares.table.files" />
                  </th>
                  <th>
                    <FormattedMessage id="account.reverseShares.table.state" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reverseShares.map((reverseShare) => {
                  const link = `${linkOrigin}/s/${reverseShare.token}`;
                  const isOpen =
                    moment(reverseShare.collectionEndsAt).isAfter(moment());
                  const contributorNames = reverseShare.contributorNames.map(
                    (name) => name || t("share.collection.anonymous"),
                  );

                  return (
                    <tr key={reverseShare.id}>
                      <td style={{ maxWidth: 200 }}>
                        <Group spacing={4} noWrap>
                          <Text
                            maw={160}
                            truncate
                            color={reverseShare.name ? undefined : "dimmed"}
                          >
                            {reverseShare.name || "—"}
                          </Text>
                          {reverseShare.description && (
                            <HoverTip label={reverseShare.description}>
                              <ActionIcon size={18}>
                                <TbInfoCircle size={14} />
                              </ActionIcon>
                            </HoverTip>
                          )}
                        </Group>
                        <Text size="xs" color="dimmed" maw={200} truncate>
                          {link}
                        </Text>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {reverseShare.contributionsCount == 0 ? (
                          <Text color="dimmed" size="sm">
                            <FormattedMessage id="account.reverseShares.table.contributors.none" />
                          </Text>
                        ) : (
                          <>
                            <Text size="sm">
                              {reverseShare.contributionsCount == 1
                                ? `1 ${t(
                                    "account.reverseShares.table.contributors.singular",
                                  )}`
                                : `${reverseShare.contributionsCount} ${t(
                                    "account.reverseShares.table.contributors.plural",
                                  )}`}
                            </Text>
                            <Text size="xs" color="dimmed" maw={200} truncate>
                              {contributorNames.join(", ")}
                            </Text>
                          </>
                        )}
                      </td>
                      <td>
                        <Text size="sm">
                          {reverseShare.filesCount == 1
                            ? `1 ${t(
                                "account.reverseShares.table.files.singular",
                              )}`
                            : `${reverseShare.filesCount} ${t(
                                "account.reverseShares.table.files.plural",
                              )}`}
                        </Text>
                        <Text size="xs" color="dimmed">
                          {byteToHumanSizeString(reverseShare.totalSize)}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm">
                          {isOpen
                            ? t("account.reverseShares.table.state.open", {
                                date: moment(
                                  reverseShare.collectionEndsAt,
                                ).format("LLL"),
                              })
                            : t("account.reverseShares.table.state.closed", {
                                date: moment(
                                  reverseShare.containerExpiresAt,
                                ).format("LLL"),
                              })}
                        </Text>
                      </td>
                      <td>
                        <Group position="right" noWrap>
                          <HoverTip
                            label={t("account.reverseShares.table.open-album")}
                          >
                            <ActionIcon
                              component="a"
                              href={link}
                              target="_blank"
                              variant="light"
                              size={25}
                            >
                              <TbExternalLink />
                            </ActionIcon>
                          </HoverTip>
                          <HoverTip label={t("common.button.copy-link")}>
                            <ActionIcon
                              variant="light"
                              size={25}
                              onClick={() => copyLink(reverseShare.token)}
                            >
                              <TbLink />
                            </ActionIcon>
                          </HoverTip>
                          <HoverTip label={t("common.button.delete")}>
                            <ActionIcon
                              color="red"
                              variant="light"
                              size={25}
                              onClick={() => {
                                modals.openConfirmModal({
                                  title: t(
                                    "account.reverseShares.modal.delete.title",
                                  ),
                                  styles: glassModalStyles,
                                  children: (
                                    <Text size="sm">
                                      <FormattedMessage id="account.reverseShares.modal.delete.description" />
                                    </Text>
                                  ),
                                  confirmProps: {
                                    color: "red",
                                  },
                                  labels: {
                                    confirm: t("common.button.delete"),
                                    cancel: t("common.button.cancel"),
                                  },
                                  onConfirm: () => {
                                    shareService
                                      .removeReverseShare(reverseShare.id)
                                      .then(() =>
                                        setReverseShares(
                                          reverseShares.filter(
                                            (item) =>
                                              item.id !== reverseShare.id,
                                          ),
                                        ),
                                      )
                                      .catch(toast.axiosError);
                                  },
                                });
                              }}
                            >
                              <TbTrash />
                            </ActionIcon>
                          </HoverTip>
                        </Group>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Paper>
        </MantineProvider>
      )}
    </>
  );
};

export default MyShares;
