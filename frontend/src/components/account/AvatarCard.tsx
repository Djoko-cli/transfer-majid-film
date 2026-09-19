import { Avatar, Button, FileButton, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import userService from "../../services/user.service";
import toast from "../../utils/toast.util";

// Doit rester identique à AVATAR_MAX_BYTES côté serveur. Vérifier ici évite de
// téléverser 40 Mo pour se les faire refuser à l'arrivée — ce qui, sur une
// connexion montante ordinaire, est une minute perdue pour rien.
const MAX_BYTES = 5 * 1024 * 1024;

const AvatarCard = () => {
  const { user, refreshUser } = useUser();
  const t = useTranslate();
  const [busy, setBusy] = useState(false);

  const src = user?.avatarUpdatedAt
    ? `/api/users/me/avatar?v=${new Date(user.avatarUpdatedAt).getTime()}`
    : undefined;

  const upload = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("account.card.avatar.too-large"));
      return;
    }
    setBusy(true);
    try {
      await userService.uploadAvatar(file);
      await refreshUser();
      toast.success(t("account.card.avatar.saved"));
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await userService.deleteAvatar();
      await refreshUser();
      toast.success(t("account.card.avatar.removed"));
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper p="xl">
      <Title order={5} mb="xs">
        <FormattedMessage id="account.card.avatar.title" />
      </Title>
      <Group align="center" spacing="xl">
        {/* radius="xl" is only 2rem (32px) in this theme's default radius
            scale (frontend/src/styles/mantine.style.ts sets no override) —
            fine for the navbar's 28px avatar, where 32 > half of 28, but on
            this 96px avatar it renders a rounded square, not a circle.
            Measured: getComputedStyle(...).borderRadius stayed "32px" on
            both, verifiably non-circular here. Half the box size is what
            actually closes the circle, whatever the box is. */}
        <Avatar size={96} radius={96 / 2} src={src} />
        <Stack spacing="xs">
          <Text size="sm" color="dimmed">
            <FormattedMessage id="account.card.avatar.description" />
          </Text>
          <Group spacing="xs">
            <FileButton
              onChange={upload}
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            >
              {(props) => (
                <Button {...props} loading={busy} variant="light">
                  <FormattedMessage id="account.card.avatar.change" />
                </Button>
              )}
            </FileButton>
            {src && (
              <Button color="red" variant="subtle" loading={busy} onClick={remove}>
                <FormattedMessage id="account.card.avatar.remove" />
              </Button>
            )}
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
};

export default AvatarCard;
