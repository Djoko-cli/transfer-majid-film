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
import EmailRecipientsInput from "../../core/EmailRecipientsInput";
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

  const toDays = (span: { value: number; unit: string }) =>
    Math.max(
      1,
      Math.round(
        moment
          .duration(span.value, span.unit as moment.unitOfTime.Base)
          .asDays(),
      ),
    );

  const defaultTimespan = defaultExpiration
    ? defaultExpiration
    : { value: 7, unit: "days" };

  // No config-driven default for this one — collectionEndsAt has
  // share.defaultExpiration to fall back on, but how long a transfer
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
      maxShareSize: userMaxShareSize,
      // 1 killed the scenario at the first friend: a group deposit link
      // whose second contributor got refused. 20 leaves room for an
      // actual group while still being a deliberate cap, not "unlimited".
      maxUseCount: 20,
      recipients: [] as string[],
      sendEmailNotification: false,
      // Days, and only days. A collection lasts a few days or a few
      // weeks; offering hours and years cost a second control that said
      // nothing the first one could not. The configured default may be
      // expressed in any unit, so it is converted rather than assumed.
      collectionEndsAt_days: toDays(defaultTimespan),
      retention_days: toDays(defaultRetention),
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
      values.collectionEndsAt_days,
      "days",
    );
    const containerExpirationDate = collectionEndsAtDate
      .clone()
      .add(values.retention_days, "days");
    if (
      maxExpiration.value != 0 &&
      containerExpirationDate.isAfter(
        moment().add(maxExpiration.value, maxExpiration.unit),
      )
    ) {
      form.setFieldError(
        "retention_days",
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
        `${values.collectionEndsAt_days}-days`,
        `${values.retention_days}-days`,
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
        values.recipients,
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
  // Live previews, recomputed every render off the form's current values
  // — chained, not independent: the transfer's real death is collectionEnds
  // + retention, same as ReverseShareService.create()'s own
  // containerExpiration.
  const collectionEndsAtDate = moment().add(
    form.values.collectionEndsAt_days,
    "days",
  );
  const containerExpiresAtDate = collectionEndsAtDate
    .clone()
    .add(form.values.retention_days, "days");

  // The ceiling is not this form's to pick: it is share.maxExpiration from
  // the admin console, and a 0 there means no ceiling at all (which is also
  // what an admin or a permanent-share user is handed, see the call site).
  // The two fields share that one budget, so each one's own maximum is
  // whatever the other leaves — without which the form would cheerfully
  // accept a pair the server then refuses, which is a worse way to learn
  // the rule than not being offered it.
  const capDays =
    maxExpiration.value === 0
      ? null
      : Math.floor(
          moment.duration(maxExpiration.value, maxExpiration.unit).asDays(),
        );
  const maxCollectionDays = capDays
    ? Math.max(1, capDays - form.values.retention_days)
    : undefined;
  const maxRetentionDays = capDays
    ? Math.max(1, capDays - form.values.collectionEndsAt_days)
    : undefined;

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
            // Sous le lien, parce que c'est du lien qu'il s'agit : jusqu'ici
            // le formulaire s'arrêtait à le fabriquer et laissait son
            // créateur le coller lui-même dans une autre application. Le
            // même champ que les destinataires d'un transfert direct, au
            // mot près — c'est le même geste. Masqué quand SMTP est éteint,
            // comme la notification plus bas : offrir d'inviter sans
            // pouvoir envoyer ne serait qu'un piège.
            showSendEmailNotificationOption && (
              <EmailRecipientsInput
                values={form.values.recipients}
                onChange={(next) => form.setFieldValue("recipients", next)}
                error={form.errors.recipients}
                onError={(message) =>
                  form.setFieldError("recipients", message)
                }
                id="reverse-share-invites"
                label={t("account.reverseShares.modal.invite.label")}
                placeholder={t(
                  "account.reverseShares.modal.invite.placeholder",
                )}
                description={t(
                  "account.reverseShares.modal.invite.description",
                )}
              />
            )
          }
          {
            // Two clocks, not one (spec §8): this one closes deposits,
            // the next one says how long the transfer survives after that.
            // Same "number + unit" shape as the single field this
            // replaces, duplicated rather than parameterized into a
            // sub-component — two fields don't earn the indirection.
          }
          <div>
            <NumberInput
              min={1}
              max={maxCollectionDays}
              precision={0}
              variant="filled"
              label={t("account.reverseShares.modal.collection-ends.label")}
              {...form.getInputProps("collectionEndsAt_days")}
            />
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
            <NumberInput
              min={1}
              max={maxRetentionDays}
              precision={0}
              variant="filled"
              label={t("account.reverseShares.modal.retention.label")}
              {...form.getInputProps("retention_days")}
            />
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
            // A password, and only a password. A direct share's other
            // security field, "nombre de vues maximum", was offered here
            // too and should never have been: it writes the CONTAINER's
            // view cap, and the container's page is the one every
            // contributor opens to deposit and the owner reloads to watch
            // files arrive. A cap of 5 locked the sixth visitor — or the
            // owner's sixth refresh — out of the collection entirely (see
            // ShareService.getShareToken's own check). The cap that means
            // something in this mode counts contributions, and that is
            // "utilisations maximum" above.
          }
          <PasswordInput
            variant="filled"
            label={t("account.reverseShares.modal.password.label")}
            autoComplete="new-password"
            {...form.getInputProps("password")}
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
