import { MantineProvider, Stack, TextInput } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import glassFormTheme from "../upload/glassFormTheme";
import { glassModalStyles } from "../upload/glassModalTheme";

const showReverseShareLinkModal = (
  modals: ModalsContextProps,
  reverseShareToken: string,
  appUrl: string,
  defaultAppUrl: string,
) => {
  const t = translateOutsideContext();
  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/upload/${reverseShareToken}`;
  return modals.openModal({
    title: t("account.reverseShares.modal.reverse-share-link"),
    styles: glassModalStyles,
    children: (
      <MantineProvider inherit theme={glassFormTheme}>
        <Stack align="stretch">
          <TextInput variant="filled" value={link} />
        </Stack>
      </MantineProvider>
    ),
  });
};

export default showReverseShareLinkModal;
