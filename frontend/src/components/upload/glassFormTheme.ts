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
        color: dark ? "rgba(255, 255, 255, 0.62)" : "rgba(0, 0, 0, 0.58)",
      },

      "&:focus, &:focus-within": {
        backgroundColor: dark
          ? "rgba(255, 255, 255, 0.13)"
          : "rgba(255, 255, 255, 0.55)",
        borderColor: theme.colors[theme.primaryColor][dark ? 4 : 6],
      },
    },
    // PasswordInput (alone among these) splits "input" into an outer
    // wrapper (border/background — the `input` key above) and this inner
    // key for the actual <input> it contains, because the wrapper also
    // hosts the show/hide toggle button. `::placeholder` only ever matches
    // a real <input>, never an ancestor, so without repeating it here the
    // wrapper's placeholder color silently matches nothing and the field
    // falls back to Mantine's own default — a dark grey meant for an
    // opaque background, unreadable against this translucent one. Every
    // other component using glassFieldStyles has just one real input, so
    // this key is simply ignored there.
    innerInput: {
      color: dark ? theme.white : theme.black,
      "&::placeholder": {
        color: dark ? "rgba(255, 255, 255, 0.62)" : "rgba(0, 0, 0, 0.58)",
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
    // Every card this theme wraps (transfer, auth, the public share page)
    // renders its <Title> with no explicit color — Mantine's own default
    // (near-black/near-white) — directly over BrandPanel's unpredictable
    // photo brightness. Same halo technique as Header's nav links and
    // PageDropOverlay's title (see Header.tsx): real-world margin against
    // a photo's texture on top of the card's own tint (see
    // SplitTransferLayout.tsx/AuthGlassLayout.tsx). One override here
    // covers every current and future Title inside a glass card, rather
    // than repeating it per page.
    Title: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          root: {
            textShadow: dark
              ? "0 1px 3px rgba(0, 0, 0, 0.7)"
              : "0 1px 3px rgba(255, 255, 255, 0.7)",
          },
        };
      },
    },

    // Every other slot here (label/input/control/etc.) is covered, but
    // `color="dimmed"` prose — the dropzone description, the anonymous
    // notice, the expiration preview — fell through: Mantine's own
    // "dimmed" resolves to a fixed grey meant for an opaque background,
    // which computes to ~1.9:1 against a bright backdrop slide. Scoped to
    // just the dimmed variant (via the `color` style param) rather than
    // every Text, so explicit colors elsewhere are left alone. Same halo
    // technique as the Title override above.
    Text: {
      styles: (theme: any, params: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          root:
            params?.color === "dimmed"
              ? {
                  color: dark
                    ? "rgba(255, 255, 255, 0.72)"
                    : "rgba(0, 0, 0, 0.68)",
                  textShadow: dark
                    ? "0 1px 3px rgba(0, 0, 0, 0.7)"
                    : "0 1px 3px rgba(255, 255, 255, 0.7)",
                }
              : {},
        };
      },
    },

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
    NativeSelect: { styles: glassFieldStyles },
    ColorInput: { styles: glassFieldStyles },
    FileInput: { styles: glassFieldStyles },
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
          // Same split as PasswordInput's innerInput above: MultiSelect's
          // own "input" key is the outer box holding the chips *and* the
          // search field together, not the real text-entry element, so its
          // placeholder needs repeating here to actually take effect.
          searchInput: {
            color: dark ? theme.white : theme.black,
            "&::placeholder": {
              color: dark ? "rgba(255, 255, 255, 0.62)" : "rgba(0, 0, 0, 0.58)",
            },
          },
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

    // MantineProvider's `inherit` replaces the parent's whole `components`
    // object rather than deep-merging it (same note as the Button override
    // above) — the app-level Menu glass styling (mantine.style.ts) doesn't
    // reach a Menu nested inside a glass card without repeating it here.
    // Identical recipe to that root override.
    Menu: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          dropdown: {
            backgroundColor: dark
              ? "rgba(18, 18, 18, 0.6)"
              : "rgba(255, 255, 255, 0.55)",
            backdropFilter: "blur(22px) saturate(160%)",
            WebkitBackdropFilter: "blur(22px) saturate(160%)",
            border: `1px solid ${dark ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.5)"}`,
            boxShadow: dark
              ? "0 24px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
              : "0 24px 60px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
          },
          item: {
            color: dark ? theme.white : theme.black,
            "&:hover": {
              backgroundColor: dark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.35)",
            },
          },
          itemIcon: {
            color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
          },
          divider: {
            borderColor: dark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(0, 0, 0, 0.1)",
          },
          label: {
            color: dark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.45)",
          },
        };
      },
    },

    // Generic translucent surface for chrome outside the transfer card
    // itself — account-settings sections and admin panel cards. Not used
    // by the transfer card (it builds its own glass box directly in
    // SplitTransferLayout rather than via Paper).
    Paper: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          root: {
            background: dark
              ? "linear-gradient(160deg, rgba(255, 255, 255, 0.12) 0%, rgba(18, 18, 18, 0.26) 60%, rgba(255, 255, 255, 0.05) 100%)"
              : "linear-gradient(160deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.3) 60%, rgba(255, 255, 255, 0.4) 100%)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            border: `1px solid ${dark ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.5)"}`,
          },
        };
      },
    },

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

    Switch: {
      styles: (theme: any) => {
        const dark = theme.colorScheme === "dark";
        return {
          track: {
            backgroundColor: dark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(255, 255, 255, 0.45)",
            borderColor: dark
              ? "rgba(255, 255, 255, 0.22)"
              : "rgba(255, 255, 255, 0.6)",
          },
          label: {
            color: dark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.75)",
          },
          description: {
            color: dark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
          },
        };
      },
    },
  },
};

export default glassFormTheme;
