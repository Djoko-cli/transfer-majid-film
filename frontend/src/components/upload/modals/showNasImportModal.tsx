import {
  Accordion,
  Alert,
  Box,
  Button,
  Checkbox,
  Col,
  Grid,
  Group,
  MantineProvider,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { useState } from "react";
import { TbAlertCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import AnimatedHeight from "../../core/AnimatedHeight";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import nasImportService from "../../../services/nasImport.service";
import { NasImportPreview } from "../../../types/nasImport.type";
import { CreateShare } from "../../../types/share.type";
import { Timespan } from "../../../types/timespan.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import { getExpirationPreview } from "../../../utils/date.util";
import { getDefaultShareName } from "../../../utils/file.util";
import { generateAvailableShareId } from "../../../utils/share.util";
import toast from "../../../utils/toast.util";
import NasImportBrowser from "../NasImportBrowser";
import glassFormTheme from "../glassFormTheme";
import { glassModalStyles } from "../glassModalTheme";

type NasImportModalOptions = {
  isUserSignedIn: boolean;
  allowUnauthenticatedShares: boolean;
  enableEmailRecepients: boolean;
  enableUserRecipients: boolean;
  maxExpiration: Timespan;
  defaultExpiration: Timespan;
  shareIdLength: number;
};

// One modal, one continuous flow — was two separate modals in sequence
// (browse/select/preview, then a second "Créer un partage" modal handed
// off to right after), which read as a jarring close-then-reopen rather
// than one process, per the user's own direct request. Now a single
// openModal() call whose body swaps between two internal steps, closing
// only once, at the very end. glassModalStyles' header/title/close
// styling targets Mantine's own <Modal title> slot, so that stays static
// for the whole flow ("Importer depuis le NAS") rather than trying to
// retitle an already-open modal per step - each step gets its own
// in-body heading instead, which reads fine alongside a static outer
// title and needs none of Mantine's updateModal plumbing.
const showNasImportModal = (
  modals: ModalsContextProps,
  options: NasImportModalOptions,
  onConfirm: (
    createShare: CreateShare,
    paths: string[],
    preview: NasImportPreview,
  ) => void,
) => {
  const t = translateOutsideContext();

  modals.openModal({
    title: t("upload.nasImport.modal.title"),
    size: "lg",
    styles: glassModalStyles,
    children: (
      <MantineProvider inherit theme={glassFormTheme}>
        <NasImportModalBody options={options} onConfirm={onConfirm} />
      </MantineProvider>
    ),
  });
};

const NasImportModalBody = ({
  options,
  onConfirm,
}: {
  options: NasImportModalOptions;
  onConfirm: (
    createShare: CreateShare,
    paths: string[],
    preview: NasImportPreview,
  ) => void;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const [step, setStep] = useState<"browse" | "options">("browse");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewResult, setPreviewResult] = useState<NasImportPreview | null>(
    null,
  );
  const [previewing, setPreviewing] = useState(false);

  // Any selection change invalidates a previous preview — re-running it is
  // an explicit action rather than automatic-on-every-click specifically so
  // a large folder isn't recursively walked on every single checkbox toggle.
  const handleSelectionChange = (next: Set<string>) => {
    setSelected(next);
    setPreviewResult(null);
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const result = await nasImportService.preview(Array.from(selected));
      setPreviewResult(result);
      if (result.fileCount === 0) {
        toast.error(t("upload.nasImport.modal.empty-selection"));
      }
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <AnimatedHeight duration={250}>
      {
        // Keyed on step so the two screens are genuinely separate mounts —
        // simpler than reconciling wildly different form content across a
        // single persistent tree, and AnimatedHeight only needs a stable
        // *measured* child, not a stable *identity*, to animate the swap.
      }
      <Box key={step}>
        {step === "browse" ? (
          <Stack>
            <NasImportBrowser
              selected={selected}
              onSelectionChange={handleSelectionChange}
            />
            <Group position="apart">
              <Text size="sm" color="dimmed">
                {t("upload.nasImport.modal.selected-count", {
                  count: selected.size,
                })}
              </Text>
              <Button
                variant="light"
                size="xs"
                disabled={selected.size === 0}
                loading={previewing}
                onClick={runPreview}
              >
                <FormattedMessage id="upload.nasImport.modal.preview-button" />
              </Button>
            </Group>
            {previewResult && previewResult.fileCount > 0 && (
              <Alert color="primary" icon={<TbAlertCircle size={16} />}>
                {t("upload.nasImport.modal.preview-result", {
                  count: previewResult.fileCount,
                  size: byteToHumanSizeString(previewResult.totalSize),
                })}
              </Alert>
            )}
            <Group position="right">
              <Button variant="subtle" onClick={() => modals.closeAll()}>
                <FormattedMessage id="common.button.cancel" />
              </Button>
              <Button
                disabled={!previewResult || previewResult.fileCount === 0}
                onClick={() => setStep("options")}
              >
                <FormattedMessage id="common.button.confirm" />
              </Button>
            </Group>
          </Stack>
        ) : (
          <NasImportOptionsStep
            selectedPaths={Array.from(selected)}
            preview={previewResult!}
            options={options}
            onBack={() => setStep("browse")}
            onSubmit={(createShare) => {
              modals.closeAll();
              onConfirm(createShare, Array.from(selected), previewResult!);
            }}
          />
        )}
      </Box>
    </AnimatedHeight>
  );
};

// The share-metadata form — was its own standalone modal (showCreateUploadModal),
// generic over a file shape it never actually needed to be generic over in
// practice (its one real caller was always this exact flow). Folded in
// directly now that it's a step of this modal rather than a separate one;
// selectedPaths/preview replace the synthetic {name,size}[] list that flow
// used to build just to satisfy that old generic shape.
const NasImportOptionsStep = ({
  selectedPaths,
  preview,
  options,
  onBack,
  onSubmit,
}: {
  selectedPaths: string[];
  preview: NasImportPreview;
  options: NasImportModalOptions;
  onBack: () => void;
  onSubmit: (createShare: CreateShare) => void;
}) => {
  const t = useTranslate();
  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);
  const [emailSearch, setEmailSearch] = useState("");

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
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

  const defaultTimespan = options.defaultExpiration
    ? options.defaultExpiration
    : { value: 7, unit: "days" };

  const form = useForm({
    initialValues: {
      name: undefined,
      recipients: [] as string[],
      password: undefined,
      maxViews: undefined,
      description: undefined,
      expiration_num: defaultTimespan.value,
      expiration_unit: `-${defaultTimespan.unit}` as string,
      never_expires: false,
      restrictToRecipients: false,
    },
    validate: yupResolver(validationSchema),
  });

  const handleRestrictToggle = (checked: boolean) => {
    form.setFieldValue("restrictToRecipients", checked);
    if (checked) {
      // A share can't be both password-protected and restricted to recipients.
      form.setFieldValue("password", undefined);
    }
  };

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
      options.maxExpiration.value != 0 &&
      (form.values.never_expires ||
        expirationDate.isAfter(
          moment().add(options.maxExpiration.value, options.maxExpiration.unit),
        ))
    ) {
      form.setFieldError(
        "expiration_num",
        t("upload.modal.expires.error.too-long", {
          max: moment
            .duration(options.maxExpiration.value, options.maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    onSubmit({
      id: await generateAvailableShareId(options.shareIdLength),
      name:
        values.name ||
        getDefaultShareName(
          selectedPaths.map((p) => ({ name: p.split("/").pop() || p })),
          t,
        ),
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
    });
  });

  return (
    <>
      {showNotSignedInAlert && !options.isUserSignedIn && (
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
      {
        // Carries the count/size forward from the browse step's own preview
        // — without this, that context simply vanishes the moment the user
        // moves past it, which the old two-modal flow never had to worry
        // about (the browse modal's own preview alert was still the last
        // thing on screen when "Créer un partage" opened over it).
      }
      <Text size="sm" color="dimmed" mb="md">
        {t("upload.nasImport.modal.preview-result", {
          count: preview.fileCount,
          size: byteToHumanSizeString(preview.totalSize),
        })}
      </Text>
      <form onSubmit={onFormSubmit}>
        <Stack align="stretch">
          <Grid align={form.errors.expiration_num ? "center" : "flex-end"}>
            <Col xs={6}>
              <NumberInput
                min={1}
                max={99999}
                precision={0}
                variant="filled"
                label={t("upload.modal.expires.label")}
                disabled={form.values.never_expires}
                {...form.getInputProps("expiration_num")}
              />
            </Col>
            <Col xs={6}>
              <Select
                disabled={form.values.never_expires}
                {...form.getInputProps("expiration_unit")}
                data={[
                  {
                    value: "-minutes",
                    label:
                      form.values.expiration_num == 1
                        ? t("upload.modal.expires.minute-singular")
                        : t("upload.modal.expires.minute-plural"),
                  },
                  {
                    value: "-hours",
                    label:
                      form.values.expiration_num == 1
                        ? t("upload.modal.expires.hour-singular")
                        : t("upload.modal.expires.hour-plural"),
                  },
                  {
                    value: "-days",
                    label:
                      form.values.expiration_num == 1
                        ? t("upload.modal.expires.day-singular")
                        : t("upload.modal.expires.day-plural"),
                  },
                  {
                    value: "-weeks",
                    label:
                      form.values.expiration_num == 1
                        ? t("upload.modal.expires.week-singular")
                        : t("upload.modal.expires.week-plural"),
                  },
                  {
                    value: "-months",
                    label:
                      form.values.expiration_num == 1
                        ? t("upload.modal.expires.month-singular")
                        : t("upload.modal.expires.month-plural"),
                  },
                  {
                    value: "-years",
                    label:
                      form.values.expiration_num == 1
                        ? t("upload.modal.expires.year-singular")
                        : t("upload.modal.expires.year-plural"),
                  },
                ]}
              />
            </Col>
          </Grid>
          {options.maxExpiration.value == 0 && (
            <Checkbox
              label={t("upload.modal.expires.never-long")}
              {...form.getInputProps("never_expires")}
            />
          )}
          <Text
            italic
            size="xs"
            sx={(theme) => ({
              color: theme.colors.gray[6],
            })}
          >
            {getExpirationPreview(
              {
                neverExpires: t("upload.modal.completed.never-expires"),
                expiresOn: t("upload.modal.completed.expires-on"),
              },
              form,
            )}
          </Text>
          <Accordion>
            <Accordion.Item value="description" sx={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.modal.accordion.name-and-description.title" />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack align="stretch">
                  <TextInput
                    variant="filled"
                    placeholder={t(
                      "upload.modal.accordion.name-and-description.name.placeholder",
                    )}
                    {...form.getInputProps("name")}
                  />
                  <Textarea
                    variant="filled"
                    placeholder={t(
                      "upload.modal.accordion.name-and-description.description.placeholder",
                    )}
                    {...form.getInputProps("description")}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            {options.enableEmailRecepients && (
              <Accordion.Item value="recipients" sx={{ borderBottom: "none" }}>
                <Accordion.Control>
                  <FormattedMessage id="upload.modal.accordion.email.title" />
                </Accordion.Control>
                <Accordion.Panel>
                  <MultiSelect
                    data={form.values.recipients}
                    placeholder={t("upload.modal.accordion.email.placeholder")}
                    searchable
                    creatable
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
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter" || e.key === "," || e.key === ";") {
                        e.preventDefault();
                        const inputValue = emailSearch.trim();
                        if (
                          inputValue.match(/^\S+@\S+\.\S+$/) &&
                          !form.values.recipients.includes(inputValue)
                        ) {
                          const newRecipients = [
                            ...form.values.recipients,
                            inputValue,
                          ];
                          form.setFieldValue("recipients", newRecipients);
                        }
                        setEmailSearch("");
                      } else if (e.key === " ") {
                        e.preventDefault();
                        setEmailSearch("");
                      }
                    }}
                  />
                  {options.enableUserRecipients && (
                    <Checkbox
                      mt="sm"
                      label={t(
                        "upload.modal.accordion.email.restrict-to-recipients",
                      )}
                      checked={form.values.restrictToRecipients}
                      onChange={(e) =>
                        handleRestrictToggle(e.currentTarget.checked)
                      }
                    />
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            )}

            <Accordion.Item value="security" sx={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.modal.accordion.security.title" />
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
                      autoComplete="new-password"
                      {...form.getInputProps("password")}
                    />
                  )}
                  <NumberInput
                    min={1}
                    type="number"
                    variant="filled"
                    placeholder={t(
                      "upload.modal.accordion.security.max-views.placeholder",
                    )}
                    label={t("upload.modal.accordion.security.max-views.label")}
                    {...form.getInputProps("maxViews")}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <Group position="apart">
            <Button variant="subtle" onClick={onBack}>
              <FormattedMessage id="common.button.back" />
            </Button>
            <Button type="submit" data-autofocus>
              <FormattedMessage id="common.button.share" />
            </Button>
          </Group>
        </Stack>
      </form>
    </>
  );
};

export default showNasImportModal;
