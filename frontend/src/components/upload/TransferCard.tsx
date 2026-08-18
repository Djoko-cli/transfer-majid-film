import {
  Accordion,
  Alert,
  Box,
  Button,
  Checkbox,
  MantineProvider,
  MultiSelect,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import glassFormTheme from "./glassFormTheme";
import { useForm, yupResolver } from "@mantine/form";
import moment from "moment";
import React, { useEffect, useState } from "react";
import { TbAlertCircle, TbChevronDown, TbChevronUp } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileUpload } from "../../types/File.type";
import { CreateShare } from "../../types/share.type";
import { Timespan } from "../../types/timespan.type";
import { getExpirationPreview } from "../../utils/date.util";
import { generateShareId } from "../../utils/share.util";
import CustomUrlInput from "../share/CustomUrlInput";
import Dropzone from "./Dropzone";
import FileList from "./FileList";

type Mode = "email" | "link";

const TransferCard = ({
  files,
  isUploading,
  maxShareSize,
  currentFilesSize,
  onFilesChanged,
  setFiles,
  onSubmit,
  isUserSignedIn,
  appUrl,
  defaultAppUrl,
  enableEmailRecepients,
  enableUserRecipients,
  maxExpiration,
  defaultExpiration,
  shareIdLength,
}: {
  files: FileUpload[];
  isUploading: boolean;
  maxShareSize: number;
  currentFilesSize: number;
  onFilesChanged: (files: FileUpload[]) => void;
  setFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>;
  onSubmit: (createShare: CreateShare, senderEmail: string | null) => void;
  isUserSignedIn: boolean;
  appUrl: string;
  defaultAppUrl: string;
  enableEmailRecepients: boolean;
  enableUserRecipients: boolean;
  maxExpiration: Timespan;
  defaultExpiration: Timespan;
  shareIdLength: number;
}) => {
  const t = useTranslate();
  const theme = useMantineTheme();

  const [mode, setMode] = useState<Mode>("link");
  const [emailSearch, setEmailSearch] = useState("");
  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);

  const validationSchema = yup.object().shape({
    link: yup
      .string()
      .required(t("common.error.field-required"))
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(50, t("common.error.too-long", { length: 50 }))
      .matches(new RegExp("^[a-zA-Z0-9_-]*$"), {
        message: t("upload.modal.link.error.invalid"),
      }),
    senderEmail:
      mode === "email" && !isUserSignedIn
        ? yup
            .string()
            .required(t("common.error.field-required"))
            .email(t("common.error.invalid-email"))
        : yup.string().transform((value) => value || undefined),
    password: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    maxViews: yup
      .number()
      .transform((value) => value || undefined)
      .min(1),
  });

  // Expiration is simplified down to a single 1-30 day picker (see the
  // NumberInput below) — no more unit selector. Only honor the admin's
  // configured default when it's already expressed in days; anything else
  // (and the common case of no config at all) falls back to 3.
  const defaultExpirationDays =
    defaultExpiration && defaultExpiration.unit === "days"
      ? Math.min(30, Math.max(1, defaultExpiration.value))
      : 3;

  const form = useForm({
    initialValues: {
      // Populated client-side only, after mount (see below) — generating a
      // random id during render would differ between the server and client
      // pass and trigger a hydration mismatch.
      link: "",
      recipients: [] as string[],
      senderEmail: "",
      password: undefined,
      // "" rather than undefined: Mantine's NumberInput treats a controlled
      // value of undefined as "uncontrolled, ignore me" and simply keeps
      // whatever it last displayed — passing "" is what actually clears it
      // back to the placeholder. onSubmit already normalizes "" to
      // undefined for the actual payload (values.maxViews || undefined).
      maxViews: "" as number | "",
      description: undefined,
      expiration_num: defaultExpirationDays,
      expiration_unit: "-days",
      never_expires: false,
      restrictToRecipients: false,
    },
    validate: yupResolver(validationSchema),
  });

  useEffect(() => {
    form.setFieldValue("link", generateShareId(shareIdLength));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestrictToggle = (checked: boolean) => {
    form.setFieldValue("restrictToRecipients", checked);
    if (checked) {
      form.setFieldValue("password", undefined);
    }
  };

  const onFormSubmit = form.onSubmit(async (values) => {
    if (!(await shareService.isShareIdAvailable(values.link))) {
      form.setFieldError("link", t("upload.modal.link.error.taken"));
      return;
    }

    const expirationString = form.values.never_expires
      ? "never"
      : form.values.expiration_num + form.values.expiration_unit;

    const expirationDate = moment().add(
      form.values.expiration_num,
      form.values.expiration_unit.replace(
        "-",
        "",
      ) as moment.unitOfTime.DurationConstructor,
    );

    if (
      maxExpiration.value != 0 &&
      (form.values.never_expires ||
        expirationDate.isAfter(
          moment().add(maxExpiration.value, maxExpiration.unit),
        ))
    ) {
      form.setFieldError(
        "expiration_num",
        t("upload.modal.expires.error.too-long", {
          max: moment
            .duration(maxExpiration.value, maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    onSubmit(
      {
        id: values.link,
        expiration: expirationString,
        recipients: values.recipients,
        description: values.description,
        security: {
          password: values.restrictToRecipients
            ? undefined
            : values.password || undefined,
          maxViews: values.maxViews || undefined,
          restrictToRecipients: values.restrictToRecipients || undefined,
        },
      },
      mode === "email" && !isUserSignedIn ? values.senderEmail : null,
    );
  });

  return (
    <MantineProvider inherit theme={glassFormTheme}>
      {showNotSignedInAlert && !isUserSignedIn && (
        <Alert
          withCloseButton
          onClose={() => setShowNotSignedInAlert(false)}
          icon={<TbAlertCircle size={16} />}
          title={t("upload.modal.not-signed-in")}
          color="yellow"
          mb="md"
        >
          <FormattedMessage id="upload.modal.not-signed-in-description" />
        </Alert>
      )}

      <form onSubmit={onFormSubmit}>
        <Stack align="stretch">
          {!isUserSignedIn && (
            <SegmentedControl
              fullWidth
              value={mode}
              onChange={(value) => setMode(value as Mode)}
              data={[
                { label: t("upload.transfer.mode.link"), value: "link" },
                { label: t("upload.transfer.mode.email"), value: "email" },
              ]}
            />
          )}

          <Dropzone
            maxShareSize={maxShareSize}
            currentFilesSize={currentFilesSize}
            onFilesChanged={onFilesChanged}
            isUploading={isUploading}
            glass
          />
          {files.length > 0 && (
            <FileList<FileUpload> files={files} setFiles={setFiles} />
          )}

          {enableEmailRecepients && (
            <MultiSelect
              label={t("upload.transfer.recipient.label")}
              data={form.values.recipients}
              placeholder={t("upload.transfer.recipient.placeholder")}
              searchable
              creatable
              variant="filled"
              id="recipient-emails"
              inputMode="email"
              searchValue={emailSearch}
              onSearchChange={setEmailSearch}
              getCreateLabel={(query) => `+ ${query}`}
              onCreate={(query) => {
                if (!query.match(/^\S+@\S+\.\S+$/)) {
                  form.setFieldError(
                    "recipients",
                    t("upload.modal.accordion.email.invalid-email"),
                  );
                  return undefined;
                }
                form.setFieldError("recipients", null);
                const newRecipients = form.values.recipients.includes(query)
                  ? form.values.recipients
                  : [...form.values.recipients, query];
                form.setFieldValue("recipients", newRecipients);
                return query;
              }}
              {...form.getInputProps("recipients")}
              onChange={(value: string[]) => {
                form.setFieldValue("recipients", value);
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter" || e.key === "," || e.key === ";") {
                  e.preventDefault();
                  const inputValue = emailSearch.trim();
                  if (
                    inputValue.match(/^\S+@\S+\.\S+$/) &&
                    !form.values.recipients.includes(inputValue)
                  ) {
                    form.setFieldValue("recipients", [
                      ...form.values.recipients,
                      inputValue,
                    ]);
                  }
                  setEmailSearch("");
                } else if (e.key === " ") {
                  e.preventDefault();
                  setEmailSearch("");
                }
              }}
            />
          )}

          {mode === "email" && !isUserSignedIn && (
            <TextInput
              variant="filled"
              label={t("upload.transfer.sender.label")}
              placeholder={t("upload.transfer.sender.placeholder")}
              {...form.getInputProps("senderEmail")}
            />
          )}

          {enableUserRecipients && enableEmailRecepients && (
            <Checkbox
              label={t("upload.modal.accordion.email.restrict-to-recipients")}
              checked={form.values.restrictToRecipients}
              onChange={(e) => handleRestrictToggle(e.currentTarget.checked)}
            />
          )}

          <NumberInput
            min={1}
            max={30}
            precision={0}
            variant="filled"
            label={t("upload.transfer.expires.label")}
            disabled={form.values.never_expires}
            {...form.getInputProps("expiration_num")}
          />
          {maxExpiration.value == 0 && (
            <Checkbox
              label={t("upload.modal.expires.never-long")}
              {...form.getInputProps("never_expires")}
            />
          )}
          <Text italic size="xs" color="dimmed">
            {getExpirationPreview(
              {
                neverExpires: t("upload.modal.completed.never-expires"),
                expiresOn: t("upload.modal.completed.expires-on"),
              },
              form,
            )}
          </Text>

          <Textarea
            variant="filled"
            label={t("upload.transfer.message.label")}
            placeholder={t(
              "upload.modal.accordion.name-and-description.description.placeholder",
            )}
            {...form.getInputProps("description")}
          />

          <Accordion>
            <Accordion.Item value="options" sx={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.transfer.options" />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack align="stretch">
                  <CustomUrlInput
                    form={form}
                    fieldName="link"
                    shareIdLength={shareIdLength}
                    appUrl={appUrl}
                    defaultAppUrl={defaultAppUrl}
                    pathPrefix="/s/"
                  />
                  {!form.values.restrictToRecipients && (
                    <PasswordInput
                      variant="filled"
                      placeholder={t(
                        "upload.modal.accordion.security.password.placeholder",
                      )}
                      label={t(
                        "upload.modal.accordion.security.password.label",
                      )}
                      autoComplete="new-password"
                      {...form.getInputProps("password")}
                    />
                  )}
                  <NumberInput
                    hideControls
                    min={1}
                    type="number"
                    variant="filled"
                    placeholder={t(
                      "upload.modal.accordion.security.max-views.placeholder",
                    )}
                    label={t("upload.modal.accordion.security.max-views.label")}
                    {...form.getInputProps("maxViews")}
                    // Mantine's own +/- controls compute their next value
                    // internally and only tell us the result, so "0" from
                    // decrementing 1 and "0" from incrementing empty (its
                    // own floor-start logic) are indistinguishable — and
                    // fixing that up afterward needs a blur to force a
                    // resync (Mantine ignores external value changes while
                    // focused), which is exactly the visible focus-ring
                    // flash this replaces. Custom buttons compute the next
                    // value directly from current form state instead, so
                    // there's never an ambiguous intermediate value and
                    // never a need to steal focus to correct one.
                    //
                    // The active-look border is still wanted while using
                    // the buttons, though — done with a plain :focus-within
                    // on the wrapper (matching the field's own focus style
                    // from glassFieldStyles) rather than by focusing the
                    // input itself, which would resurrect the exact sync
                    // problem above. The buttons explicitly focus
                    // *themselves* on click below, since Safari doesn't
                    // focus buttons on click by default the way other
                    // browsers do, and :focus-within needs a real focus
                    // target inside the wrapper to trigger from.
                    styles={(t2) => {
                      const dark = t2.colorScheme === "dark";
                      return {
                        wrapper: {
                          "&:focus-within input": {
                            backgroundColor: dark
                              ? "rgba(255, 255, 255, 0.13)"
                              : "rgba(255, 255, 255, 0.55)",
                            borderColor:
                              t2.colors[t2.primaryColor][dark ? 4 : 6],
                          },
                        },
                      };
                    }}
                    rightSection={
                      <Stack spacing={0} sx={{ alignSelf: "stretch" }}>
                        <UnstyledButton
                          sx={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 6px",
                            color:
                              theme.colorScheme === "dark"
                                ? "rgba(255, 255, 255, 0.7)"
                                : "rgba(0, 0, 0, 0.6)",
                            "&:hover": {
                              backgroundColor:
                                theme.colorScheme === "dark"
                                  ? "rgba(255, 255, 255, 0.1)"
                                  : "rgba(255, 255, 255, 0.35)",
                            },
                          }}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.currentTarget.focus();
                            form.setFieldValue(
                              "maxViews",
                              typeof form.values.maxViews === "number"
                                ? form.values.maxViews + 1
                                : 1,
                            );
                          }}
                        >
                          <TbChevronUp size={12} />
                        </UnstyledButton>
                        <UnstyledButton
                          sx={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 6px",
                            color:
                              theme.colorScheme === "dark"
                                ? "rgba(255, 255, 255, 0.7)"
                                : "rgba(0, 0, 0, 0.6)",
                            "&:hover": {
                              backgroundColor:
                                theme.colorScheme === "dark"
                                  ? "rgba(255, 255, 255, 0.1)"
                                  : "rgba(255, 255, 255, 0.35)",
                            },
                          }}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.currentTarget.focus();
                            form.setFieldValue(
                              "maxViews",
                              typeof form.values.maxViews === "number" &&
                                form.values.maxViews > 1
                                ? form.values.maxViews - 1
                                : "",
                            );
                          }}
                        >
                          <TbChevronDown size={12} />
                        </UnstyledButton>
                      </Stack>
                    }
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Button
            type="submit"
            size="md"
            disabled={files.length === 0}
            loading={isUploading}
          >
            <FormattedMessage id="upload.transfer.submit" />
          </Button>
        </Stack>
      </form>
    </MantineProvider>
  );
};

export default TransferCard;
