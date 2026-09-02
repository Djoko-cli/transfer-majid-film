import { SiDiscord, SiGithub, SiGoogle, SiOpenid } from "react-icons/si";
import { FaMicrosoft } from "react-icons/fa";
import React from "react";
import api from "../services/api.service";

const getOAuthUrl = (appUrl: string, provider: string) => {
  return `${appUrl}/api/oauth/auth/${provider}`;
};

// general.appUrl's own *default* value ("http://localhost:3000", never a
// real reachable origin for an actual deployment) means "no real value has
// been configured yet" — falling back to wherever the page is actually
// being served from is the only origin guaranteed to work in that case.
// Shared by SignInForm and SignUpForm's OAuth buttons — same rule either
// way, since both build a URL back to this exact same origin.
const resolveOAuthOrigin = (config: {
  get: (key: string, returnDefault?: boolean) => any;
}) =>
  config.get("general.appUrl") !== config.get("general.appUrl", true)
    ? config.get("general.appUrl")
    : window.location.origin;

const getOAuthIcon = (provider: string) => {
  return {
    google: <SiGoogle />,
    microsoft: <FaMicrosoft />,
    github: <SiGithub />,
    discord: <SiDiscord />,
    oidc: <SiOpenid />,
  }[provider];
};

const unlinkOAuth = (provider: string) => {
  return api.post(`/oauth/unlink/${provider}`);
};

export { getOAuthUrl, getOAuthIcon, unlinkOAuth, resolveOAuthOrigin };
