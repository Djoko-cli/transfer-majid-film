import {
  Alert,
  Badge,
  Button,
  Center,
  Container,
  Group,
  MantineProvider,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { TbAuth2Fa, TbDevices, TbMailFast } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import Meta from "../../components/Meta";
import LanguagePicker from "../../components/account/LanguagePicker";
import showEnableTotpModal from "../../components/account/showEnableTotpModal";
import TrustedDevicesPanel from "../../components/auth/TrustedDevicesPanel";
import GlassPageBackdrop from "../../components/core/GlassPageBackdrop";
import glassFormTheme from "../../components/upload/glassFormTheme";
import { glassModalStyles } from "../../components/upload/glassModalTheme";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import userService from "../../services/user.service";
import { getOAuthIcon, getOAuthUrl, unlinkOAuth } from "../../utils/oauth.util";
import toast from "../../utils/toast.util";

// Mirrors EMAIL_CHANGE_RESEND_COOLDOWN_SECONDS on the server. Duplicated
// rather than fetched: this number only decides what a button says, and the
// server refuses an early click whatever this happens to say.
const RESEND_COOLDOWN_SECONDS = 60;

const Account = () => {
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [oauth, setOAuth] = useState<string[]>([]);
  const [oauthStatus, setOAuthStatus] = useState<Record<
    string,
    {
      provider: string;
      providerUsername: string;
    }
  > | null>(null);

  const { user, refreshUser } = useUser();
  const [emailChangeCode, setEmailChangeCode] = useState("");
  // Ticks only while a change is pending, so the resend button can count
  // down truthfully. Derived from the server's own last-sent timestamp
  // rather than from when this component happened to mount — otherwise a
  // reload would reset the countdown to zero and invite a click the server
  // is going to refuse.
  //
  // null until an effect runs, and never Date.now() during render: this
  // block IS server-rendered, so reading the clock while rendering gives
  // the server one second and the client the next, and React tears the
  // whole tree down over the mismatch. Caught on screen — "Server:
  // 'Renvoyer dans 58 s' Client: 'Renvoyer dans 57 s'" — while every
  // text assertion about the button was passing. Both sides now render the
  // same idle label, and the countdown appears once the client is alone.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.pendingEmail) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [user?.pendingEmail]);

  const resendIn =
    now && user?.pendingEmailLastSentAt
      ? Math.max(
          0,
          RESEND_COOLDOWN_SECONDS -
            Math.floor(
              (now - new Date(user.pendingEmailLastSentAt).getTime()) / 1000,
            ),
        )
      : 0;
  const modals = useModals();
  const t = useTranslate();
  const config = useConfig();

  const accountForm = useForm({
    initialValues: {
      username: user?.username,
      email: user?.email,
    },
    validate: yupResolver(
      yup.object().shape({
        email: yup.string().email(t("common.error.invalid-email")),
        username: yup
          .string()
          .min(3, t("common.error.too-short", { length: 3 })),
      }),
    ),
  });

  const passwordForm = useForm({
    initialValues: {
      oldPassword: "",
      password: "",
    },
    validate: yupResolver(
      yup.object().shape({
        oldPassword: yup.string().when([], {
          is: () => !!user?.hasPassword,
          then: (schema) =>
            schema
              .min(8, t("common.error.too-short", { length: 8 }))
              .required(t("common.error.field-required")),
          otherwise: (schema) => schema.notRequired(),
        }),
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 }))
          .required(t("common.error.field-required")),
      }),
    ),
  });

  const enableTotpForm = useForm({
    initialValues: {
      password: "",
    },
    validate: yupResolver(
      yup.object().shape({
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 }))
          .required(t("common.error.field-required")),
      }),
    ),
  });

  const disableTotpForm = useForm({
    initialValues: {
      password: "",
      code: "",
    },
    validate: yupResolver(
      yup.object().shape({
        password: yup.string().min(8),
        code: yup
          .string()
          .min(6, t("common.error.exact-length", { length: 6 }))
          .max(6, t("common.error.exact-length", { length: 6 }))
          .matches(/^[0-9]+$/, { message: t("common.error.invalid-number") }),
      }),
    ),
  });

  const refreshOAuthStatus = () => {
    authService
      .getOAuthStatus()
      .then((data) => {
        setOAuthStatus(data.data);
      })
      .catch(toast.axiosError);
  };

  useEffect(() => {
    authService
      .getAvailableOAuth()
      .then((data) => {
        setOAuth(data.data);
      })
      .catch(toast.axiosError);
    refreshOAuthStatus();
  }, []);

  return (
    <>
      <Meta title={t("account.title")} />
      <GlassPageBackdrop />
      <MantineProvider inherit theme={glassFormTheme}>
        <Container size="sm">
          <Title order={3} mt="xl" mb="xs">
            <FormattedMessage id="account.title" />
          </Title>
          <Paper p="xl">
            <Title order={5} mb="xs">
              <FormattedMessage id="account.card.info.title" />
              {user?.isLdap ? (
                <Badge style={{ marginLeft: "1em" }}>
                  {t("common.badge.ldap")}
                </Badge>
              ) : null}
            </Title>
            <form
              onSubmit={accountForm.onSubmit((values) =>
                userService
                  .updateCurrentUser({
                    username: values.username,
                    email: values.email,
                  })
                  .then(async (updated) => {
                    await refreshUser();
                    // A changed address is not applied here, it is held
                    // pending a code — so saying "saved" would be a lie
                    // about the one field the reader most cares about.
                    toast.success(
                      updated?.pendingEmail
                        ? t("account.notify.email-change.requested", {
                            email: updated.pendingEmail,
                          })
                        : t("account.notify.info.success"),
                    );
                  })
                  .catch(toast.axiosError),
              )}
            >
              <Stack>
                <TextInput
                  label={t("account.card.info.username")}
                  disabled={user?.isLdap}
                  {...accountForm.getInputProps("username")}
                />
                <TextInput
                  label={t("account.card.info.email")}
                  disabled={user?.isLdap}
                  {...accountForm.getInputProps("email")}
                />
                {!user?.isLdap && (
                  <Group position="right">
                    <Button type="submit">
                      <FormattedMessage id="common.button.save" />
                    </Button>
                  </Group>
                )}
              </Stack>
            </form>

            {user?.pendingEmail && (
              <Alert
                mt="lg"
                variant="light"
                color="primary"
                icon={<TbMailFast />}
                title={t("account.card.info.pending-email.title")}
              >
                <Stack spacing="sm">
                  <Text size="sm">
                    <FormattedMessage
                      id="account.card.info.pending-email.description"
                      values={{ email: <b>{user.pendingEmail}</b> }}
                    />
                  </Text>
                  <TextInput
                    label={t("account.card.info.pending-email.code")}
                    value={emailChangeCode}
                    onChange={(e) =>
                      setEmailChangeCode(e.currentTarget.value.trim())
                    }
                  />
                  <Group position="right">
                    <Button
                      variant="subtle"
                      disabled={now === null || resendIn > 0}
                      onClick={() =>
                        userService
                          .resendEmailChangeCode()
                          .then(async () => {
                            await refreshUser();
                            toast.success(
                              t("account.notify.email-change.resent", {
                                email: user.pendingEmail!,
                              }),
                            );
                          })
                          .catch(toast.axiosError)
                      }
                    >
                      {resendIn > 0
                        ? t("account.card.info.pending-email.resend-in", {
                            seconds: resendIn,
                          })
                        : t("account.card.info.pending-email.resend")}
                    </Button>
                    <Button
                      variant="subtle"
                      onClick={() =>
                        userService
                          .cancelEmailChange()
                          .then(async () => {
                            await refreshUser();
                            setEmailChangeCode("");
                            toast.success(
                              t("account.notify.email-change.cancelled"),
                            );
                          })
                          .catch(toast.axiosError)
                      }
                    >
                      <FormattedMessage id="account.card.info.pending-email.cancel" />
                    </Button>
                    <Button
                      disabled={emailChangeCode.length !== 6}
                      onClick={() =>
                        userService
                          .confirmEmailChange(emailChangeCode)
                          .then(async () => {
                            await refreshUser();
                            setEmailChangeCode("");
                            toast.success(
                              t("account.notify.email-change.confirmed"),
                            );
                          })
                          .catch(toast.axiosError)
                      }
                    >
                      <FormattedMessage id="account.card.info.pending-email.confirm" />
                    </Button>
                  </Group>
                </Stack>
              </Alert>
            )}
          </Paper>
          {user?.isLdap ? null : (
            <Paper p="xl" mt="lg">
              <Title order={5} mb="xs">
                <FormattedMessage id="account.card.password.title" />
              </Title>
              <form
                onSubmit={passwordForm.onSubmit((values) =>
                  authService
                    .updatePassword(values.oldPassword, values.password)
                    .then(async () => {
                      refreshUser();
                      toast.success(t("account.notify.password.success"));
                      passwordForm.reset();
                    })
                    .catch(toast.axiosError),
                )}
              >
                <Stack>
                  {user?.hasPassword ? (
                    <PasswordInput
                      label={t("account.card.password.old")}
                      {...passwordForm.getInputProps("oldPassword")}
                    />
                  ) : (
                    <Text size="sm" color="dimmed">
                      <FormattedMessage id="account.card.password.noPasswordSet" />
                    </Text>
                  )}
                  <PasswordInput
                    label={t("account.card.password.new")}
                    {...passwordForm.getInputProps("password")}
                  />
                  <Group position="right">
                    <Button type="submit">
                      <FormattedMessage id="common.button.save" />
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Paper>
          )}
          {oauth.length > 0 && (
            <Paper p="xl" mt="lg">
              <Title order={5} mb="xs">
                <FormattedMessage id="account.card.oauth.title" />
              </Title>

              <Tabs defaultValue={oauth[0] || ""}>
                <Tabs.List>
                  {oauth.map((provider) => (
                    <Tabs.Tab
                      value={provider}
                      icon={getOAuthIcon(provider)}
                      key={provider}
                    >
                      {t(`account.card.oauth.${provider}`)}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
                {oauth.map((provider) => (
                  <Tabs.Panel value={provider} pt="xs" key={provider}>
                    <Group position="apart">
                      <Text>
                        {oauthStatus?.[provider]
                          ? oauthStatus[provider].providerUsername
                          : t("account.card.oauth.unlinked")}
                      </Text>
                      {oauthStatus?.[provider] ? (
                        <Button
                          onClick={() => {
                            modals.openConfirmModal({
                              title: t("account.modal.unlink.title"),
                              styles: glassModalStyles,
                              children: (
                                <Text>
                                  {t("account.modal.unlink.description")}
                                </Text>
                              ),
                              labels: {
                                confirm: t("account.card.oauth.unlink"),
                                cancel: t("common.button.cancel"),
                              },
                              confirmProps: { color: "red" },
                              onConfirm: () => {
                                unlinkOAuth(provider)
                                  .then(() => {
                                    toast.success(
                                      t(
                                        "account.notify.oauth.unlinked.success",
                                      ),
                                    );
                                    refreshOAuthStatus();
                                  })
                                  .catch(toast.axiosError);
                              },
                            });
                          }}
                        >
                          {t("account.card.oauth.unlink")}
                        </Button>
                      ) : (
                        <Button
                          component="a"
                          href={getOAuthUrl(
                            config.get("general.appUrl") !==
                              config.get("general.appUrl", true)
                              ? config.get("general.appUrl")
                              : window.location.origin,
                            provider,
                          )}
                        >
                          {t("account.card.oauth.link")}
                        </Button>
                      )}
                    </Group>
                  </Tabs.Panel>
                ))}
              </Tabs>
            </Paper>
          )}
          <Paper p="xl" mt="lg">
            <Title order={5} mb="xs">
              <FormattedMessage id="account.card.security.title" />
            </Title>

            <Tabs defaultValue="totp">
              <Tabs.List>
                <Tabs.Tab value="totp" icon={<TbAuth2Fa size={14} />}>
                  <FormattedMessage id="account.card.security.totp.tab" />
                </Tabs.Tab>
                <Tabs.Tab value="trustedDevices" icon={<TbDevices size={14} />}>
                  <FormattedMessage id="account.card.security.trustedDevices.tab" />
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="totp" pt="xs">
                {user?.totpVerified ? (
                  <>
                    <form
                      onSubmit={disableTotpForm.onSubmit((values) => {
                        authService
                          .disableTOTP(values.code, values.password)
                          .then(() => {
                            toast.success(t("account.notify.totp.disable"));
                            values.password = "";
                            values.code = "";
                            refreshUser();
                          })
                          .catch(toast.axiosError);
                      })}
                    >
                      <Stack>
                        <PasswordInput
                          description={t(
                            "account.card.security.totp.disable.description",
                          )}
                          label={t("account.card.password.title")}
                          {...disableTotpForm.getInputProps("password")}
                        />

                        <TextInput
                          variant="filled"
                          label={t("account.modal.totp.code")}
                          placeholder="******"
                          {...disableTotpForm.getInputProps("code")}
                        />

                        <Group position="right">
                          <Button color="red" type="submit">
                            <FormattedMessage id="common.button.disable" />
                          </Button>
                        </Group>
                      </Stack>
                    </form>
                  </>
                ) : (
                  <>
                    <form
                      onSubmit={enableTotpForm.onSubmit((values) => {
                        authService
                          .enableTOTP(values.password)
                          .then((result) => {
                            showEnableTotpModal(modals, refreshUser, {
                              qrCode: result.qrCode,
                              secret: result.totpSecret,
                              password: values.password,
                            });
                            values.password = "";
                          })
                          .catch(toast.axiosError);
                      })}
                    >
                      <Stack>
                        <PasswordInput
                          label={t("account.card.password.title")}
                          description={t(
                            "account.card.security.totp.enable.description",
                          )}
                          {...enableTotpForm.getInputProps("password")}
                        />
                        <Group position="right">
                          <Button type="submit">
                            <FormattedMessage id="account.card.security.totp.button.start" />
                          </Button>
                        </Group>
                      </Stack>
                    </form>
                  </>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="trustedDevices" pt="xs">
                <TrustedDevicesPanel modals={modals} />
              </Tabs.Panel>
            </Tabs>
          </Paper>
          <Paper p="xl" mt="lg">
            <Title order={5} mb="xs">
              <FormattedMessage id="account.card.notifications.title" />
            </Title>
            <Stack spacing="md">
              <Switch
                label={t("account.card.notifications.sent-shares.label")}
                description={t(
                  "account.card.notifications.sent-shares.description",
                )}
                // ?? true mirrors the column's own default: a user record
                // fetched before this field existed has it undefined, and
                // the backend would still mail them — the switch must show
                // what will actually happen, not an unchecked box.
                checked={user?.notifyOnSentShares ?? true}
                disabled={notifyLoading}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setNotifyLoading(true);
                  userService
                    .updateCurrentUser({ notifyOnSentShares: checked })
                    .then(async () => {
                      await refreshUser();
                      toast.success(t("account.notify.notifications.success"));
                    })
                    .catch(toast.axiosError)
                    .finally(() => setNotifyLoading(false));
                }}
              />
              <Switch
                label={t("account.card.notifications.expiring-shares.label")}
                description={t(
                  "account.card.notifications.expiring-shares.description",
                )}
                checked={user?.notifyOnExpiringSentShares ?? true}
                disabled={notifyLoading}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setNotifyLoading(true);
                  userService
                    .updateCurrentUser({ notifyOnExpiringSentShares: checked })
                    .then(async () => {
                      await refreshUser();
                      toast.success(t("account.notify.notifications.success"));
                    })
                    .catch(toast.axiosError)
                    .finally(() => setNotifyLoading(false));
                }}
              />
            </Stack>
          </Paper>
          <Paper p="xl" mt="lg">
            <Title order={5} mb="xs">
              <FormattedMessage id="account.card.language.title" />
            </Title>
            <LanguagePicker />
          </Paper>
          {/* Light mode is retired from display for now — ThemeSwitcher and
            its translations are untouched, just not rendered here. */}
          {/* Hidden for admins - deleteCurrentUser has no isAdmin check on
            the backend (unlike every admin-scoped mutation elsewhere in
            this app), so this was one accidental click away from an admin
            deleting their own account with no "last admin" or role guard
            catching it. */}
          {!user?.isAdmin && (
            <Center mt={80} mb="lg">
              <Stack>
                <Button
                  variant="light"
                  color="red"
                  onClick={() =>
                    modals.openConfirmModal({
                      title: t("account.modal.delete.title"),
                      styles: glassModalStyles,
                      children: (
                        <Text size="sm">
                          <FormattedMessage id="account.modal.delete.description" />
                        </Text>
                      ),

                      labels: {
                        confirm: t("common.button.delete"),
                        cancel: t("common.button.cancel"),
                      },
                      confirmProps: { color: "red" },
                      onConfirm: async () => {
                        await userService
                          .removeCurrentUser()
                          .then(() => window.location.reload())
                          .catch(toast.axiosError);
                      },
                    })
                  }
                >
                  <FormattedMessage id="account.button.delete" />
                </Button>
              </Stack>
            </Center>
          )}
        </Container>
      </MantineProvider>
    </>
  );
};

export default Account;
