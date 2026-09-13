import { Button, Group, Loader, Table, Text } from "@mantine/core";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
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
  // Measured on this panel's own box, not on the viewport. It renders in two
  // places of very different widths: a full-width card in /account, and the
  // admin's user-edit modal, which is about 380px across on the largest
  // desktop there is. A viewport query answers "is the screen small", which
  // in the modal is the wrong question and answers "no" — so the wide layout
  // applied, its three fixed columns summed to 430px inside 380px of room,
  // and `table-layout: fixed` did the only thing it can: squeezed the one
  // column with no width of its own to nothing. The Appareil header then
  // wrapped to one letter per line, which is how this was reported.
  const { ref: sizeRef, width } = useElementSize();
  const viewportIsSmall = useMediaQuery("(max-width: 560px)");
  // width is 0 for the first paint and while the panel is inside a collapsed
  // accordion section; fall back to the viewport until the box has a real
  // measurement rather than flashing the wrong layout.
  const isMobile = width > 0 ? width < 560 : !!viewportIsSmall;
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

  return (
    <div ref={sizeRef}>
      {devices === null ? (
        <Loader size="sm" />
      ) : (
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
      )}
    </div>
  );
};

export default TrustedDevicesPanel;
