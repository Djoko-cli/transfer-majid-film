import { ActionIcon, Avatar, Menu } from "@mantine/core";
import Link from "next/link";
import { TbDoorExit, TbSettings, TbUser, TbUserCircle } from "react-icons/tb";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import { FormattedMessage, useIntl } from "react-intl";
import { HoverTip } from "../../components/core/HoverTip";
import useTranslate from "../../hooks/useTranslate.hook";
import { useState } from "react";

const ActionAvatar = () => {
  const { user } = useUser();
  const t = useTranslate();
  const [menuOpened, setMenuOpened] = useState(false);

  // `radius="xl"` est le cercle : Mantine 6 rend un carré arrondi par défaut.
  // Sans photo, `src` vaut `undefined` et Mantine retombe sur son propre
  // placeholder — c'est-à-dire exactement l'affichage d'avant ce chantier.
  // `?v=` est ce qui rend correct le cache d'un an posé par la route.
  const avatarSrc = user?.avatarUpdatedAt
    ? `/api/users/me/avatar?v=${new Date(user.avatarUpdatedAt).getTime()}`
    : undefined;

  return (
    <Menu position="bottom-start" withinPortal onChange={setMenuOpened}>
      <Menu.Target>
        <ActionIcon aria-label={t("common.button.profile")}>
          <HoverTip label={t("common.button.profile")} disabled={menuOpened}>
            <Avatar size={28} radius="xl" src={avatarSrc} />
          </HoverTip>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} href="/account" icon={<TbUser size={14} />}>
          <FormattedMessage id="navbar.avatar.account" />
        </Menu.Item>
        {user!.isAdmin && (
          <Menu.Item
            component={Link}
            href="/admin"
            icon={<TbSettings size={14} />}
          >
            <FormattedMessage id="navbar.avatar.admin" />
          </Menu.Item>
        )}

        <Menu.Item
          onClick={async () => {
            await authService.signOut();
          }}
          icon={<TbDoorExit size={14} />}
        >
          <FormattedMessage id="navbar.avatar.signout" />
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default ActionAvatar;
