import {
  Button,
  Col,
  Grid,
  Group,
  MantineProvider,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { Timespan } from "../../../types/timespan.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import { generateShareId } from "../../../utils/share.util";
import toast from "../../../utils/toast.util";
import FileSizeInput from "../../core/FileSizeInput";
import glassFormTheme from "../../upload/glassFormTheme";
import { glassModalStyles } from "../../upload/glassModalTheme";
import CustomUrlInput from "../CustomUrlInput";
import showCompletedReverseShareModal from "./showCompletedReverseShareModal";

const showCreateReverseShareModal = (
  modals: ModalsContextProps,
  showSendEmailNotificationOption: boolean,
  maxExpiration: Timespan,
  defaultExpiration: Timespan,
  appUrl: string,
  defaultAppUrl: string,
  maxShareSize: number,
  getReverseShares: () => void,
  shareIdLength: number = 16,
) => {
  const t = translateOutsideContext();

  return modals.openModal({
    title: t("account.reverseShares.modal.title"),
    styles: glassModalStyles,
    children: (
      <MantineProvider inherit theme={glassFormTheme}>
        <Body
          showSendEmailNotificationOption={showSendEmailNotificationOption}
          getReverseShares={getReverseShares}
          maxExpiration={maxExpiration}
          defaultExpiration={defaultExpiration}
          appUrl={appUrl}
          defaultAppUrl={defaultAppUrl}
          maxShareSize={maxShareSize}
          shareIdLength={shareIdLength}
        />
      </MantineProvider>
    ),
  });
};

const Body = ({
  getReverseShares,
  showSendEmailNotificationOption,
  maxExpiration,
  defaultExpiration,
  appUrl,
  defaultAppUrl,
  maxShareSize,
  shareIdLength = 16,
}: {
  getReverseShares: () => void;
  showSendEmailNotificationOption: boolean;
  maxExpiration: Timespan;
  defaultExpiration: Timespan;
  appUrl: string;
  defaultAppUrl: string;
  maxShareSize: number;
  shareIdLength?: number;
}) => {
  const modals = useModals();
  const t = useTranslate();

  const userMaxShareSize = maxShareSize;
  const generatedToken = generateShareId(shareIdLength);

  const defaultTimespan = defaultExpiration
    ? defaultExpiration
    : { value: 7, unit: "days" };

  // No config-driven default for this one — collectionEndsAt has
  // share.defaultExpiration to fall back on, but how long an album
  // survives after deposits close is a new question this form didn't use
  // to ask at all.
  const defaultRetention = { value: 7, unit: "days" };

  const form = useForm({
    initialValues: {
      token: generatedToken,
      // "" rather than undefined for every string field here — an
      // <input value={undefined}> starts uncontrolled, and the first
      // keystroke (the value becoming a real string) would flip it to
      // controlled mid-lifecycle, which React warns about loudly. Each
      // field's own yup transform below already normalizes "" back to
      // undefined before validating/submitting, so this changes nothing
      // about what actually gets sent.
      name: "",
      description: "",
      password: "",
      maxViews: undefined as number | undefined,
      maxShareSize: userMaxShareSize,
      // 1 killed the scenario at the first friend: a group deposit link
      // whose second contributor got refused. 20 leaves room for an
      // actual group while still being a deliberate cap, not "unlimited".
      maxUseCount: 20,
      sendEmailNotification: false,
      collectionEndsAt_num: defaultTimespan.value,
      collectionEndsAt_unit: `-${defaultTimespan.unit}` as string,
      retention_num: defaultRetention.value,
      retention_unit: `-${defaultRetention.unit}` as string,
    },
    validate: yupResolver(
      yup.object().shape({
        token: yup
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
        description: yup
          .string()
          .transform((value) => value || undefined)
          .max(512, t("common.error.too-long", { length: 512 })),
        password: yup
          .string()
          .transform((value) => value || undefined)
          .min(3, t("common.error.too-short", { length: 3 }))
          .max(30, t("common.error.too-long", { length: 30 })),
        maxViews: yup
          .number()
          .transform((value) => value || undefined)
          .min(1, t("common.error.number-too-small", { min: 1 })),
        maxUseCount: yup
          .number()
          .typeError(t("common.error.invalid-number"))
          .min(1, t("common.error.number-too-small", { min: 1 }))
          .max(1000, t("common.error.number-too-large", { max: 1000 }))
          .required(t("common.error.field-required")),
        maxShareSize: yup
          .number()
          .typeError(t("common.error.invalid-number"))
          .max(
            userMaxShareSize,
            t("upload.dropzone.notify.file-too-big", {
              maxSize: byteToHumanSizeString(userMaxShareSize),
            }),
          )
          .required(t("common.error.field-required")),
      }),
    ),
  });

  const onSubmit = form.onSubmit(async (values) => {
    if (!(await shareService.isReverseShareTokenAvailable(values.token))) {
      form.setFieldError("token", t("upload.modal.link.error.taken"));
      return;
    }

    // The cap has to bind on the container's real death, not just the
    // close of deposits — same reasoning as
    // ReverseShareService.create()'s own containerExpiration comment. A
    // short collection window with years of retention would otherwise
    // sail straight past an admin-set maxExpiration.
    const collectionEndsAtDate = moment().add(
      values.collectionEndsAt_num,
      values.collectionEndsAt_unit.replace(
        "-",
        "",
      ) as moment.unitOfTime.DurationConstructor,
    );
    const containerExpirationDate = collectionEndsAtDate.clone().add(
      values.retention_num,
      values.retention_unit.replace(
        "-",
        "",
      ) as moment.unitOfTime.DurationConstructor,
    );
    if (
      maxExpiration.value != 0 &&
      containerExpirationDate.isAfter(
        moment().add(maxExpiration.value, maxExpiration.unit),
      )
    ) {
      form.setFieldError(
        "retention_num",
        t("upload.modal.expires.error.too-long", {
          max: moment
            .duration(maxExpiration.value, maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    shareService
      .createReverseShare(
        values.collectionEndsAt_num + values.collectionEndsAt_unit,
        values.retention_num + values.retention_unit,
        values.maxShareSize,
        values.maxUseCount,
        values.sendEmailNotification,
        values.token,
        // Not just values.name (etc.) — those are "" when left blank (see
        // initialValues' own comment), and the backend's @IsOptional()
        // only skips its length checks for null/undefined, not "": an
        // empty string would fail validation on every reverse share
        // created without these set, the common case.
        values.name || undefined,
        values.description || undefined,
        values.password || undefined,
        values.maxViews || undefined,
      )
      .then(({ token }) => {
        modals.closeAll();
        const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/s/${token}`;
        showCompletedReverseShareModal(modals, link, getReverseShares);
      })
      .catch(toast.axiosError);
  });

  // Shared by both clocks' unit <Select>s — singular/plural label,
  // otherwise identical data for either field.
  const timeUnitOptions = (num: number) => [
    {
      value: "-minutes",
      label:
        num == 1
          ? t("upload.modal.expires.minute-singular")
          : t("upload.modal.expires.minute-plural"),
    },
    {
      value: "-hours",
      label:
        num == 1
          ? t("upload.modal.expires.hour-singular")
          : t("upload.modal.expires.hour-plural"),
    },
    {
      value: "-days",
      label:
        num == 1
          ? t("upload.modal.expires.day-singular")
          : t("upload.modal.expires.day-plural"),
    },
    {
      value: "-weeks",
      label:
        num == 1
          ? t("upload.modal.expires.week-singular")
          : t("upload.modal.expires.week-plural"),
    },
    {
      value: "-months",
      label:
        num == 1
          ? t("upload.modal.expires.month-singular")
          : t("upload.modal.expires.month-plural"),
    },
    {
      value: "-years",
      label:
        num == 1
          ? t("upload.modal.expires.year-singular")
          : t("upload.modal.expires.year-plural"),
    },
  ];

  // Live previews, recomputed every render off the form's current values
  // — chained, not independent: the album's real death is collectionEnds
  // + retention, same as ReverseShareService.create()'s own
  // containerExpiration.
  const collectionEndsAtDate = moment().add(
    form.values.collectionEndsAt_num,
    form.values.collectionEndsAt_unit.replace(
      "-",
      "",
    ) as moment.unitOfTime.DurationConstructor,
  );
  const containerExpiresAtDate = collectionEndsAtDate.clone().add(
    form.values.retention_num,
    form.values.retention_unit.replace(
      "-",
      "",
    ) as moment.unitOfTime.DurationConstructor,
  );

  return (
    <Group>
      <form onSubmit={onSubmit}>
        <Stack align="stretch">
          {
            // Name (and everything below, down through the security
            // fields) only ever set here, by this link's own creator —
            // whoever uploads through it gets no form of their own any
            // more at all (see UploadPage.tsx: submitting now goes
            // straight from the file list to the upload itself). Leads
            // the form, ahead of the link itself, as the first real
            // decision being made here.
          }
          <TextInput
            variant="filled"
            label={t("account.reverseShares.modal.name.label")}
            {...form.getInputProps("name")}
          />
          <Textarea
            variant="filled"
            label={t("account.reverseShares.modal.description.label")}
            {...form.getInputProps("description")}
          />
          <CustomUrlInput
            form={form}
            fieldName="token"
            shareIdLength={shareIdLength}
            appUrl={appUrl}
            defaultAppUrl={defaultAppUrl}
          />
          {
            // Two clocks, not one (spec §8): this one closes deposits,
            // the next one says how long the album survives after that.
            // Same "number + unit" shape as the single field this
            // replaces, duplicated rather than parameterized into a
            // sub-component — two fields don't earn the indirection.
          }
          <div>
            <Grid
              align={form.errors.collectionEndsAt_num ? "center" : "flex-end"}
            >
              <Col xs={6}>
                <NumberInput
                  min={1}
                  max={99999}
                  precision={0}
                  variant="filled"
                  label={t("account.reverseShares.modal.collection-ends.label")}
                  {...form.getInputProps("collectionEndsAt_num")}
                />
              </Col>
              <Col xs={6}>
                <Select
                  {...form.getInputProps("collectionEndsAt_unit")}
                  data={timeUnitOptions(form.values.collectionEndsAt_num)}
                />
              </Col>
            </Grid>
            <Text
              mt="sm"
              italic
              size="xs"
              sx={(theme) => ({
                color: theme.colors.gray[6],
              })}
            >
              {t("account.reverseShares.modal.collection-ends.preview", {
                expiration: collectionEndsAtDate.format("LLL"),
              })}
            </Text>
          </div>
          <div>
            <Grid align={form.errors.retention_num ? "center" : "flex-end"}>
              <Col xs={6}>
                <NumberInput
                  min={1}
                  max={99999}
                  precision={0}
                  variant="filled"
                  label={t("account.reverseShares.modal.retention.label")}
                  {...form.getInputProps("retention_num")}
                />
              </Col>
              <Col xs={6}>
                <Select
                  {...form.getInputProps("retention_unit")}
                  data={timeUnitOptions(form.values.retention_num)}
                />
              </Col>
            </Grid>
            <Text
              mt="sm"
              italic
              size="xs"
              sx={(theme) => ({
                color: theme.colors.gray[6],
              })}
            >
              {t("account.reverseShares.modal.retention.preview", {
                expiration: containerExpiresAtDate.format("LLL"),
              })}
            </Text>
          </div>
          <FileSizeInput
            label={t("account.reverseShares.modal.max-size.label")}
            {...form.getInputProps("maxShareSize")}
          />
          <NumberInput
            min={1}
            max={1000}
            precision={0}
            variant="filled"
            label={t("account.reverseShares.modal.max-use.label")}
            description={t("account.reverseShares.modal.max-use.description")}
            {...form.getInputProps("maxUseCount")}
          />
          {
            // Same two fields as a direct share's own "Options de
            // sécurité" — moved here for the same reason as name/
            // description above. No "restrict to recipients" option:
            // that only ever made sense against a recipients list, and a
            // reverse share's creator has no such list to build here.
          }
          <PasswordInput
            variant="filled"
            label={t("account.reverseShares.modal.password.label")}
            autoComplete="new-password"
            {...form.getInputProps("password")}
          />
          <NumberInput
            min={1}
            variant="filled"
            label={t("account.reverseShares.modal.max-views.label")}
            {...form.getInputProps("maxViews")}
          />
          {showSendEmailNotificationOption && (
            <Switch
              mt="xs"
              labelPosition="left"
              label={t("account.reverseShares.modal.send-email")}
              description={t(
                "account.reverseShares.modal.send-email.description",
              )}
              {...form.getInputProps("sendEmailNotification", {
                type: "checkbox",
              })}
            />
          )}
          <Button mt="md" type="submit">
            <FormattedMessage id="common.button.create" />
          </Button>
        </Stack>
      </form>
    </Group>
  );
};

export default showCreateReverseShareModal;
