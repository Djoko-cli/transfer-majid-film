import { createContext, useContext } from "react";

export type LanguageHook = {
  language: string;
  switchLanguage: (code: string) => void;
};

// The active language as live React state in _app.tsx, not a ref — see
// its own switchLanguage for why: this needs a real re-render (IntlProvider
// picking up the new messages/locale) so switching language no longer has
// to reload the whole page to take effect, which used to discard whatever
// was in progress elsewhere on the page (e.g. files already added to the
// upload dropzone — the exact complaint that prompted this).
export const LanguageContext = createContext<LanguageHook>({
  language: "en-US",
  switchLanguage: () => {},
});

const useLanguage = () => {
  return useContext(LanguageContext);
};

export default useLanguage;
