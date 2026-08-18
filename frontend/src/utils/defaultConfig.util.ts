import Config from "../types/config.type";

export function getDefaultConfig(): Config[] {
  return [
    {
      key: "general.appName",
      value: "Transfer",
      defaultValue: "Transfer",
      type: "string",
    },
    {
      key: "general.showHomePage",
      value: "true",
      defaultValue: "true",
      type: "boolean",
    },
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
      value: "1000000000",
      defaultValue: "1000000000",
      type: "filesize",
    },
    {
      key: "share.chunkSize",
      value: "10000000",
      defaultValue: "10000000",
      type: "filesize",
    },
    {
      key: "share.autoOpenShareModal",
      value: "false",
      defaultValue: "false",
      type: "boolean",
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
    { key: "legal.imprintUrl", value: "", defaultValue: "", type: "string" },
    {
      key: "legal.privacyPolicyText",
      value: "",
      defaultValue: "",
      type: "text",
    },
    {
      key: "legal.privacyPolicyUrl",
      value: "",
      defaultValue: "",
      type: "string",
    },
  ];
}
