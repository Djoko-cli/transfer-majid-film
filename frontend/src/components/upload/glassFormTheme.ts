import { MantineThemeOverride } from "@mantine/core";

// Scoped, nested-MantineProvider theme override — wraps only the transfer
// card so its inputs read as part of the same liquid-glass panel instead of
// Mantine's normal flat "filled" fields. Deliberately NOT applied at the
// app-wide theme level: every other form in the app (admin config, sign-in,
// account settings) still needs the standard opaque, always-legible fields.
const glassFieldStyles = (theme: any) => {
  const dark = theme.colorScheme === "dark";
  return {
    input: {
      backgroundColor: dark
        ? "rgba(255, 255, 255, 0.07)"
        : "rgba(255, 255, 255, 0.4)",
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.6)"}`,
      color: dark ? theme.white : theme.black,

      "&::placeholder": {
        color: dark ? "rgba(255, 255, 255, 0.42)" : "rgba(0, 0, 0, 0.4)",
      },

      "&:focus, &:focus-within": {
        backgroundColor: dark
          ? "rgba(255, 255, 255, 0.13)"
          : "rgba(255, 255, 255, 0.55)",
        borderColor: theme.colors[theme.primaryColor][dark ? 4 : 6],
      },
    },
    label: {
      color: dark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.75)",
    },
  };
};

const glassFormTheme: MantineThemeOverride = {
  components: {
    TextInput: { styles: glassFieldStyles },
    NumberInput: { styles: glassFieldStyles },
    Select: { styles: glassFieldStyles },
    MultiSelect: { styles: glassFieldStyles },
    PasswordInput: { styles: glassFieldStyles },
    Textarea: { styles: glassFieldStyles },

    SegmentedControl: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          root: {
            backgroundColor: dark
              ? "rgba(255, 255, 255, 0.06)"
              : "rgba(255, 255, 255, 0.3)",
            border: `1px solid ${dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.55)"}`,
          },
          indicator: {
            backgroundColor: dark
              ? "rgba(255, 255, 255, 0.2)"
              : "rgba(255, 255, 255, 0.85)",
          },
          label: {
            color: dark ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.7)",
            "&[data-active]": {
              color: dark ? theme.white : theme.black,
            },
          },
        };
      },
    },

    Accordion: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          item: { border: "none", backgroundColor: "transparent" },
          control: {
            backgroundColor: "transparent",
            "&:hover": {
              backgroundColor: dark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(255, 255, 255, 0.25)",
            },
          },
          content: { backgroundColor: "transparent" },
          chevron: {
            color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
          },
        };
      },
    },

    Checkbox: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          input: {
            backgroundColor: dark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(255, 255, 255, 0.5)",
            borderColor: dark
              ? "rgba(255, 255, 255, 0.25)"
              : "rgba(255, 255, 255, 0.7)",
          },
          label: {
            color: dark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.75)",
          },
        };
      },
    },
  },
};

export default glassFormTheme;
