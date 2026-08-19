import { Prisma, PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

export const configVariables = {
  internal: {
    jwtSecret: {
      type: "string",
      value: crypto.randomBytes(256).toString("base64"),
      locked: true,
    },
  },
  general: {
    appName: {
      type: "string",
      defaultValue: "Transfer",
      secret: false,
    },
    appUrl: {
      type: "string",
      defaultValue: "http://localhost:3000",
      secret: false,
    },
    secureCookies: {
      type: "boolean",
      defaultValue: "false",
    },
    showHomePage: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    sessionDuration: {
      type: "timespan",
      defaultValue: "3 months",
      secret: false,
    },
    defaultLanguage: {
      type: "string",
      defaultValue: "fr-FR",
      secret: false,
    },
  },
  appearance: {
    themePrimaryColor: {
      type: "string",
      defaultValue: "custom",
      secret: false,
    },
    themePrimaryColorOverride: {
      type: "string",
      defaultValue: "#ff7a00",
      secret: false,
    },
    themeRadius: {
      type: "string",
      defaultValue: "md",
      secret: false,
    },
    themeColorScheme: {
      type: "string",
      defaultValue: "system",
      secret: false,
    },
    customCss: {
      type: "text",
      defaultValue: "",
      secret: false,
    },
    uploadProgressStyle: {
      type: "string",
      defaultValue: "circle",
      secret: false,
    },
  },
  share: {
    allowRegistration: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    allowUnauthenticatedShares: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    requireEmailVerificationForAnonymousShares: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    maxExpiration: {
      type: "timespan",
      defaultValue: "30 days",
      secret: false,
    },
    defaultExpiration: {
      type: "timespan",
      defaultValue: "3 days",
      secret: false,
    },
    shareIdLength: {
      type: "number",
      defaultValue: "8",
      secret: false,
    },
    maxSize: {
      type: "filesize",
      defaultValue: "15000000000",
      secret: false,
    },
    zipCompressionLevel: {
      type: "number",
      defaultValue: "9",
    },
    chunkSize: {
      type: "filesize",
      defaultValue: "10000000",
      secret: false,
    },
    autoOpenShareModal: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    reverseShareSimpleOnly: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    allowAdminAccessAllShares: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    enableUserRecipients: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    fileRetentionPeriod: {
      type: "timespan",
      defaultValue: "0 days",
      secret: false,
    },
  },
  verification: {
    codeSubject: {
      type: "string",
      defaultValue: "Votre code de vérification",
      secret: false,
    },
    codeMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\nVoici votre code de vérification : {code}\n\nIl expire dans 10 minutes. Saisissez-le pour continuer votre transfert.",
      secret: false,
    },
  },
  cache: {
    "redis-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "redis-url": {
      type: "string",
      defaultValue: "redis://pingvin-redis:6379",
      secret: true,
    },
    ttl: {
      type: "number",
      defaultValue: "60",
    },
    maxItems: {
      type: "number",
      defaultValue: "1000",
    },
  },
  email: {
    sendHtmlEmails: {
      type: "boolean",
      defaultValue: "false",
    },
    enableShareEmailRecipients: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    shareRecipientsSubject: {
      type: "string",
      defaultValue: "Des fichiers ont été partagés avec vous",
    },
    shareRecipientsMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\n{creator} ({creatorEmail}) a partagé des fichiers avec vous. Vous pouvez les consulter ou les télécharger via ce lien : {shareUrl}\n\nCe partage expirera {expires}.\n\nNote : {desc}",
    },
    reverseShareSubject: {
      type: "string",
      defaultValue: "Votre lien de dépôt a été utilisé",
    },
    reverseShareMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\nUn partage vient d'être créé avec votre lien de dépôt : {shareUrl}",
    },
    resetPasswordSubject: {
      type: "string",
      defaultValue: "Réinitialisation du mot de passe",
    },
    resetPasswordMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\nVous avez demandé une réinitialisation de mot de passe. Cliquez sur ce lien pour réinitialiser votre mot de passe : {url}\nCe lien expire dans une heure.",
    },
    inviteSubject: {
      type: "string",
      defaultValue: "Vous avez été invité(e)",
    },
    inviteMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\nVous avez été invité(e). Cliquez sur ce lien pour accepter l'invitation : {url}\n\nVous pouvez utiliser l'adresse e-mail « {email} » et le mot de passe « {password} » pour vous connecter.",
    },
    enableShareDownloadNotifications: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    shareRecipientsReplyToCreator: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    shareDownloadNotificationSubject: {
      type: "string",
      defaultValue: "Votre fichier a été téléchargé",
    },
    shareDownloadNotificationMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\n{recipientEmail} a téléchargé {fileName} depuis votre partage : {shareUrl}",
    },
    enableEmailVerification: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    verificationSubject: {
      type: "string",
      defaultValue: "Vérifiez votre compte",
    },
    verificationMessage: {
      type: "text",
      defaultValue:
        "Bonjour !\n\nVous venez de vous inscrire. Cliquez sur ce lien pour vérifier votre compte : {url}\n\nCe lien expire dans 24 heures.",
    },
  },
  smtp: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    allowUnauthorizedCertificates: {
      type: "boolean",
      defaultValue: "false",

      secret: false,
    },
    host: {
      type: "string",
      defaultValue: "",
    },
    port: {
      type: "number",
      defaultValue: "0",
    },
    email: {
      type: "string",
      defaultValue: "",
    },
    username: {
      type: "string",
      defaultValue: "",
    },
    password: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
  },
  ldap: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },

    url: {
      type: "string",
      defaultValue: "",
    },

    bindDn: {
      type: "string",
      defaultValue: "",
    },
    bindPassword: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },

    searchBase: {
      type: "string",
      defaultValue: "",
    },
    searchQuery: {
      type: "string",
      defaultValue: "",
    },

    adminGroups: {
      type: "string",
      defaultValue: "",
    },

    fieldNameMemberOf: {
      type: "string",
      defaultValue: "memberOf",
    },
    fieldNameEmail: {
      type: "string",
      defaultValue: "userPrincipalName",
    },
  },
  oauth: {
    allowRegistration: {
      type: "boolean",
      defaultValue: "true",
    },
    ignoreTotp: {
      type: "boolean",
      defaultValue: "true",
    },
    disablePassword: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    "github-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "github-clientId": {
      type: "string",
      defaultValue: "",
    },
    "github-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "google-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "google-clientId": {
      type: "string",
      defaultValue: "",
    },
    "google-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "microsoft-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "microsoft-tenant": {
      type: "string",
      defaultValue: "common",
    },
    "microsoft-clientId": {
      type: "string",
      defaultValue: "",
    },
    "microsoft-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "discord-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "discord-limitedGuild": {
      type: "string",
      defaultValue: "",
    },
    "discord-limitedUsers": {
      type: "string",
      defaultValue: "",
    },
    "discord-clientId": {
      type: "string",
      defaultValue: "",
    },
    "discord-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    "oidc-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "oidc-discoveryUri": {
      type: "string",
      defaultValue: "",
    },
    "oidc-signOut": {
      type: "boolean",
      defaultValue: "false",
    },
    "oidc-scope": {
      type: "string",
      defaultValue: "openid email profile",
    },
    "oidc-usernameClaim": {
      type: "string",
      defaultValue: "",
    },
    "oidc-rolePath": {
      type: "string",
      defaultValue: "",
    },
    "oidc-roleGeneralAccess": {
      type: "string",
      defaultValue: "",
    },
    "oidc-roleAdminAccess": {
      type: "string",
      defaultValue: "",
    },
    "oidc-clientId": {
      type: "string",
      defaultValue: "",
    },
    "oidc-clientSecret": {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
  },
  s3: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
    },
    endpoint: {
      type: "string",
      defaultValue: "",
    },
    region: {
      type: "string",
      defaultValue: "",
    },
    bucketName: {
      type: "string",
      defaultValue: "",
    },
    bucketPath: {
      type: "string",
      defaultValue: "",
    },
    key: {
      type: "string",
      defaultValue: "",
      secret: true,
    },
    secret: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
    useChecksum: {
      type: "boolean",
      defaultValue: "true",
    },
  },
  legal: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    imprintText: {
      type: "text",
      defaultValue: "",
      secret: false,
    },
    imprintUrl: {
      type: "string",
      defaultValue: "",
      secret: false,
    },
    privacyPolicyText: {
      type: "text",
      defaultValue: "",
      secret: false,
    },
    privacyPolicyUrl: {
      type: "string",
      defaultValue: "",
      secret: false,
    },
  },
} satisfies ConfigVariables;

