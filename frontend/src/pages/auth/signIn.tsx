import { LoadingOverlay } from "@mantine/core";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import SignInForm from "../../components/auth/SignInForm";
import Meta from "../../components/Meta";
import authService from "../../services/auth.service";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { redirectPath: context.query.redirect ?? null },
  };
}

const SignIn = ({ redirectPath }: { redirectPath?: string }) => {
  const { refreshUser } = useUser();
  const router = useRouter();
  const t = useTranslate();

  const [isLoading, setIsLoading] = useState(redirectPath ? true : false);
  // Same signal, same reasoning as SignInForm's own recentSignOut state —
  // kept in sync with it so the browser tab and the on-page heading never
  // disagree, exactly as they already did back when both were the same
  // static "signin.title" key.
  const [recentSignOut, setRecentSignOut] = useState(false);

  // If the access token is expired, the middleware redirects to this page.
  // If the refresh token is still valid, the user will be redirected to the last page.
  useEffect(() => {
    refreshUser().then((user) => {
      if (user) {
        router.replace(redirectPath ?? "/");
      } else {
        setIsLoading(false);
      }
    });
    setRecentSignOut(authService.wasRecentlySignedOut());
  }, []);

  if (isLoading) return <LoadingOverlay overlayOpacity={1} visible />;

  return (
    <>
      <Meta
        title={t(
          recentSignOut ? "signin.title.recent-signout" : "signin.title",
        )}
      />
      <SignInForm redirectPath={redirectPath ?? "/"} />
    </>
  );
};
export default SignIn;
