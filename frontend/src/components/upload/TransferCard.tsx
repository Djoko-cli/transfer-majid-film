import {
  Accordion,
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
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
import React, { useEffect, useRef, useState } from "react";
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

// Press-and-hold repeat for a stepper button pair: one immediate step on
// press, then repeating every 80ms after an initial 400ms delay, until
// released. `step` should read/write its own ref rather than form.values —
// the interval closure is created once, at pointerdown, so a value read
// from form.values inside it would stay frozen at whatever it was at that
// moment instead of reflecting the steps the interval itself just made.
const useHoldRepeat = (step: (delta: number) => void, disabled: boolean) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const stop = () => {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
  };

  useEffect(() => stop, []);

  const start = (delta: number) => {
    if (disabled) return;
    step(delta);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => step(delta), 80);
    }, 400);
  };

  return { start, stop };
};

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

  // Shared between the max-views and expiration steppers below — both use
  // the same custom rightSection buttons (native NumberInput controls step
  // once per click only; the max-views one already needed to move off them
  // for unrelated focus-sync reasons, and expiration now needs press-and-
  // hold repeat, which native controls don't support either).
  const stepperButtonSx = {
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
  } as const;

  const stepperFieldStyles = (t2: any) => {
    const dark = t2.colorScheme === "dark";
    return {
      wrapper: {
        "&:focus-within input": {
          backgroundColor: dark
            ? "rgba(255, 255, 255, 0.13)"
            : "rgba(255, 255, 255, 0.55)",
          borderColor: t2.colors[t2.primaryColor][dark ? 4 : 6],
        },
      },
    };
  };

  // The submit button's two "nothing to do yet" states, both reusing
  // liquidGlassKeyframes' global @keyframes (createStyles doesn't reliably
  // register object-syntax @keyframes in this codebase — see that file).
  // Once files are selected the button is genuinely actionable, so it gets
  // an energetic shimmer sweep; before that it's disabled, so a shimmer
  // there would read as "something is happening" when nothing is — a
  // slower breathing glow says "waiting for input" instead.
  const submitButtonReadySx = {
    position: "relative",
    overflow: "hidden",
    "&::after": {
      content: "''",
      position: "absolute",
      inset: 0,
      background:
        "linear-gradient(100deg, transparent 35%, rgba(255, 255, 255, 0.6) 50%, transparent 65%)",
      backgroundSize: "250% 100%",
      animation: "buttonShimmer 2.6s ease-in-out infinite",
    },
    "@media (prefers-reduced-motion: reduce)": {
      "&::after": { animation: "none" },
    },
  } as const;

  const submitButtonWaitingSx = {
    ["--pulse-glow-color" as string]: `${theme.colors[theme.primaryColor][theme.colorScheme === "dark" ? 4 : 6]}66`,
    animation: "buttonWaitingPulse 2.8s ease-in-out infinite",
    "@media (prefers-reduced-motion: reduce)": {
      animation: "none",
    },
  } as const;

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
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    senderEmail: !isUserSignedIn
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
      name: "",
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

  // getExpirationPreview() below calls moment() (i.e. "now") directly at
  // render time — evaluated once during SSR and again during client
  // hydration, a few seconds apart, occasionally landing on different
  // minutes and triggering a genuine hydration mismatch (not just a
  // console warning: React discards the SSR output and re-renders the
  // whole tree client-side). Gating the real text behind a mount flag
  // makes the pre-hydration markup identical on both sides — nothing is
  // shown until the first client-only render, same fix already applied to
  // the "link" field's random id above.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRestrictToggle = (checked: boolean) => {
    form.setFieldValue("restrictToRecipients", checked);
    if (checked) {
      form.setFieldValue("password", undefined);
    }
  };

  // Tracked in refs rather than read from form.values inside the hold
  // interval — see useHoldRepeat above for why.
  const expirationRef = useRef(defaultExpirationDays);
  useEffect(() => {
    if (typeof form.values.expiration_num === "number") {
      expirationRef.current = form.values.expiration_num;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.values.expiration_num]);

  const stepExpiration = (delta: number) => {
    const next = Math.min(30, Math.max(1, expirationRef.current + delta));
    expirationRef.current = next;
    form.setFieldValue("expiration_num", next);
  };

  const expirationHold = useHoldRepeat(
    stepExpiration,
    form.values.never_expires,
  );

  const maxViewsRef = useRef<number | "">(form.values.maxViews);
  useEffect(() => {
    maxViewsRef.current = form.values.maxViews;
  }, [form.values.maxViews]);

  const stepMaxViews = (delta: number) => {
    const current = maxViewsRef.current;
    const next: number | "" =
      delta > 0
        ? typeof current === "number"
          ? current + 1
          : 1
        : typeof current === "number" && current > 1
          ? current - 1
          : "";
    maxViewsRef.current = next;
    form.setFieldValue("maxViews", next);
  };

  const maxViewsHold = useHoldRepeat(stepMaxViews, false);

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
        name: values.name || undefined,
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
      !isUserSignedIn ? values.senderEmail : null,
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

          <TextInput
            variant="filled"
            label={t("upload.transfer.recipient.name.label")}
            placeholder={t("upload.transfer.recipient.name.placeholder")}
            {...form.getInputProps("name")}
          />

          {enableEmailRecepients && (
            // Same display:block-instead-of-none trick as the old
            // sender-email field used to need: a Collapse settles closed at
            // display:none, which drops the item out of the Stack's flex
            // gap calculation and snaps the layout by one gap-width right
            // after the height animation finishes. Only anonymous users
            // ever toggle this (signed-in users have no mode switch, so
            // `in` is always true for them and this never animates).
            <Collapse
              in={isUserSignedIn || mode === "email"}
              sx={{ "&[aria-hidden='true']": { display: "block !important" } }}
            >
              <MultiSelect
                label={t("upload.transfer.recipient.email.label")}
                data={form.values.recipients}
                placeholder={t("upload.transfer.recipient.email.placeholder")}
                searchable
                creatable
                variant="filled"
                id="recipient-emails"
                inputMode="email"
                tabIndex={isUserSignedIn || mode === "email" ? undefined : -1}
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
            </Collapse>
          )}

          {!isUserSignedIn && (
            // Always asked regardless of Lien/E-mail mode — it's the
            // anonymous sender's own identity for anti-spam verification,
            // not tied to how the recipient gets the transfer.
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

          <Textarea
            variant="filled"
            label={t("upload.transfer.message.label")}
            placeholder={t(
              "upload.modal.accordion.name-and-description.description.placeholder",
            )}
            {...form.getInputProps("description")}
          />

          <NumberInput
            hideControls
            min={1}
            max={30}
            precision={0}
            variant="filled"
            label={t("upload.transfer.expires.label")}
            disabled={form.values.never_expires}
            {...form.getInputProps("expiration_num")}
            styles={stepperFieldStyles}
            rightSection={
              <Stack spacing={0} sx={{ alignSelf: "stretch" }}>
                <UnstyledButton
                  disabled={form.values.never_expires}
                  sx={{
                    ...stepperButtonSx,
                    ...(form.values.never_expires && {
                      opacity: 0.4,
                      cursor: "not-allowed",
                    }),
                  }}
                  onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
                    e.currentTarget.focus();
                    expirationHold.start(1);
                  }}
                  onPointerUp={expirationHold.stop}
                  onPointerLeave={expirationHold.stop}
                  onPointerCancel={expirationHold.stop}
                >
                  <TbChevronUp size={12} />
                </UnstyledButton>
                <UnstyledButton
                  disabled={form.values.never_expires}
                  sx={{
                    ...stepperButtonSx,
                    ...(form.values.never_expires && {
                      opacity: 0.4,
                      cursor: "not-allowed",
                    }),
                  }}
                  onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
                    e.currentTarget.focus();
                    expirationHold.start(-1);
                  }}
                  onPointerUp={expirationHold.stop}
                  onPointerLeave={expirationHold.stop}
                  onPointerCancel={expirationHold.stop}
                >
                  <TbChevronDown size={12} />
                </UnstyledButton>
              </Stack>
            }
          />
          {maxExpiration.value == 0 && (
            <Checkbox
              label={t("upload.modal.expires.never-long")}
              {...form.getInputProps("never_expires")}
            />
          )}
          <Text italic size="xs" color="dimmed">
            {mounted &&
              getExpirationPreview(
                {
                  neverExpires: t("upload.modal.completed.never-expires"),
                  expiresOn: t("upload.modal.completed.expires-on"),
                },
                form,
              )}
          </Text>

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
                    // never a need to steal focus to correct one. They also
                    // support press-and-hold, which native controls don't.
                    //
                    // The active-look border is still wanted while using
                    // the buttons, though — done with a plain :focus-within
                    // on the wrapper (matching the field's own focus style
                    // from glassFieldStyles) rather than by focusing the
                    // input itself, which would resurrect the exact sync
                    // problem above. The buttons explicitly focus
                    // *themselves* on press below, since Safari doesn't
                    // focus buttons on click by default the way other
                    // browsers do, and :focus-within needs a real focus
                    // target inside the wrapper to trigger from.
                    styles={stepperFieldStyles}
                    rightSection={
                      <Stack spacing={0} sx={{ alignSelf: "stretch" }}>
                        <UnstyledButton
                          sx={stepperButtonSx}
                          onPointerDown={(
                            e: React.PointerEvent<HTMLButtonElement>,
                          ) => {
                            e.currentTarget.focus();
                            maxViewsHold.start(1);
                          }}
                          onPointerUp={maxViewsHold.stop}
                          onPointerLeave={maxViewsHold.stop}
                          onPointerCancel={maxViewsHold.stop}
                        >
                          <TbChevronUp size={12} />
                        </UnstyledButton>
                        <UnstyledButton
                          sx={stepperButtonSx}
                          onPointerDown={(
                            e: React.PointerEvent<HTMLButtonElement>,
                          ) => {
                            e.currentTarget.focus();
                            maxViewsHold.start(-1);
                          }}
                          onPointerUp={maxViewsHold.stop}
                          onPointerLeave={maxViewsHold.stop}
                          onPointerCancel={maxViewsHold.stop}
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
            sx={
              isUploading
                ? undefined
                : files.length === 0
                  ? submitButtonWaitingSx
                  : submitButtonReadySx
            }
          >
            <FormattedMessage id="upload.transfer.submit" />
          </Button>
        </Stack>
      </form>
    </MantineProvider>
  );
};

export default TransferCard;