export type YamlConfig = {
  [Category in keyof typeof configVariables]: {
    [Key in keyof (typeof configVariables)[Category]]: string;
  };
} & {
  initUser: {
    enabled: string;
    username: string;
    email: string;
    password: string;
    isAdmin: boolean;
    ldapDN: string;
  };
};

type ConfigVariables = {
  [category: string]: {
    [variable: string]: Omit<
      Prisma.ConfigCreateInput,
      "name" | "category" | "order"
    >;
  };
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "file:../data/pingvin-share.db?connection_limit=1",
    },
  },
});

async function seedConfigVariables() {
  for (const [category, configVariablesOfCategory] of Object.entries(
    configVariables,
  )) {
    let order = 0;
    for (const [name, properties] of Object.entries(
      configVariablesOfCategory,
    )) {
      const existingConfigVariable = await prisma.config.findUnique({
        where: { name_category: { name, category } },
      });

      // Create a new config variable if it doesn't exist
      if (!existingConfigVariable) {
        await prisma.config.create({
          data: {
            order,
            name,
            ...properties,
            category,
          },
        });
      }
      order++;
    }
  }
}

async function migrateConfigVariables() {
  const existingConfigVariables = await prisma.config.findMany();
  const orderMap: { [category: string]: number } = {};

  for (const existingConfigVariable of existingConfigVariables) {
    const configVariable =
      configVariables[existingConfigVariable.category]?.[
        existingConfigVariable.name
      ];

    // Delete the config variable if it doesn't exist in the seed
    if (!configVariable) {
      await prisma.config.delete({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
      });

      // Update the config variable if it exists in the seed
    } else {
      const variableOrder = Object.keys(
        configVariables[existingConfigVariable.category],
      ).indexOf(existingConfigVariable.name);
      await prisma.config.update({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
        data: {
          ...configVariable,
          name: existingConfigVariable.name,
          category: existingConfigVariable.category,
          value: existingConfigVariable.value,
          order: variableOrder,
        },
      });
      orderMap[existingConfigVariable.category] = variableOrder + 1;
    }
  }
}

seedConfigVariables()
  .then(() => migrateConfigVariables())
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
