import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import useConfig from "./config.hook";
import authService from "../services/auth.service";
import { getOAuthUrl, resolveOAuthOrigin } from "../utils/oauth.util";
import toast from "../utils/toast.util";

// Shared by SignInForm and SignUpForm — both end up at the exact same
// backend flow regardless of which page sent the visitor there (see
// OAuthService.signIn falling through to its own signUp for a provider
// account it's never seen before), so which providers are enabled, and
// whether to skip straight to the one available provider rather than
// show a button for it (only when password auth is off entirely — with
// it still on, a bare form with no explanation of what's happening would
// be worse than one extra click), only needs figuring out once.
const useOAuthProviders = () => {
  const config = useConfig();
  const router = useRouter();
  const [oauthProviders, setOauthProviders] = useState<string[] | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    authService
      .getAvailableOAuth()
      .then((providers) => {
        setOauthProviders(providers.data);
        if (
          providers.data.length === 1 &&
          config.get("oauth.disablePassword")
        ) {
          setIsRedirecting(true);
          router.push(
            getOAuthUrl(resolveOAuthOrigin(config), providers.data[0]),
          );
        }
      })
      .catch(toast.axiosError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { oauthProviders, isRedirecting };
};

export default useOAuthProviders;
