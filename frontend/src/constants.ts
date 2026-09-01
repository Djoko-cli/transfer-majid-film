// Used to be admin-configurable (general.appName) — now a fixed constant,
// like the accent color and radius in mantine.style.ts. Changing it ships
// through a normal build/deploy instead of the admin UI.
export const APP_NAME = "Transfer";

// Navbar's "Contact" link (mailto:) — same reasoning as APP_NAME above,
// a fixed constant rather than a config setting.
export const CONTACT_EMAIL = "transfer@majid.film";
