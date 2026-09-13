import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { TbAlertTriangle, TbInfoCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../../components/Meta";
import AdminConfigInput from "../../../components/admin/configuration/AdminConfigInput";
import ClamavPanel from "../../../components/admin/clamav/ClamavPanel";
import LegalContentEditor from "../../../components/admin/legal/LegalContentEditor";
import TestEmailButton from "../../../components/admin/configuration/TestEmailButton";
import TestRedisButton from "../../../components/admin/configuration/TestRedisButton";
import AdminLayout from "../../../components/admin/AdminLayout";
import CenterLoader from "../../../components/core/CenterLoader";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import configService from "../../../services/config.service";
import { AdminConfig, UpdateConfig } from "../../../types/config.type";
import { NextPageWithLayout } from "../../../types/page.type";
import { camelToKebab } from "../../../utils/string.util";
import { getOAuthIcon } from "../../../utils/oauth.util";
import toast from "../../../utils/toast.util";

const categories = [
  "General",
  "Email",
  "Share",
  "Verification",
  "SMTP",
  "OAuth",
  "LDAP",
  "S3",
  "Legal",
  "Cache",
  "Clamav",
  "Performance",
];

// Every OAuth provider this app supports (see oauth.util.tsx's own
// getOAuthIcon, and the backend's oauth config seed, which is the actual
// source of truth for what "<provider>-*" keys can exist) — used only to
// visually group the OAuth category's config rows below, one card per
// provider, instead of one long undifferentiated list. Order here is the
// order the cards render in.
const OAUTH_PROVIDERS = ["github", "google", "microsoft", "discord", "oidc"];

// A config key arrives as the full dotted key (e.g. "oauth.github-enabled",
// "oauth.allowRegistration") — this maps it to the provider it belongs to,
// or undefined for the category's own general settings (allowRegistration,
// ignoreTotp, disablePassword) that aren't tied to any one provider.
// Matches on the key's local part (after the category prefix) rather than
// a hardcoded per-provider field list, so a provider gaining or losing a
// field on the backend never needs a matching update here.
const getOAuthProviderForKey = (key: string): string | undefined => {
  const localKey = key.split(".").slice(1).join(".");
  return OAUTH_PROVIDERS.find((provider) =>
    localKey.startsWith(`${provider}-`),
  );
};

const AdminConfigPage: NextPageWithLayout = () => {
  const router = useRouter();
  const t = useTranslate();

  const isMobile = useMediaQuery("(max-width: 560px)");
  const config = useConfig();

  let categoryId = "General";
  if (
    router.query.category &&
    !categories.includes(router.query.category as string)
  ) {
    categoryId = router.query.category as string;
  }

  const [configVariables, setConfigVariables] = useState<AdminConfig[]>();
  const [updatedConfigVariables, setUpdatedConfigVariables] = useState<
    UpdateConfig[]
  >([]);
  const [optionalConfigVariables, setOptionalConfigVariables] =
    useState<AdminConfig[]>();

  const saveConfigVariables = async () => {
    if (updatedConfigVariables.length > 0) {
      await configService
        .updateMany(updatedConfigVariables)
        .then(async () => {
          setUpdatedConfigVariables([]);
          // Re-fetched rather than patched in place from the response:
          // mirrorWriteError reflects the shared state of one file
          // (config.yaml or secrets.env), not a per-variable property, so
          // patching only the rows that were actually edited could leave
          // an untouched row on this same page showing a stale success
          // or failure state until the next full page load.
          setConfigVariables(await configService.getByCategory(categoryId));
          toast.success(t("admin.config.notify.success"));
        })
        .catch(toast.axiosError);
      void config.refresh();
    } else {
      toast.success(t("admin.config.notify.no-changes"));
    }
  };

  const updateConfigVariable = (configVariable: UpdateConfig) => {
    if (configVariable.key === "general.appUrl") {
      // Always a real string at runtime — general.appUrl is a "string"
      // -type config field, guarded by the key check above; UpdateConfig
      // .value only widened to string | number | boolean for boolean
      // fields elsewhere (see its own comment).
      configVariable.value = sanitizeUrl(configVariable.value as string);
    }

    const index = updatedConfigVariables.findIndex(
      (item) => item.key === configVariable.key,
    );

    if (index > -1) {
      updatedConfigVariables[index] = {
        ...updatedConfigVariables[index],
        ...configVariable,
      };
    } else {
      setUpdatedConfigVariables([...updatedConfigVariables, configVariable]);
    }
  };

  const sanitizeUrl = (url: string): string => {
    return url.endsWith("/") ? url.slice(0, -1) : url;
  };

  // One config field's row (label + description on the left, its input on
  // the right) — factored out so the OAuth category below can reuse the
  // exact same row inside its per-provider cards instead of duplicating
  // this layout, while every other category keeps rendering it flat,
  // unchanged from before this function existed.
  const renderConfigRow = (
    configVariable: AdminConfig,
    allConfigVariables: AdminConfig[],
  ) => {
    // On a phone every control dropped onto its own full-width line below the
    // label, which is right for a text field, a number or a select — they need
    // the room. A switch does not: it is 40px wide, so it landed alone on a
    // line of its own, far right, separated from the words it belongs to by
    // the whole width of the screen. Reported as confusing, and it is: nothing
    // visually ties the toggle to the setting it toggles.
    //
    // Toggles come back onto the label's line, pinned right, which is the
    // shape every settings screen on a phone uses. Everything else keeps the
    // stacked layout, and the desktop two-column layout is untouched.
    const inlineToggle = isMobile && configVariable.type === "boolean";

    return (
      <Group
        key={configVariable.key}
        position="apart"
        noWrap={inlineToggle}
        align={inlineToggle ? "center" : undefined}
      >
        <Stack
          style={{
            maxWidth: isMobile ? "100%" : "40%",
            // flex so the words take the room the switch does not, minWidth
            // so a long description wraps instead of pushing the switch off
            // the edge — a flex item's default minimum is its content size.
            ...(inlineToggle ? { flex: 1, minWidth: 0 } : {}),
          }}
          spacing={0}
        >
          <Title order={6}>
            <FormattedMessage
              id={`admin.config.${camelToKebab(configVariable.key)}`}
            />
          </Title>

          <Text
            sx={{
              whiteSpace: "pre-line",
            }}
            color="dimmed"
            size="sm"
            mb="xs"
          >
            <FormattedMessage
              id={`admin.config.${camelToKebab(configVariable.key)}.description`}
              values={{ br: <br /> }}
            />
          </Text>
        </Stack>
        {/* A spacer that only earns its place in the two-column desktop
            layout; inline it would push the switch off the right edge. */}
        {!inlineToggle && <Stack></Stack>}
        <Box
          style={{
            width: inlineToggle ? "auto" : isMobile ? "100%" : "50%",
            flexShrink: 0,
          }}
        >
          <AdminConfigInput
            key={configVariable.key}
            configVariable={configVariable}
            updateConfigVariable={updateConfigVariable}
            allConfigVariables={allConfigVariables}
            updatedConfigVariables={updatedConfigVariables}
            optionalConfigVariables={optionalConfigVariables}
          />
        </Box>
      </Group>
    );
  };

  useEffect(() => {
    configService.getByCategory(categoryId).then((configVariables) => {
      setConfigVariables(configVariables);
    });

    if (categoryId === "email") {
      configService.getByCategory("smtp").then((smtpConfigVariables) => {
        const optionalConfigVariables = smtpConfigVariables.filter(
          (configVariable) => {
            if (configVariable.key === "smtp.enabled") {
              return configVariable;
            }
          },
        );
        setOptionalConfigVariables(optionalConfigVariables);
      });
    }
  }, [categoryId]);

  return (
    <>
      <Meta title={t("admin.config.title")} />
      <Container size="lg">
        {!configVariables ? (
          <CenterLoader />
        ) : (
          <>
            {(() => {
              return (
                <Box
                  key={categoryId}
                  sx={{
                    animation:
                      "adminContentFadeIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <Stack>
                    {configVariables[0]?.mirroredToFile && (
                      <Alert
                        mb={"lg"}
                        variant="light"
                        color="primary"
                        title={t("admin.config.config-file-sync.title")}
                        icon={<TbInfoCircle />}
                      >
                        <FormattedMessage id="admin.config.config-file-sync.description" />
                      </Alert>
                    )}
                    {configVariables.some((cv) => cv.mirroredToSecretsFile) && (
                      <Alert
                        mb={"lg"}
                        variant="light"
                        color="primary"
                        title={t("admin.config.secrets-file-sync.title")}
                        icon={<TbInfoCircle />}
                      >
                        <FormattedMessage id="admin.config.secrets-file-sync.description" />
                      </Alert>
                    )}
                    {configVariables.some((cv) => cv.mirrorWriteError) && (
                      <Alert
                        mb={"lg"}
                        variant="light"
                        color="red"
                        title={t("admin.config.file-sync-failed.title")}
                        icon={<TbAlertTriangle />}
                      >
                        <FormattedMessage
                          id="admin.config.file-sync-failed.description"
                          values={{
                            error: configVariables.find(
                              (cv) => cv.mirrorWriteError,
                            )?.mirrorWriteError,
                          }}
                        />
                      </Alert>
                    )}
                    <Title
                      mb={categoryId.toLowerCase() === "s3" ? "xs" : "md"}
                      order={3}
                    >
                      {t("admin.config.category." + categoryId)}
                    </Title>
                    {categoryId.toLowerCase() === "s3" && (
                      <Text color="dimmed" size="sm" mb="md">
                        <FormattedMessage
                          id="admin.config.s3.docs-link"
                          values={{
                            wikiLink: (
                              <Anchor
                                href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                AWS S3 CORS documentation
                              </Anchor>
                            ),
                          }}
                        />
                      </Text>
                    )}
                    {categoryId.toLowerCase() === "oauth"
                      ? (() => {
                          // Every field here used to render as one flat,
                          // undifferentiated list — general settings and
                          // five providers' worth of enabled/clientId/
                          // clientSecret/etc. fields all in a row with
                          // nothing to tell an admin where one provider's
                          // settings end and the next begin. Splitting into
                          // the category's own general settings (unchanged,
                          // flat) plus one bordered, icon-labeled card per
                          // provider gives each provider real visual
                          // identity instead.
                          const globalFields = configVariables.filter(
                            (cv) => !getOAuthProviderForKey(cv.key),
                          );
                          const providerGroups = OAUTH_PROVIDERS.map(
                            (provider) => ({
                              provider,
                              fields: configVariables.filter(
                                (cv) =>
                                  getOAuthProviderForKey(cv.key) === provider,
                              ),
                            }),
                          ).filter((group) => group.fields.length > 0);

                          return (
                            <>
                              {globalFields.map((configVariable) =>
                                renderConfigRow(
                                  configVariable,
                                  configVariables,
                                ),
                              )}
                              {providerGroups.map(({ provider, fields }) => (
                                <Card
                                  key={provider}
                                  withBorder
                                  radius="md"
                                  p="md"
                                >
                                  <Stack>
                                    <Group spacing="xs">
                                      <ThemeIcon variant="light">
                                        {getOAuthIcon(provider)}
                                      </ThemeIcon>
                                      <Title order={5}>
                                        {t(`signIn.oauth.${provider}`)}
                                      </Title>
                                    </Group>
                                    {fields.map((configVariable) =>
                                      renderConfigRow(
                                        configVariable,
                                        configVariables,
                                      ),
                                    )}
                                  </Stack>
                                </Card>
                              ))}
                            </>
                          );
                        })()
                      : categoryId.toLowerCase() === "legal"
                        ? (() => {
                            // legal.enabled stays a normal 50/50 row; the
                            // two long-form text fields get the
                            // split-pane editor below instead of
                            // AdminConfigInput's plain Textarea - see
                            // LegalContentEditor's own comment for why.
                            const enabledVariable = configVariables.find(
                              (cv) => cv.key === "legal.enabled",
                            );
                            const textVariables = configVariables.filter(
                              (cv) => cv.key !== "legal.enabled",
                            );
                            return (
                              <>
                                {enabledVariable &&
                                  renderConfigRow(
                                    enabledVariable,
                                    configVariables,
                                  )}
                                {textVariables.map((configVariable) => (
                                  <Stack key={configVariable.key} spacing={4}>
                                    <Title order={6}>
                                      <FormattedMessage
                                        id={`admin.config.${camelToKebab(configVariable.key)}`}
                                      />
                                    </Title>
                                    <Text color="dimmed" size="sm" mb="xs">
                                      <FormattedMessage
                                        id={`admin.config.${camelToKebab(configVariable.key)}.description`}
                                      />
                                    </Text>
                                    <LegalContentEditor
                                      initialValue={
                                        configVariable.value ??
                                        configVariable.defaultValue
                                      }
                                      placeholder={configVariable.defaultValue}
                                      disabled={!configVariable.allowEdit}
                                      onChange={(value) =>
                                        updateConfigVariable({
                                          key: configVariable.key,
                                          value,
                                        })
                                      }
                                    />
                                  </Stack>
                                ))}
                              </>
                            );
                          })()
                        : configVariables.map((configVariable) =>
                            renderConfigRow(configVariable, configVariables),
                          )}
                    {categoryId == "clamav" && <ClamavPanel />}
                  </Stack>
                </Box>
              );
            })()}
            <Group mt="lg" position="right">
              {categoryId == "smtp" && (
                <TestEmailButton
                  configVariablesChanged={updatedConfigVariables.length != 0}
                  saveConfigVariables={saveConfigVariables}
                />
              )}
              {categoryId == "cache" && (
                <TestRedisButton
                  configVariablesChanged={updatedConfigVariables.length != 0}
                  saveConfigVariables={saveConfigVariables}
                />
              )}
              <Button onClick={saveConfigVariables}>
                <FormattedMessage id="common.button.save" />
              </Button>
            </Group>
          </>
        )}
      </Container>
    </>
  );
};

AdminConfigPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>;

export default AdminConfigPage;
