import english from "./translations/en-US";
import french from "./translations/fr-FR";

export interface Locale {
  name: string;
  code: string;
  messages: Record<string, string>;
  direction?: string;
}

// Only the two languages this fork actually maintains. Every other locale
// upstream shipped is a partial, aging translation of the original Pingvin
// Share strings — it doesn't get updated when app text changes here (see
// e.g. the "Custom storage quota" field, ClamAV panel, or any other string
// added this session), so offering it just surfaces a broken mix of stale
// translations and raw English fallback keys.
export const LOCALES: Record<string, Locale> = {
  ENGLISH: {
    name: "English",
    code: "en-US",
    messages: english,
  },
  FRENCH: {
    name: "Français",
    code: "fr-FR",
    messages: french,
  },
};
