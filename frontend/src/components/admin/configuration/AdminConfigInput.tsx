import {
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  AdminConfig,
  AdminConfigGroupedByCategory,
  UpdateConfig,
} from "../../../types/config.type";
import { stringToTimespan, timespanToString } from "../../../utils/date.util";
import FileSizeInput from "../../core/FileSizeInput";
import TimespanInput from "../../core/TimespanInput";
import { LOCALES } from "../../../i18n/locales";
import useTranslate from "../../../hooks/useTranslate.hook";

const AdminConfigInput = ({
  configVariable,
  updateConfigVariable,
  allConfigVariables,
  updatedConfigVariables,
  optionalConfigVariables,
}: {
  configVariable: AdminConfig;
  updateConfigVariable: (variable: UpdateConfig) => void;
  allConfigVariables?: AdminConfig[];
  updatedConfigVariables?: UpdateConfig[];
  optionalConfigVariables?: AdminConfig[];
}) => {
  const t = useTranslate();
  const isDefaultLanguageConfig =
    configVariable.key === "general.defaultLanguage";
  const isInfectedFileActionConfig =
    configVariable.key === "clamav.infectedFileAction";
  const isEmailShareConfig =
    configVariable.key === "email.enableShareEmailRecipients";
  const isEmailVerificationConfig =
    configVariable.key === "email.enableEmailVerification";
  let isSmtpEnabled = false;

  if (isEmailShareConfig || isEmailVerificationConfig) {
    isSmtpEnabled =
      optionalConfigVariables?.find((config) => config.key === "smtp.enabled")
        ?.value === "true";
  }

  const form = useForm({
    initialValues: {
      stringValue: configVariable.value ?? configVariable.defaultValue,
      textValue: configVariable.value ?? configVariable.defaultValue,
      numberValue: parseInt(
        configVariable.value ?? configVariable.defaultValue,
      ),
      booleanValue:
        (configVariable.value ?? configVariable.defaultValue) == "true",
    },
  });

  const onValueChange = (configVariable: AdminConfig, value: any) => {
    form.setFieldValue(`${configVariable.type}Value`, value);
    updateConfigVariable({ key: configVariable.key, value: value });
  };

  const languages = Object.values(LOCALES).map((locale) => ({
    value: locale.code,
    label: locale.name,
  }));

  return (
    <Stack align="end">
      {configVariable.type == "string" &&
        (configVariable.obscured ? (
          <PasswordInput
            autoComplete="new-password"
            style={{
              width: "100%",
            }}
            disabled={!configVariable.allowEdit}
            {...form.getInputProps("stringValue")}
            onChange={(e) => onValueChange(configVariable, e.target.value)}
          />
        ) : isDefaultLanguageConfig ? (
          <Select
            style={{
              width: "100%",
            }}
            disabled={!configVariable.allowEdit}
            data={languages}
            value={form.values.stringValue}
            placeholder={configVariable.defaultValue}
            onChange={(value) => onValueChange(configVariable, value ?? "")}
            searchable
            allowDeselect={false}
          />
        ) : isInfectedFileActionConfig ? (
          <Select
            style={{
              width: "100%",
            }}
            disabled={!configVariable.allowEdit}
            data={[
              {
                value: "delete",
                label: t("admin.config.clamav.infected-file-action.delete"),
              },
              {
                value: "quarantine",
                label: t("admin.config.clamav.infected-file-action.quarantine"),
              },
            ]}
            value={form.values.stringValue}
            placeholder={configVariable.defaultValue}
            onChange={(value) => onValueChange(configVariable, value ?? "")}
            allowDeselect={false}
          />
        ) : (
          <TextInput
            style={{
              width: "100%",
            }}
            disabled={!configVariable.allowEdit}
            {...form.getInputProps("stringValue")}
            placeholder={configVariable.defaultValue}
            onChange={(e) => onValueChange(configVariable, e.target.value)}
          />
        ))}

      {configVariable.type == "text" && (
        <Textarea
          style={{
            width: "100%",
          }}
          disabled={!configVariable.allowEdit}
          autosize
          {...form.getInputProps("textValue")}
          placeholder={configVariable.defaultValue}
          onChange={(e) => onValueChange(configVariable, e.target.value)}
        />
      )}
      {configVariable.type == "number" && (
        <NumberInput
          {...form.getInputProps("numberValue")}
          disabled={!configVariable.allowEdit}
          placeholder={configVariable.defaultValue}
          onChange={(number) => onValueChange(configVariable, number)}
          w={201}
        />
      )}
      {configVariable.type == "filesize" && (
        <FileSizeInput
          {...form.getInputProps("numberValue")}
          disabled={!configVariable.allowEdit}
          value={parseInt(configVariable.value ?? configVariable.defaultValue)}
          onChange={(bytes) => onValueChange(configVariable, bytes)}
          w={201}
        />
      )}
      {configVariable.type == "boolean" &&
        (isEmailShareConfig || isEmailVerificationConfig) && (
          <>
            <Switch
              disabled={!isSmtpEnabled}
              {...form.getInputProps("booleanValue", { type: "checkbox" })}
              onChange={(e) => onValueChange(configVariable, e.target.checked)}
            />
          </>
        )}
      {configVariable.type == "boolean" &&
        !(isEmailShareConfig || isEmailVerificationConfig) && (
          <>
            <Switch
              disabled={!configVariable.allowEdit}
              {...form.getInputProps("booleanValue", { type: "checkbox" })}
              onChange={(e) => onValueChange(configVariable, e.target.checked)}
            />
          </>
        )}
      {configVariable.type == "timespan" && (
        <TimespanInput
          value={stringToTimespan(configVariable.value)}
          disabled={!configVariable.allowEdit}
          min={configVariable.key === "share.fileRetentionPeriod" ? -1 : 0}
          onChange={(timespan) =>
            onValueChange(configVariable, timespanToString(timespan))
          }
          w={201}
        />
      )}
    </Stack>
  );
};

export default AdminConfigInput;
