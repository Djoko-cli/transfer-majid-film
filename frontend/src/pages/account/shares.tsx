import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  MantineProvider,
  Menu,
  Paper,
  useMantineTheme,
  Group,
  Space,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useClipboard, useMediaQuery } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import moment from "moment";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  TbPlusMinus,
  TbDotsVertical,
  TbInfoCircle,
  TbLink,
  TbLock,
  TbTrash,
  TbUsers,
} from "react-icons/tb";
import { FaUserLock } from "react-icons/fa";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import showShareInformationsModal from "../../components/share/showShareInformationsModal";
import showShareLinkModal from "../../components/account/showShareLinkModal";
import { HoverTip } from "../../components/core/HoverTip";
import CenterLoader from "../../components/core/CenterLoader";
import GlassPageBackdrop from "../../components/core/GlassPageBackdrop";
import glassFormTheme from "../../components/upload/glassFormTheme";
import { glassModalStyles } from "../../components/upload/glassModalTheme";
import useConfig from "../../hooks/config.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare } from "../../types/share.type";
import toast from "../../utils/toast.util";

const MyShares = () => {
  const modals = useModals();
  const clipboard = useClipboard();
  const config = useConfig();
  const { user } = useUser();
  const t = useTranslate();
  const theme = useMantineTheme();
  // Drives both the ID/Visiteurs column hiding and the shorter date format
  // below — on a real phone (measured on iPhone 14 Pro) the full table
  // needed a few px of horizontal scroll to see the actions column at all,
  // because 5 unconstrained columns plus 4 action icons simply don't fit
  // in ~340px of usable width. ID and Visiteurs are the two least useful
  // at a glance on mobile — both are one tap away via the info icon —
  // so hiding them buys Nom (the column that actually needs room to wrap
  // legibly) the space the others were taking.
  const isMobile = useMediaQuery("(max-width: 48em)");

  const [shares, setShares] = useState<MyShare[]>();

  useEffect(() => {
    shareService.getMyShares().then((shares) => setShares(shares));
  }, []);

  if (!shares) return <CenterLoader />;

  return (
    <>
      <Meta title={t("account.shares.title")} />
      <GlassPageBackdrop />
      <Title mt="xl" mb={30} order={2}>
        <FormattedMessage id="account.shares.title" />
      </Title>
      {shares.length == 0 ? (
        <Center style={{ height: "70vh" }}>
          <Stack align="center" spacing={10}>
            <Title order={2}>
              <FormattedMessage id="account.shares.title.empty" />
            </Title>
            <Text>
              <FormattedMessage id="account.shares.description.empty" />
            </Text>
            <Space h={5} />
            <Button component={Link} href="/" variant="light">
              <FormattedMessage id="account.shares.button.create" />
            </Button>
          </Stack>
        </Center>
      ) : (
        // Glass-themed to match the rest of the account/upload chrome —
        // this sits over the page's own photo backdrop (GlassPageBackdrop
        // above), so a default opaque Paper reads as a stray black box
        // rather than a surface catching the same light as everything else.
        <MantineProvider inherit theme={glassFormTheme}>
          <Paper withBorder p="md" sx={{ overflowX: "auto" }}>
            <Table
              sx={{
                tableLayout: "fixed",
                width: "100%",
                [theme.fn.smallerThan("sm")]: { fontSize: theme.fontSizes.xs },
              }}
            >
              <thead>
                <tr>
                  {
                    // Conditionally rendered rather than hidden via CSS —
                    // table-layout: fixed distributes width based on
                    // whichever cells actually exist in the DOM, and a
                    // display:none cell doesn't reliably drop out of that
                    // calculation the same way across browsers, leaving a
                    // near-zero "phantom" column and starving Nom (the one
                    // column that actually needs the room) down to almost
                    // nothing.
                  }
                  {!isMobile && (
                    <th style={{ width: 110 }}>
                      <FormattedMessage id="account.shares.table.id" />
                    </th>
                  )}
                  <th>
                    <FormattedMessage id="account.shares.table.name" />
                  </th>

                  {!isMobile && (
                    <th style={{ width: 90 }}>
                      <FormattedMessage id="account.shares.table.visitors" />
                    </th>
                  )}
                  <th style={{ width: isMobile ? 100 : 130 }}>
                    <FormattedMessage id="account.shares.table.expiresAt" />
                  </th>
                  {
                    // 4 icons collapse to 1 kebab button on mobile (see the
                    // actions cell below) — same reasoning as hiding
                    // ID/Visiteurs above: reclaim width for Nom rather
                    // than spending it on controls that fit behind one menu.
                  }
                  <th style={{ width: isMobile ? 45 : 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {shares.map((share) => {
                  // Shared between the desktop inline icons and the mobile
                  // kebab menu below, so the two don't drift.
                  const openInfoModal = () => {
                    showShareInformationsModal(
                      modals,
                      share,
                      parseInt(config.get("share.maxSize")),
                      config.get("general.appUrl"),
                      config.get("general.appUrl", true),
                      user?.isAdmin || user?.canCreatePermanentShares
                        ? { value: 0, unit: "days" }
                        : config.get("share.maxExpiration"),
                      (updatedShare) =>
                        setShares(
                          shares.map((item) =>
                            item.id === updatedShare.id ? updatedShare : item,
                          ),
                        ),
                    );
                  };
                  const copyLink = () => {
                    if (window.isSecureContext) {
                      clipboard.copy(
                        `${config.get("general.appUrl") !== config.get("general.appUrl", true) ? config.get("general.appUrl") : window.location.origin}/s/${share.id}`,
                      );
                      toast.success(t("common.notify.copied-link"));
                    } else {
                      showShareLinkModal(
                        modals,
                        share.id,
                        config.get("general.appUrl"),
                        config.get("general.appUrl", true),
                      );
                    }
                  };
                  const openDeleteConfirm = () => {
                    modals.openConfirmModal({
                      title: t("account.shares.modal.delete.title", {
                        share: share.id,
                      }),
                      styles: glassModalStyles,
                      children: (
                        <Text size="sm">
                          <FormattedMessage id="account.shares.modal.delete.description" />
                        </Text>
                      ),
                      confirmProps: { color: "red" },
                      labels: {
                        confirm: t("common.button.delete"),
                        cancel: t("common.button.cancel"),
                      },
                      onConfirm: () => {
                        shareService
                          .expire(share.id)
                          .then(() =>
                            setShares(
                              shares.filter((item) => item.id !== share.id),
                            ),
                          )
                          .catch(toast.axiosError);
                      },
                    });
                  };

                  return (
                    <tr key={share.id}>
                      {!isMobile && (
                      <td>
                        <Group spacing="xs" noWrap>
                          {share.id}{" "}
                          {share.security?.passwordProtected && (
                            <HoverTip
                              label={t(
                                "account.shares.table.password-protected",
                              )}
                            >
                              <span style={{ display: "inline-flex" }}>
                                <TbLock
                                  color="orange"
                                  title={t(
                                    "account.shares.table.password-protected",
                                  )}
                                />
                              </span>
                            </HoverTip>
                          )}
                          {config.get("share.enableUserRecipients") &&
                            (share.security?.restrictToRecipients ? (
                              <HoverTip
                                label={t(
                                  "account.shares.table.restricted-to-recipients",
                                )}
                              >
                                <span style={{ display: "inline-flex" }}>
                                  <FaUserLock
                                    color={theme.colors.gray[6]}
                                    title={t(
                                      "account.shares.table.restricted-to-recipients",
                                    )}
                                  />
                                </span>
                              </HoverTip>
                            ) : share.recipients?.length ? (
                              <HoverTip
                                label={t(
                                  "account.shares.table.shared-with-recipients",
                                )}
                              >
                                <span style={{ display: "inline-flex" }}>
                                  <TbUsers
                                    color={theme.colors.gray[6]}
                                    title={t(
                                      "account.shares.table.shared-with-recipients",
                                    )}
                                  />
                                </span>
                              </HoverTip>
                            ) : null)}
                        </Group>
                      </td>
                      )}
                      <td
                        style={{
                          whiteSpace: "normal",
                          overflowWrap: "break-word",
                        }}
                      >
                        <Anchor component={Link} href={`/share/${share.id}`}>
                          {share.name || share.id}
                        </Anchor>
                      </td>
                      {!isMobile && (
                      <td>
                        <Anchor
                          component={Link}
                          href={`/share/${share.id}/downloads`}
                          title={t("account.shares.modal.view-downloads")}
                        >
                          {share.security?.maxViews ? (
                            <FormattedMessage
                              id="account.shares.table.visitor-count"
                              values={{
                                count: share.views,
                                max: share.security.maxViews,
                              }}
                            />
                          ) : (
                            share.views
                          )}
                        </Anchor>
                      </td>
                      )}
                      <td>
                        {moment(share.expiration).unix() === 0 ? (
                          <FormattedMessage id="account.shares.table.expiry-never" />
                        ) : (
                          // "LLL" ("29 août 2026 22:11") was one of the main
                          // contributors to the mobile overflow — a shorter
                          // numeric format keeps this to one line at the
                          // narrower mobile column width.
                          moment(share.expiration).format(
                            isMobile ? "L LT" : "LLL",
                          )
                        )}
                      </td>
                      <td>
                        {isMobile ? (
                          // Same 4 actions, collapsed behind one kebab
                          // button instead of laid out inline — inline
                          // needed ~150px for 4×25px icons alone, more
                          // than a third of the ~309px this table actually
                          // has to work with on a phone, starving Nom (the
                          // column that actually needs the room) down to
                          // one word per line.
                          <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                              <ActionIcon
                                variant="light"
                                size={25}
                                aria-label={t("common.button.menu")}
                              >
                                <TbDotsVertical />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                component={Link}
                                href={`/share/${share.id}/edit`}
                                icon={<TbPlusMinus color="orange" />}
                              >
                                {t("account.shares.button.edit")}
                              </Menu.Item>
                              <Menu.Item
                                icon={<TbInfoCircle color="dodgerblue" />}
                                onClick={openInfoModal}
                              >
                                {t("common.button.info")}
                              </Menu.Item>
                              <Menu.Item
                                icon={<TbLink />}
                                onClick={copyLink}
                              >
                                {t("common.button.copy-link")}
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                icon={<TbTrash />}
                                onClick={openDeleteConfirm}
                              >
                                {t("common.button.delete")}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        ) : (
                          <Group position="right" spacing="xs" noWrap>
                            <HoverTip
                              label={t("account.shares.button.edit")}
                            >
                              <ActionIcon
                                component={Link}
                                href={`/share/${share.id}/edit`}
                                color="orange"
                                variant="light"
                                size={25}
                                aria-label={t("account.shares.button.edit")}
                              >
                                <TbPlusMinus />
                              </ActionIcon>
                            </HoverTip>
                            <HoverTip label={t("common.button.info")}>
                              <ActionIcon
                                color="blue"
                                variant="light"
                                size={25}
                                aria-label={t("common.button.info")}
                                onClick={openInfoModal}
                              >
                                <TbInfoCircle />
                              </ActionIcon>
                            </HoverTip>
                            <HoverTip label={t("common.button.copy-link")}>
                              <ActionIcon
                                variant="light"
                                size={25}
                                aria-label={t("common.button.copy-link")}
                                onClick={copyLink}
                              >
                                <TbLink />
                              </ActionIcon>
                            </HoverTip>
                            <HoverTip label={t("common.button.delete")}>
                              <ActionIcon
                                color="red"
                                variant="light"
                                size={25}
                                aria-label={t("common.button.delete")}
                                onClick={openDeleteConfirm}
                              >
                                <TbTrash />
                              </ActionIcon>
                            </HoverTip>
                          </Group>
                        )}
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
