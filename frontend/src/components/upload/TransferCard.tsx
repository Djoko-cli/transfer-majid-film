import {
  Accordion,
  Button,
  Checkbox,
  Collapse,
  createStyles,
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
import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AnimatedHeight from "../core/AnimatedHeight";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import { FileUpload } from "../../types/File.type";
import { CreateShare, Mode } from "../../types/share.type";
import { Timespan } from "../../types/timespan.type";
import { getExpirationPreview } from "../../utils/date.util";
import { getDefaultShareName } from "../../utils/file.util";
import { generateAvailableShareId } from "../../utils/share.util";
import Dropzone from "./Dropzone";
import FileList from "./FileList";

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

// The submit button's glint once it's genuinely actionable (files
// selected), reusing liquidGlassKeyframes' global @keyframes (createStyles
// doesn't reliably register object-syntax @keyframes in this codebase —
// see that file, and GlintBorder for the same pattern already working
// elsewhere). A createStyles hook rather than an inline `sx` object
// specifically because `sx` is recomputed fresh on every render — with an
// infinite CSS animation, a rebuilt style object can visibly restart the
// animation mid-cycle on the next render, reading as a jump/teleport
// rather than a continuous sweep. createStyles instead memoizes its output
// by theme, so the generated class (and the animation riding on it) stays
// untouched across re-renders.
//
// The pre-selection "waiting for input" pulse lives on the Dropzone
// instead (see Dropzone.tsx's `waiting` prop) — that's the element the
// user actually needs to act on, not this button.
const useSubmitButtonStyles = createStyles((theme) => {
  const dark = theme.colorScheme === "dark";
  const accent = theme.colors[theme.primaryColor][dark ? 4 : 6];

  return {
    // Once files are selected the button is genuinely actionable, so it
    // gets a glint sweep — the same idea as GlintBorder's own
    // glass-catching-light comet: a soft, blurred glow plus an
    // accent-colored drop-shadow halo, rather than a flat opaque streak,
    // which reads as a metal reflection instead of light through glass.
    //
    // The previous version placed the highlight so it sat *exactly* on a
    // computed "invisible" boundary at both loop endpoints — a gradient
    // angle that wasn't perfectly horizontal (100deg) stretches those
    // stops in a way that's hard to get pixel-exact, so the loop reset
    // showed as a visible pop right at the edges. This version keeps the
    // gradient perfectly horizontal and gives the sweep a lot more room
    // than it strictly needs (background-size 400% vs. the highlight's own
    // sliver of that width, and a travel range well past the minimum) —
    // comfortable slack rather than a razor's-edge boundary, so neither
    // gradient-angle math nor the blur's own edge bleed can push anything
    // into view right as the loop resets.
    ready: {
      position: "relative",
      overflow: "hidden",

      "&::after": {
        content: "''",
        position: "absolute",
        inset: 0,
        background: `linear-gradient(90deg,
          transparent,
          rgba(255, 255, 255, 0.5) 50%,
          transparent)`,
        backgroundSize: "400% 100%",
        backgroundRepeat: "no-repeat",
        filter: `blur(8px) drop-shadow(0 0 10px ${accent}aa)`,
        animation: "buttonShimmer 3.4s ease-in-out infinite",
      },

      "@media (prefers-reduced-motion: reduce)": {
        "&::after": { animation: "none" },
      },
    },
  };
});

const TransferCard = ({
  files,
  isUploading,
  onCancelUpload,
  onRetryFile,
  maxShareSize,
  currentFilesSize,
  onFilesChanged,
  setFiles,
  onSubmit,
  isUserSignedIn,
  userEmail,
  enableEmailRecepients,
  enableUserRecipients,
  maxExpiration,
  defaultExpiration,
  shareIdLength,
}: {
  files: FileUpload[];
  isUploading: boolean;
  onCancelUpload: () => void;
  onRetryFile: (fileIndex: number) => void;
  maxShareSize: number;
  currentFilesSize: number;
  onFilesChanged: (files: FileUpload[]) => void;
  setFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>;
  onSubmit: (createShare: CreateShare, mode: Mode) => void;
  isUserSignedIn: boolean;
  // Pre-fills the sender field for a signed-in user (still editable — they
  // may want a different reply-to for a given transfer) instead of asking
  // them to retype an address the app already knows.
  userEmail?: string;
  enableEmailRecepients: boolean;
  enableUserRecipients: boolean;
  maxExpiration: Timespan;
  defaultExpiration: Timespan;
  shareIdLength: number;
}) => {
  const t = useTranslate();
  const theme = useMantineTheme();
  const config = useConfig();

  // Whether submitting will actually open the OTP modal — false for a
  // signed-in sender (already known, field is locked below) and false when
  // an admin has turned the verification step off entirely. Drives the
  // sender-email field's own label/placeholder so the OTP step is never a
  // surprise: see the field below.
  const requiresEmailVerification =
    !isUserSignedIn &&
    config.get("share.requireEmailVerificationForAnonymousShares");

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

  const { classes: submitButtonClasses } = useSubmitButtonStyles();

  const [mode, setMode] = useState<Mode>("link");
  const [emailSearch, setEmailSearch] = useState("");

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    // Only load-bearing in "E-mail" mode: leaving it empty there made the
    // Lien/E-mail toggle silently inert (both branches sent an identical
    // link-only share), even though populating it does trigger real
    // recipient emails server-side (share.service.ts). Requiring it here
    // makes the toggle's choice always have a visible consequence.
    recipients:
      mode === "email" && enableEmailRecepients
        ? yup.array().min(1, t("upload.transfer.recipient.email.required"))
        : yup.array(),
    senderEmail: !isUserSignedIn
      ? yup
          .string()
          .required(t("common.error.field-required"))
          .email(t("common.error.invalid-email"))
      : yup
          .string()
          .transform((value) => value || undefined)
          .email(t("common.error.invalid-email")),
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
      name: "",
      recipients: [] as string[],
      senderEmail: userEmail || "",
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

  // getExpirationPreview() below calls moment() (i.e. "now") directly at
  // render time — evaluated once during SSR and again during client
  // hydration, a few seconds apart, occasionally landing on different
  // minutes and triggering a genuine hydration mismatch (not just a
  // console warning: React discards the SSR output and re-renders the
  // whole tree client-side). Gating the real text behind a mount flag
  // makes the pre-hydration markup identical on both sides.
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
        id: await generateAvailableShareId(shareIdLength),
        name: values.name || getDefaultShareName(files, t) || undefined,
        expiration: expirationString,
        recipients: values.recipients,
        senderEmail: !isUserSignedIn
          ? values.senderEmail || undefined
          : undefined,
        description: values.description,
        security: {
          password: values.restrictToRecipients
            ? undefined
            : values.password || undefined,
          maxViews: values.maxViews || undefined,
          restrictToRecipients: values.restrictToRecipients || undefined,
        },
      },
      mode,
    );
  });

  return (
    <MantineProvider inherit theme={glassFormTheme}>
      <form onSubmit={onFormSubmit}>
        {
          // spacing={0}: this Stack's only two children now are the
          // dropzone and the single AnimatedHeight below — gap between
          // them is handled by that AnimatedHeight's own gapWhenOpen
          // instead of a blanket Stack gap, specifically so a collapsed
          // (files.length === 0) card doesn't pay for a gap next to
          // content that isn't there. See that AnimatedHeight's own
          // comment for the full reasoning.
        }
        <Stack align="stretch" spacing={0}>
          {
            // The dropzone leads — before asking anything about delivery,
            // naming, or recipients, there's nothing to make those
            // decisions about yet. Everything below only makes sense once
            // files exist, so it now follows rather than precedes them.
          }
          <Dropzone
            maxShareSize={maxShareSize}
            currentFilesSize={currentFilesSize}
            onFilesChanged={onFilesChanged}
            isUploading={isUploading}
            waiting={files.length === 0}
            compact={files.length > 0}
            glass
          />
          {
            // Everything from here down — the file list, delivery mode,
            // name, recipients, how long the transfer lives — is what
            // there's nothing to decide about until a file exists. Hidden
            // entirely (not just visually) rather than shown-but-inert, so
            // the initial card is only ever the drop target: one clear
            // thing to do, not a form's worth of fields with nowhere yet to
            // apply them. AnimatedHeight rather than Collapse — Collapse
            // only animates its own `in` toggle, not this region growing or
            // shrinking further while already open (e.g. the file table
            // gaining a row), which ResizeObserver-driven AnimatedHeight
            // catches the same way regardless of what caused it. Re-hides
            // just as readily if every file is removed again: nothing is
            // lost when it does, since useForm's state lives in this
            // component, not in the unmounted fields below.
            //
            // One AnimatedHeight for the file list *and* everything below
            // it, not two — both are gated on the exact same condition and
            // always reveal together, so a single measured region avoids
            // reserving gap twice for what is visually one event. That
            // reservation is real: the Stack above sets its own spacing to
            // 0 and this passes gapWhenOpen instead, so a collapsed card
            // has zero dead space below the dropzone's floating "add a
            // folder" button — a plain Stack gap would otherwise be spent
            // on this region whether it has anything to show or not.
          }
          <AnimatedHeight duration={300} gapWhenOpen={16}>
            {files.length > 0 ? (
              <Stack align="stretch">
                <FileList<FileUpload>
                  files={files}
                  setFiles={setFiles}
                  isUploading={isUploading}
                  onCancel={onCancelUpload}
                  onRetry={onRetryFile}
                />
                {
                  // Moved below the dropzone (it used to open the card) —
                  // asking how a transfer will be delivered before a single
                  // file has been chosen answers a question that doesn't
                  // exist yet.
                }
                <SegmentedControl
                  fullWidth
                  value={mode}
                  onChange={(value) => setMode(value as Mode)}
                  data={[
                    { label: t("upload.transfer.mode.link"), value: "link" },
                    { label: t("upload.transfer.mode.email"), value: "email" },
                  ]}
                />

                {
                  // Always shown, in both Lien and E-mail mode: this names the
                  // share itself (it's what a recipient sees as the page title,
                  // and what the owner sees as the row label in "Mes partages"),
                  // not who it's addressed to — a link shared with no particular
                  // recipient still deserves its own identity. Left blank, the
                  // fallback in onFormSubmit derives one from the files being
                  // sent, so a share is never stuck showing its raw random ID as
                  // its only name.
                }
                <TextInput
                  variant="filled"
                  label={t("upload.transfer.share-name.label")}
                  placeholder={t("upload.transfer.share-name.placeholder")}
                  {...form.getInputProps("name")}
                />

                {
                  // Grouped with the name field above rather than down by
                  // expiration/recipients — both describe *what's being sent*,
                  // not *how* it's delivered.
                }
                <Textarea
                  variant="filled"
                  label={t("upload.transfer.message.label")}
                  placeholder={t(
                    "upload.modal.accordion.name-and-description.description.placeholder",
                  )}
                  {...form.getInputProps("description")}
                />

                {
                  // Who actually receives the transfer, on the other hand, only
                  // applies once the sender has committed to addressing it to
                  // someone, i.e. "E-mail" mode — collapsed (rather than
                  // unmounted) so the height animation has something to animate.
                  // Also gated on enableEmailRecepients so switching to "E-mail"
                  // mode doesn't expand an empty box when that feature is off.
                  // Same display:block-instead-of-none trick as the old
                  // sender-email field used to need: a Collapse settles closed at
                  // display:none, which drops the item out of the Stack's flex
                  // gap calculation and snaps the layout by one gap-width right
                  // after the height animation finishes.
                }
                <Collapse
                  in={mode === "email" && enableEmailRecepients}
                  sx={{
                    "&[aria-hidden='true']": { display: "block !important" },
                  }}
                >
                  <Stack align="stretch">
                    {enableEmailRecepients && (
                      <MultiSelect
                        withAsterisk={mode === "email"}
                        label={t("upload.transfer.recipient.email.label")}
                        data={form.values.recipients}
                        placeholder={t(
                          "upload.transfer.recipient.email.placeholder",
                        )}
                        searchable
                        creatable
                        variant="filled"
                        id="recipient-emails"
                        inputMode="email"
                        tabIndex={mode === "email" ? undefined : -1}
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
                          const newRecipients = form.values.recipients.includes(
                            query,
                          )
                            ? form.values.recipients
                            : [...form.values.recipients, query];
                          form.setFieldValue("recipients", newRecipients);
                          return query;
                        }}
                        {...form.getInputProps("recipients")}
                        onChange={(value: string[]) => {
                          form.setFieldValue("recipients", value);
                        }}
                        onKeyDown={(
                          e: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                          if (
                            e.key === "Enter" ||
                            e.key === "," ||
                            e.key === ";"
                          ) {
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
                  </Stack>
                </Collapse>

                {
                  // Always shown regardless of Lien/E-mail mode — it's the
                  // sender's own identity, not tied to how the recipient gets the
                  // transfer. Anonymous senders must type and verify it (see
                  // the OTP flow this feeds); a signed-in sender's is already
                  // known, so it's pre-filled from their account and locked
                  // rather than asked for again.
                }
                <TextInput
                  variant="filled"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  withAsterisk={!isUserSignedIn}
                  label={t("upload.transfer.sender.label")}
                  description={
                    requiresEmailVerification &&
                    t("upload.transfer.sender.otp-description")
                  }
                  placeholder={t("upload.transfer.sender.placeholder")}
                  disabled={isUserSignedIn}
                  {...form.getInputProps("senderEmail")}
                />

                {enableUserRecipients && enableEmailRecepients && (
                  <Checkbox
                    label={t(
                      "upload.modal.accordion.email.restrict-to-recipients",
                    )}
                    checked={form.values.restrictToRecipients}
                    onChange={(e) =>
                      handleRestrictToggle(e.currentTarget.checked)
                    }
                  />
                )}

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
                        onPointerDown={(
                          e: React.PointerEvent<HTMLButtonElement>,
                        ) => {
                          e.currentTarget.focus();
                          expirationHold.start(1);
                        }}
                        onPointerUp={expirationHold.stop}
                        onPointerLeave={expirationHold.stop}
                        onPointerCancel={expirationHold.stop}
                        aria-label={t("upload.transfer.expires.increase")}
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
                        onPointerDown={(
                          e: React.PointerEvent<HTMLButtonElement>,
                        ) => {
                          e.currentTarget.focus();
                          expirationHold.start(-1);
                        }}
                        onPointerUp={expirationHold.stop}
                        onPointerLeave={expirationHold.stop}
                        onPointerCancel={expirationHold.stop}
                        aria-label={t("upload.transfer.expires.decrease")}
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
                        {!form.values.restrictToRecipients && (
                          <PasswordInput
                            variant="filled"
                            placeholder={t(
                              "upload.modal.accordion.security.password.placeholder",
                            )}
                            label={t(
                              "upload.modal.accordion.security.password.label",
                            )}
                            visibilityToggleLabel={t(
                              "common.button.toggle-password-visibility",
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
                          label={t(
                            "upload.modal.accordion.security.max-views.label",
                          )}
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
                                aria-label={t(
                                  "upload.modal.accordion.security.max-views.increase",
                                )}
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
                                aria-label={t(
                                  "upload.modal.accordion.security.max-views.decrease",
                                )}
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

                {
                  // Downgraded from a dismissible yellow warning banner that used
                  // to open the whole card — the same information, but as a
                  // quiet aside right where it's actually relevant (about to
                  // submit), not the first thing a visitor reads before they've
                  // even seen what this page does.
                }
                {!isUserSignedIn && (
                  <Text size="xs" color="dimmed">
                    <FormattedMessage id="upload.transfer.anonymous-notice" />
                  </Text>
                )}

                <Button
                  type="submit"
                  size="md"
                  disabled={files.length === 0}
                  loading={isUploading}
                  className={
                    !isUploading && files.length > 0
                      ? submitButtonClasses.ready
                      : undefined
                  }
                >
                  <FormattedMessage
                    id={
                      mode === "link"
                        ? "upload.transfer.submit.link"
                        : "upload.transfer.submit"
                    }
                  />
                </Button>
              </Stack>
            ) : null}
          </AnimatedHeight>
        </Stack>
      </form>
    </MantineProvider>
  );
};

export default TransferCard;
