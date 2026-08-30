import { getCookie } from "cookies-next";
import * as jose from "jose";
import api from "./api.service";

const signIn = async (
  emailOrUsername: string,
  password: string,
  rememberDevice = false,
) => {
  const emailOrUsernameBody = emailOrUsername.includes("@")
    ? { email: emailOrUsername }
    : { username: emailOrUsername };

  const response = await api.post("auth/signIn", {
    ...emailOrUsernameBody,
    password,
    rememberDevice,
  });

  return response;
};

const signInTotp = (
  totp: string,
  loginToken: string,
  rememberDevice = false,
) => {
  return api.post("auth/signIn/totp", {
    totp,
    loginToken,
    rememberDevice,
  });
};

// Read-only recognition check — a sign-in page mount effect, never mutates
// anything. See signInTrusted below for the actual one-click sign-in.
const getTrustedDevice = async (): Promise<
  { recognized: false } | { recognized: true; username: string }
> => {
  return (await api.get("/auth/trustedDevice")).data;
};

const signInTrusted = () => {
  return api.post("/auth/signIn/trusted");
};

const forgetTrustedDevice = async () => {
  await api.post("/auth/trustedDevice/forget");
};

const signUp = async (email: string, username: string, password: string) => {
  const response = await api.post("auth/signUp", { email, username, password });

  return response;
};

const signOut = async () => {
  const response = await api.post("/auth/signOut");

  if (URL.canParse(response.data?.redirectURI))
    window.location.href = response.data.redirectURI;
  else window.location.reload();
};

const refreshAccessToken = async () => {
  try {
    const accessToken = getCookie("access_token") as string;

    // If the access token expires in less than 2 minutes refresh it
    if (
      accessToken &&
      (jose.decodeJwt(accessToken).exp ?? 0) * 1000 < Date.now() + 2 * 60 * 1000
    ) {
      await api.post("/auth/token");
    }
  } catch (e) {
    console.info("Refresh token invalid or expired");
  }
};

const requestResetPassword = async (email: string) => {
  await api.post(`/auth/resetPassword/${email}`);
};

const resetPassword = async (token: string, password: string) => {
  await api.post("/auth/resetPassword", { token, password });
};

const verifyAccount = async (token: string) => {
  await api.post(`/auth/verify`, { token });
};

// The link-click endpoint above and this one activate via the same
// underlying token — this one just takes it as a typed code, scoped to the
// email it was sent to, so a wrong guess is rate-limited per account.
const verifyAccountByCode = async (email: string, code: string) => {
  await api.post("/auth/verify/code", { email, code });
};

const resendVerification = async (email: string) => {
  await api.post("/auth/verify/resend", { email });
};

const updatePassword = async (oldPassword: string, password: string) => {
  await api.patch("/auth/password", { oldPassword, password });
};

const enableTOTP = async (password: string) => {
  const { data } = await api.post("/auth/totp/enable", { password });

  return {
    totpAuthUrl: data.totpAuthUrl,
    totpSecret: data.totpSecret,
    qrCode: data.qrCode,
  };
};

const verifyTOTP = async (totpCode: string, password: string) => {
  await api.post("/auth/totp/verify", {
    code: totpCode,
    password,
  });
};

const disableTOTP = async (totpCode: string, password: string) => {
  await api.post("/auth/totp/disable", {
    code: totpCode,
    password,
  });
};

const needsSetup = async (): Promise<boolean> => {
  return (await api.get("/auth/needsSetup")).data.needsSetup === true;
};

const getAvailableOAuth = async () => {
  return api.get("/oauth/available");
};

const getOAuthStatus = () => {
  return api.get("/oauth/status");
};

export default {
  signIn,
  signInTotp,
  getTrustedDevice,
  signInTrusted,
  forgetTrustedDevice,
  signUp,
  signOut,
  refreshAccessToken,
  updatePassword,
  requestResetPassword,
  resetPassword,
  verifyAccount,
  verifyAccountByCode,
  resendVerification,
  enableTOTP,
  verifyTOTP,
  disableTOTP,
  getAvailableOAuth,
  getOAuthStatus,
  needsSetup,
};
