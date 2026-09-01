import { createContext, useContext } from "react";

export type TermsAcceptanceHook = {
  hasAcceptedTerms: boolean;
  acceptTerms: () => void;
};

// Deliberately not localStorage (see _app.tsx's own read/write of this) -
// a cookie is what lets a *returning* visitor's very first server-rendered
// byte already reflect their prior choice, instead of every full page load
// briefly showing the terms gate again until client JS catches up.
export const TermsAcceptanceContext = createContext<TermsAcceptanceHook>({
  hasAcceptedTerms: false,
  acceptTerms: () => {},
});

const useTermsAcceptance = () => {
  return useContext(TermsAcceptanceContext);
};

export default useTermsAcceptance;
