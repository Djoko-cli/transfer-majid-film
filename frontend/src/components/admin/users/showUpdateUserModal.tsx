import {
  Accordion,
  Avatar,
  Button,
  Group,
  MantineProvider,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import authService from "../../../services/auth.service";
import userService from "../../../services/user.service";
import User from "../../../types/user.type";
import toast from "../../../utils/toast.util";
import TrustedDevicesPanel from "../../auth/TrustedDevicesPanel";
import FileSizeInput from "../../core/FileSizeInput";
import glassFormTheme from "../../upload/glassFormTheme";
import { glassModalStyles } from "../../upload/glassModalTheme";

const showUpdateUserModal = (
  modals: ModalsContextProps,
  user: User,
  getUsers: () => void,
  isLastAdmin: boolean,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    title: t("admin.users.edit.update.title", { username: user.username }),
    styles: glassModalStyles,
    children: (
      <Body
        user={user}
        modals={modals}
        getUsers={getUsers}
        isLastAdmin={isLastAdmin}
      />
    ),
  });
};

const Body = ({
  user,
  modals,
  getUsers,
  isLastAdmin,
}: {
  modals: ModalsContextProps;
  user: User;
  getUsers: () => void;
  isLastAdmin: boolean;
}) => {
  const t = useTranslate();

  // La modale reçoit un instantané de `user` au moment où elle s'ouvre — il
  // ne se met pas à jour tout seul quand le retrait réussit. Ce drapeau local
  // est ce qui fait disparaître la photo ici, tout de suite, sans attendre
  // une fermeture/réouverture de la modale ; `getUsers()` ci-dessous est ce
  // qui la fait disparaître dans le tableau, derrière elle.
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // La condition porte directement sur `user.avatarUpdatedAt` (et pas sur un
  // booléen dérivé) pour que TypeScript le rétrécisse en non-`undefined`
  // dans la branche `?:` — `strict: true` ici, contrairement au backend.
  const avatarSrc =
    user.avatarUpdatedAt && !avatarRemoved
      ? `/api/users/${user.id}/avatar?v=${new Date(
          user.avatarUpdatedAt,
        ).getTime()}`
      : undefined;
  const hasAvatar = !!avatarSrc;

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await userService.removeUserAvatar(user.id);
      setAvatarRemoved(true);
      getUsers();
      toast.success(t("admin.users.edit.update.avatar.removed"));
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setAvatarBusy(false);
    }
  };

  const accountForm = useForm({
    initialValues: {
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isActivated: user.isActivated,
      canCreatePermanentShares: user.canCreatePermanentShares ?? false,
      hasCustomShareSizeLimit: !!user.shareSizeLimit,
      shareSizeLimit: user.shareSizeLimit
        ? parseInt(user.shareSizeLimit)
        : 104857600,
      hasCustomStorageQuotaLimit: !!user.storageQuotaLimit,
      storageQuotaLimit: user.storageQuotaLimit
        ? parseInt(user.storageQuotaLimit)
        : 21474836480,
    },
    validate: yupResolver(
      yup.object().shape({
        email: yup.string().email(t("common.error.invalid-email")),
        username: yup
          .string()
          .min(3, t("common.error.too-short", { length: 3 })),
        storageQuotaLimit: yup
          .number()
          .test(
            "storage-quota-positive",
            "Storage quota must be greater than 0",
            function (value) {
              if (!this.parent.hasCustomStorageQuotaLimit) return true;
              return (value ?? 0) > 0;
            },
          ),
      }),
    ),
  });

  // Le mot de passe saisi ici est celui de l'administrateur connecté, pas
  // celui du compte affiché — d'où un formulaire distinct de `passwordForm`,
  // qui lui écrit bien le mot de passe de la cible.
  const totpForm = useForm({
    initialValues: {
      password: "",
    },
  });
  const [totpReset, setTotpReset] = useState(false);

  const passwordForm = useForm({
    initialValues: {
      password: "",
    },
    validate: yupResolver(
      yup.object().shape({
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 })),
      }),
    ),
  });

  return (
    <MantineProvider inherit theme={glassFormTheme}>
      <Stack>
        {
          // Affiché seulement s'il y a une photo — un administrateur peut la
          // voir et la retirer, jamais en poser une : voir §1 et §5 bis de
          // docs/photos-de-profil.md.
          hasAvatar && (
            <Group position="apart">
              <Avatar size={80} radius={40} src={avatarSrc} />
              <Button
                color="red"
                variant="subtle"
                loading={avatarBusy}
                onClick={removeAvatar}
              >
                <FormattedMessage id="admin.users.edit.update.avatar.remove" />
              </Button>
            </Group>
          )
        }
        <form
          id="accountForm"
          onSubmit={accountForm.onSubmit(async (values) => {
            userService
              .update(user.id, {
                username: values.username,
                email: values.email,
                isAdmin: values.isAdmin,
                isActivated: values.isActivated,
                canCreatePermanentShares: values.canCreatePermanentShares,
                shareSizeLimit: values.hasCustomShareSizeLimit
                  ? values.shareSizeLimit.toString()
                  : null,
                storageQuotaLimit: values.hasCustomStorageQuotaLimit
                  ? values.storageQuotaLimit.toString()
                  : null,
              })
              .then(() => {
                getUsers();
                modals.closeAll();
              })
              .catch(toast.axiosError);
          })}
        >
          <Stack>
            <TextInput
              label={t("admin.users.table.username")}
              {...accountForm.getInputProps("username")}
            />
            <TextInput
              label={t("admin.users.table.email")}
              {...accountForm.getInputProps("email")}
            />
            <Switch
              mt="xs"
              labelPosition="left"
              label={t("admin.users.edit.update.admin-privileges")}
              {...accountForm.getInputProps("isAdmin", { type: "checkbox" })}
              // Verrouillé plutôt que masqué : un interrupteur qui disparaît
              // ressemble à un bug, un interrupteur grisé qui dit pourquoi
              // est une réponse. Le serveur refuse de toute façon — ceci
              // évite juste d'aller chercher le refus.
              disabled={isLastAdmin}
              description={
                isLastAdmin
                  ? t("admin.users.edit.update.admin-privileges.last-admin")
                  : undefined
              }
            />
            <Switch
              mt="xs"
              labelPosition="left"
              label={t("admin.users.edit.update.email-verified")}
              {...accountForm.getInputProps("isActivated", {
                type: "checkbox",
              })}
              disabled={user.isActivated}
            />
            <Switch
              mt="xs"
              labelPosition="left"
              label={t("admin.users.edit.update.permanent-shares")}
              description={t(
                "admin.users.edit.update.permanent-shares.description",
              )}
              {...accountForm.getInputProps("canCreatePermanentShares", {
                type: "checkbox",
              })}
            />
            <Switch
              styles={{
                body: {
                  display: "flex",
                  justifyContent: "space-between",
                },
              }}
              mt="xs"
              labelPosition="left"
              label={t("admin.users.edit.update.custom-share-size-limit")}
              description={t(
                "admin.users.edit.update.custom-share-size-limit.description",
              )}
              {...accountForm.getInputProps("hasCustomShareSizeLimit", {
                type: "checkbox",
              })}
            />
            {accountForm.values.hasCustomShareSizeLimit && (
              <FileSizeInput
                label={t("admin.users.edit.update.custom-share-size-limit")}
                value={accountForm.values.shareSizeLimit}
                onChange={(val) =>
                  accountForm.setFieldValue("shareSizeLimit", val)
                }
              />
            )}
            <Switch
              styles={{
                body: {
                  display: "flex",
                  justifyContent: "space-between",
                },
              }}
              mt="xs"
              labelPosition="left"
              label={t("admin.users.edit.update.custom-storage-quota-limit")}
              description={t(
                "admin.users.edit.update.custom-storage-quota-limit.description",
              )}
              {...accountForm.getInputProps("hasCustomStorageQuotaLimit", {
                type: "checkbox",
              })}
            />
            {accountForm.values.hasCustomStorageQuotaLimit && (
              <FileSizeInput
                label={t("admin.users.edit.update.custom-storage-quota-limit")}
                value={accountForm.values.storageQuotaLimit}
                onChange={(val) =>
                  accountForm.setFieldValue("storageQuotaLimit", val)
                }
              />
            )}
          </Stack>
        </form>
        <Accordion>
          <Accordion.Item value="changePassword">
            <Accordion.Control px={0}>
              <FormattedMessage id="admin.users.edit.update.change-password.title" />
            </Accordion.Control>
            <Accordion.Panel>
              <form
                onSubmit={passwordForm.onSubmit(async (values) => {
                  userService
                    .update(user.id, {
                      password: values.password,
                    })
                    .then(() =>
                      toast.success(
                        t("admin.users.edit.update.notify.password.success"),
                      ),
                    )
                    .catch(toast.axiosError);
                })}
              >
                <Stack>
                  <PasswordInput
                    label={t("admin.users.edit.update.change-password.field")}
                    {...passwordForm.getInputProps("password")}
                  />
                  <Button variant="light" type="submit">
                    <FormattedMessage id="admin.users.edit.update.change-password.button" />
                  </Button>
                </Stack>
              </form>
            </Accordion.Panel>
          </Accordion.Item>
          {
            // Visible seulement quand le compte a réellement un second
            // facteur : proposer de « réinitialiser » ce qui n'existe pas
            // serait une fausse piste, et le serveur refuse ce cas de toute
            // façon (`auth.totpNotEnabled`). Un authentificateur perdu était
            // jusqu'ici sans recours d'aucune sorte — pas de codes de
            // secours, aucune route qui touchait le champ.
            user.totpVerified && !totpReset && (
              <Accordion.Item value="resetTotp">
                <Accordion.Control px={0}>
                  <FormattedMessage id="admin.users.edit.update.totp.title" />
                </Accordion.Control>
                <Accordion.Panel>
                  <form
                    onSubmit={totpForm.onSubmit(async (values) => {
                      authService
                        .resetUserTOTP(user.id, values.password)
                        .then(() => {
                          setTotpReset(true);
                          totpForm.reset();
                          getUsers();
                          toast.success(
                            t("admin.users.edit.update.totp.reset.success"),
                          );
                        })
                        .catch(toast.axiosError);
                    })}
                  >
                    <Stack>
                      <PasswordInput
                        label={t("admin.users.edit.update.totp.your-password")}
                        description={t(
                          "admin.users.edit.update.totp.description",
                        )}
                        {...totpForm.getInputProps("password")}
                      />
                      <Button color="red" variant="light" type="submit">
                        <FormattedMessage id="admin.users.edit.update.totp.reset.button" />
                      </Button>
                    </Stack>
                  </form>
                </Accordion.Panel>
              </Accordion.Item>
            )
          }
          {
            // A password change already revokes these as a side effect
            // (see AuthService.resetPassword/updatePassword and
            // UserService.update's own comments) — this is for the
            // narrower case an admin wants to cut standing trusted-device
            // access without necessarily resetting the password too, e.g.
            // a reported-but-unconfirmed compromise, or a shared/public
            // computer the owner mentioned in passing.
          }
          <Accordion.Item sx={{ borderBottom: "none" }} value="trustedDevices">
            <Accordion.Control px={0}>
              <FormattedMessage id="admin.users.edit.update.trusted-devices.title" />
            </Accordion.Control>
            <Accordion.Panel>
              <TrustedDevicesPanel userId={user.id} modals={modals} />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        <Group position="right">
          <Button type="submit" form="accountForm">
            <FormattedMessage id="common.button.save" />
          </Button>
        </Group>
      </Stack>
    </MantineProvider>
  );
};

export default showUpdateUserModal;
