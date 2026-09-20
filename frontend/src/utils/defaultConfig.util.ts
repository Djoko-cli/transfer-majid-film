import Config from "../types/config.type";

export function getDefaultConfig(): Config[] {
  return [
    {
      key: "general.defaultLanguage",
      value: "fr-FR",
      defaultValue: "fr-FR",
      type: "string",
    },
    {
      key: "general.appUrl",
      value: "http://localhost:3000",
      defaultValue: "http://localhost:3000",
      type: "string",
    },
    {
      key: "share.allowRegistration",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "share.allowUnauthenticatedShares",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "share.requireEmailVerificationForAnonymousShares",
      value: "true",
      defaultValue: "true",
      type: "boolean",
    },
    {
      key: "share.enableUserRecipients",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      // Header.tsx reads this unconditionally on every page, signed in or
      // not — this fallback is what an SSR request hits when /api/configs
      // times out, and config.service.ts's get() throws on a key that
      // isn't here at all, which would otherwise take the whole site down
      // with it rather than just this one nav entry.
      key: "share.enableReverseShares",
      value: "true",
      defaultValue: "true",
      type: "boolean",
    },
    {
      key: "share.enableNasImport",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "share.maxExpiration",
      value: "30 days",
      defaultValue: "30 days",
      type: "timespan",
    },
    {
      key: "share.defaultExpiration",
      value: "3 days",
      defaultValue: "3 days",
      type: "timespan",
    },
    {
      key: "share.shareIdLength",
      value: "8",
      defaultValue: "8",
      type: "number",
    },
    {
      key: "share.maxSize",
      value: "15000000000",
      defaultValue: "15000000000",
      type: "filesize",
    },
    {
      key: "share.chunkSize",
      value: "10000000",
      defaultValue: "10000000",
      type: "filesize",
    },
    {
      key: "email.enableShareEmailRecipients",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "smtp.enabled",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "legal.enabled",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    { key: "legal.imprintText", value: "", defaultValue: "", type: "text" },
    { key: "legal.termsText", value: "", defaultValue: "", type: "text" },
    {
      key: "legal.privacyPolicyText",
      value: "",
      defaultValue: "",
      type: "text",
    },
  ];
}
