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
    // NumberInput's +/- controls: Mantine draws them with solid dividing
    // borders (this app's near-black dark[4]) meant to read against an
    // opaque field — against the translucent glass input those show up as
    // stray black seams. Recolor to match the input's own translucent
    // border instead of removing them outright, so the +/- pair still
    // reads as visually separated from the field and from each other.
    control: {
      borderColor: dark
        ? "rgba(255, 255, 255, 0.16)"
        : "rgba(255, 255, 255, 0.6)",
      color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
      backgroundColor: "transparent",

      // !important: Mantine's own NumberInput control has a hardcoded
      // solid-dark :hover of its own: same selector specificity as this
      // override, so which one wins is purely down to injection order —
      // which wasn't reliably this one, unlike the equivalent Dropzone and
      // Accordion hover overrides above.
      "&:hover": {
        backgroundColor: `${dark ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.35)"} !important`,
      },
    },
  };
};

const glassFormTheme: MantineThemeOverride = {
  components: {
    // MantineProvider's `inherit` merge replaces the parent's whole
    // `components` object rather than deep-merging it key by key, so the
    // root theme's Button override (see styles/mantine.style.ts) never
    // reaches this scoped provider unless it's repeated here too. This one
    // differs from the root override on purpose: a solid light chip reads
    // as an opaque foreign object here, whereas the rest of the app's
    // disabled buttons sit on plain backgrounds where translucency
    // wouldn't read at all.
    Button: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          root: {
            "&:disabled, &[data-disabled]": {
              opacity: 1,
              backgroundColor: dark
                ? "rgba(255, 255, 255, 0.14)"
                : "rgba(255, 255, 255, 0.35)",
              color: dark ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.45)",
              border: `1px solid ${dark ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.5)"}`,
            },
          },
        };
      },
    },
    TextInput: { styles: glassFieldStyles },
    NumberInput: { styles: glassFieldStyles },
    Select: { styles: glassFieldStyles },
    // Recipient chips ("value pills") are a separate sub-component with
    // their own style keys (defaultValue/defaultValueRemove) — glassFieldStyles
    // only covers input/label/control, so without this the chips kept
    // Mantine's default solid near-black fill (this app's dark[7]), the
    // one spot still opaque against the rest of the glass-ified card.
    MultiSelect: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          ...glassFieldStyles(theme),
          defaultValue: {
            backgroundColor: dark
              ? "rgba(255, 255, 255, 0.14)"
              : "rgba(255, 255, 255, 0.5)",
            color: dark ? theme.white : theme.black,
          },
          defaultValueRemove: {
            color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
          },
        };
      },
    },
    PasswordInput: { styles: glassFieldStyles },
    Textarea: { styles: glassFieldStyles },
    PinInput: { styles: glassFieldStyles },

    // The dropped-files table (FileList): Mantine draws its row/header
    // borders in this app's near-black dark[4], the same "stray black seam
    // against a translucent field" issue as the NumberInput +/- controls
    // above, just on table rows instead.
    Table: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        const borderColor = dark
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(255, 255, 255, 0.5)";
        return {
          root: {
            color: dark ? theme.white : theme.black,
            "& > thead > tr > th": {
              color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
              borderBottom: `1px solid ${borderColor}`,
            },
            "& > tbody > tr > td": {
              borderTop: `1px solid ${borderColor}`,
            },
          },
        };
      },
    },

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
            borderRadius: theme.radius.sm,
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
