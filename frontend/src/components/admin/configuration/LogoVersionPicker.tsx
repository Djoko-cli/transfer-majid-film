import {
  createStyles,
  Image,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { brandAssetPath, LOGO_VERSIONS } from "../../../hooks/brandAsset.hook";
import { AdminConfig } from "../../../types/config.type";

const useStyles = createStyles((theme) => {
  const accent = theme.colors[theme.primaryColor];

  return {
    card: {
      // Flex from the top, not block: a <button> centres its content
      // vertically, so in a row of two the shorter card's text would float
      // down to meet its taller neighbour's.
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      width: "100%",
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      border: `1px solid ${theme.colors.dark[4]}`,
      backgroundColor: theme.colors.dark[5],
      textAlign: "left",
      transition: "border-color 150ms ease, background-color 150ms ease",

      "&:hover:not(:disabled)": {
        borderColor: theme.colors.dark[3],
      },
      "&:focus-visible": {
        outline: `2px solid ${accent[4]}`,
        outlineOffset: 2,
      },
      "&:disabled": {
        opacity: 0.6,
        cursor: "not-allowed",
      },
    },
    active: {
      borderColor: accent[6],
      backgroundColor: theme.fn.rgba(accent[8], 0.35),

      "&:hover:not(:disabled)": {
        borderColor: accent[6],
      },
    },
  };
});

// The logo version, as cards rather than a dropdown: the choice is visual,
// so each card shows the mark it stands for. Marked up as a radio group, so
// a screen reader hears which one is on.
//
// It feeds the page's own Save like every other setting, rather than
// saving on click: the rest of the console works that way, and a card
// that saved by itself would be the one control on the page that did.
const LogoVersionPicker = ({
  configVariable,
  onChange,
}: {
  configVariable: AdminConfig;
  onChange: (value: string) => void;
}) => {
  const { classes, cx } = useStyles();
  const [selected, setSelected] = useState(
    configVariable.value ?? configVariable.defaultValue,
  );

  const choose = (version: string) => {
    if (version === selected) return;
    setSelected(version);
    onChange(version);
  };

  return (
    <Stack spacing={4}>
      <Title order={6} id="logo-version-title">
        <FormattedMessage id="admin.config.appearance.logo" />
      </Title>
      <Text color="dimmed" size="sm" mb="xs">
        <FormattedMessage id="admin.config.appearance.logo.description" />
      </Text>
      <SimpleGrid
        cols={2}
        spacing="sm"
        breakpoints={[{ maxWidth: "sm", cols: 1 }]}
        role="radiogroup"
        aria-labelledby="logo-version-title"
      >
        {LOGO_VERSIONS.map((version) => {
          const active = version === selected;
          return (
            <UnstyledButton
              key={version}
              role="radio"
              aria-checked={active}
              disabled={!configVariable.allowEdit}
              onClick={() => choose(version)}
              className={cx(classes.card, { [classes.active]: active })}
            >
              <Image
                src={brandAssetPath(version, "logo.png")}
                alt=""
                width={36}
                height={36}
              />
              <Text size="sm" weight={500} mt="sm">
                <FormattedMessage
                  id={`admin.config.appearance.logo.${version}`}
                />
              </Text>
              <Text size="xs" color="dimmed" mt={4} sx={{ lineHeight: 1.6 }}>
                <FormattedMessage
                  id={`admin.config.appearance.logo.${version}.hint`}
                />
              </Text>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
};

export default LogoVersionPicker;
