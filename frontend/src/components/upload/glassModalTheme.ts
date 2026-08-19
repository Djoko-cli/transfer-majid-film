// Styles for the two modals that appear mid-journey in the anonymous
// upload flow (email verification, completed-share) — passed directly into
// their own `modals.openModal({ styles: glassModalStyles, ... })` calls,
// not the app-wide theme. Mantine's ModalsProvider renders modal content at
// the app root, outside TransferCard's own scoped glass provider, so
// without this the flow would visually break from glass card to a flat
// default modal and back. Every other modal in the app (admin, auth,
// account) is unaffected — this only applies where it's explicitly passed.
export const glassModalStyles = (theme: any) => {
  const dark = theme.colorScheme === "dark";
  return {
    content: {
      background: dark
        ? "linear-gradient(160deg, rgba(255, 255, 255, 0.14) 0%, rgba(18, 18, 18, 0.72) 55%, rgba(255, 255, 255, 0.06) 100%)"
        : "linear-gradient(160deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.5) 55%, rgba(255, 255, 255, 0.6) 100%)",
      backdropFilter: "blur(22px) saturate(160%)",
      WebkitBackdropFilter: "blur(22px) saturate(160%)",
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.5)"}`,
      boxShadow: dark
        ? "0 24px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
        : "0 24px 60px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
    },
    header: {
      backgroundColor: "transparent",
    },
    title: {
      color: dark ? theme.white : theme.black,
    },
    close: {
      color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
      "&:hover": {
        backgroundColor: dark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(255, 255, 255, 0.35)",
      },
    },
    overlay: {
      backdropFilter: "blur(3px)",
    },
  };
};
