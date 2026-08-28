import SignUpForm from "../../components/auth/SignUpForm";
import Meta from "../../components/Meta";
import useTranslate from "../../hooks/useTranslate.hook";

const SignUp = ({ needsSetup }: { needsSetup?: boolean }) => {
  const t = useTranslate();
  return (
    <>
      <Meta title={t(needsSetup ? "signup.onboarding.title" : "signup.title")} />
      <SignUpForm needsSetup={needsSetup} />
    </>
  );
};
export default SignUp;
