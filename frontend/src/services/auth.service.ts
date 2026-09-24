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

// Metadata only — the backend never returns the cookie value itself (see
// TrustedDevice's own comment), so there's nothing here that could be
// replayed even if this response were somehow read by the wrong party.
export type TrustedDevice = {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

// One pair of functions, self vs. admin-on-another-account, backing the
// same list+revoke-all panel in both /account and the admin user modal —
// see TrustedDevicesPanel.
const listOwnTrustedDevices = async (): Promise<TrustedDevice[]> => {
  return (await api.get("/auth/trustedDevice/me")).data;
};

const revokeOwnTrustedDevices = async () => {
  await api.delete("/auth/trustedDevice/me");
};

const listUserTrustedDevices = async (
  userId: string,
): Promise<TrustedDevice[]> => {
  return (await api.get(`/auth/trustedDevice/admin/${userId}`)).data;
};

const revokeUserTrustedDevices = async (userId: string) => {
  await api.delete(`/auth/trustedDevice/admin/${userId}`);
};

const signUp = async (email: string, username: string, password: string) => {
  const response = await api.post("auth/signUp", { email, username, password });

  return response;
};

// Read by the sign-in page (see wasRecentlySignedOut below) to greet
// someone who just chose to leave and is now coming back differently
// from a first-time or long-since visitor. localStorage rather than
// sessionStorage: closing the tab right after signing out and reopening
// the site a few minutes later is still, in spirit, "the person who
// just left" — sessionStorage would have already forgotten them.
const RECENT_SIGN_OUT_KEY = "lastSignOutAt";
const RECENT_SIGN_OUT_WINDOW_MS = 30 * 60 * 1000;

const signOut = async () => {
  try {
    localStorage.setItem(RECENT_SIGN_OUT_KEY, Date.now().toString());
  } catch {
    // Private browsing / storage disabled: the sign-in page just falls
    // back to its default greeting, nothing else depends on this.
  }

  const response = await api.post("/auth/signOut");

  if (URL.canParse(response.data?.redirectURI))
    window.location.href = response.data.redirectURI;
  else window.location.reload();
};

// A session that merely expired (the access and refresh tokens both
// lapsing, or a stale cookie on a device that was never signed out on
// deliberately) never calls signOut, so it never sets the marker above —
// only an actual, chosen "Se déconnecter" does. That's the distinction
// the sign-in page wants: "welcome back" only for someone who really did
// just leave, not for anyone merely bounced here by a dead session.
const wasRecentlySignedOut = (): boolean => {
  try {
    const raw = localStorage.getItem(RECENT_SIGN_OUT_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) <= RECENT_SIGN_OUT_WINDOW_MS;
  } catch {
    return false;
  }
};

// Resolves to whether a fresh access token was actually issued — _app
// uses it to notice a session its server render could not see.
const refreshAccessToken = async (): Promise<boolean> => {
  try {
    const accessToken = getCookie("access_token") as string;

    // If the access token expires in less than 2 minutes refresh it
    if (
      accessToken &&
      (jose.decodeJwt(accessToken).exp ?? 0) * 1000 < Date.now() + 2 * 60 * 1000
    ) {
      await api.post("/auth/token");
      return true;
    }
  } catch (e) {
    console.info("Refresh token invalid or expired");
  }
  return false;
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

// Le mot de passe demandé ici est celui de l'ADMINISTRATEUR qui agit, pas
// celui du compte réinitialisé — un cookie de session volé ne doit pas
// suffire à retirer le second facteur de quelqu'un d'autre.
const resetUserTOTP = async (userId: string, password: string) => {
  await api.post(`/auth/totp/reset/${userId}`, { password });
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
  listOwnTrustedDevices,
  revokeOwnTrustedDevices,
  listUserTrustedDevices,
  revokeUserTrustedDevices,
  signUp,
  signOut,
  wasRecentlySignedOut,
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
  resetUserTOTP,
  getAvailableOAuth,
  getOAuthStatus,
  needsSetup,
};
