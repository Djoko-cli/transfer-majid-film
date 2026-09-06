import { Button, Group, Loader, Table, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import authService, { TrustedDevice } from "../../services/auth.service";
import { glassModalStyles } from "../upload/glassModalTheme";
import toast from "../../utils/toast.util";

// One list+revoke-all panel behind two call shapes: no `userId` reads and
// revokes the signed-in visitor's own devices (/account), a `userId`
// reads and revokes a specific account's instead (the admin user modal).
// Same component either way — the two audiences want the same
// information (what's currently able to skip password and TOTP on this
// account, since when, from where) and the same one action, not two
// separately-maintained UIs for it.
const TrustedDevicesPanel = ({
  userId,
  modals,
}: {
  userId?: string;
  modals: ModalsContextProps;
}) => {
  const t = useTranslate();
  const isMobile = useMediaQuery("(max-width: 560px)");
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = () => {
    (userId
      ? authService.listUserTrustedDevices(userId)
      : authService.listOwnTrustedDevices()
    )
      .then(setDevices)
      .catch(toast.axiosError);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [userId]);

  const confirmRevoke = () => {
    modals.openConfirmModal({
      title: t("account.card.security.trustedDevices.revoke.title"),
      styles: glassModalStyles,
      children: (
        <Text>
          <FormattedMessage id="account.card.security.trustedDevices.revoke.description" />
        </Text>
      ),
      labels: {
        confirm: t("account.card.security.trustedDevices.revoke.confirm"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setRevoking(true);
        (userId
          ? authService.revokeUserTrustedDevices(userId)
          : authService.revokeOwnTrustedDevices()
        )
          .then(() => {
            toast.success(
              t("account.card.security.trustedDevices.revoke.success"),
            );
            load();
          })
          .catch(toast.axiosError)
          .finally(() => setRevoking(false));
      },
    });
  };

  if (devices === null) return <Loader size="sm" />;

  return (
    <>
      <Text color="dimmed" size="sm" mb="md">
        <FormattedMessage id="account.card.security.trustedDevices.description" />
      </Text>
      {devices.length === 0 ? (
        <Text size="sm" color="dimmed">
          <FormattedMessage id="account.card.security.trustedDevices.empty" />
        </Text>
      ) : (
        <Table sx={{ tableLayout: "fixed", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: isMobile ? 80 : 150 }}>
                <FormattedMessage id="account.card.security.trustedDevices.column.since" />
              </th>
              {!isMobile && (
                <th>
                  <FormattedMessage id="account.card.security.trustedDevices.column.device" />
                </th>
              )}
              <th style={{ width: isMobile ? 90 : 130 }}>
                <FormattedMessage id="account.card.security.trustedDevices.column.ip" />
              </th>
              <th style={{ width: isMobile ? 80 : 150 }}>
                <FormattedMessage id="account.card.security.trustedDevices.column.expires" />
              </th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {moment(device.createdAt).format(isMobile ? "L" : "L LT")}
                </td>
                {!isMobile && (
                  <td>
                    <Text truncate size="sm">
                      {device.userAgent || "—"}
                    </Text>
                  </td>
                )}
                <td>
                  <Text truncate size="sm">
                    {device.ipAddress || "—"}
                  </Text>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {moment(device.expiresAt).format(isMobile ? "L" : "L LT")}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Group position="right" mt="md">
        <Button
          color="red"
          variant="light"
          disabled={devices.length === 0}
          loading={revoking}
          onClick={confirmRevoke}
        >
          <FormattedMessage id="account.card.security.trustedDevices.revoke.button" />
        </Button>
      </Group>
    </>
  );
};

export default TrustedDevicesPanel;
