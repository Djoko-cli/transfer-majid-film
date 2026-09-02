// Used to be admin-configurable (general.appName) — now a fixed constant,
// like the accent color and radius in mantine.style.ts. Changing it ships
// through a normal build/deploy instead of the admin UI.
export const APP_NAME = "Transfer";

// Linked from the admin panel's version memo (AdminNavBar) so checking
// whether the running build is current is one click away.
export const RELEASES_URL =
  "https://github.com/Djoko-cli/transfer-majid-film/releases";
