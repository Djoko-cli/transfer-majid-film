import { MantineProvider, Stack, TextInput } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import glassFormTheme from "../upload/glassFormTheme";
import { glassModalStyles } from "../upload/glassModalTheme";

const showShareLinkModal = (
  modals: ModalsContextProps,
  shareId: string,
  appUrl: string,
  defaultAppUrl: string,
) => {
  const t = translateOutsideContext();
  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/s/${shareId}`;
  return modals.openModal({
    title: t("account.shares.modal.share-link"),
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

export default showShareLinkModal;
