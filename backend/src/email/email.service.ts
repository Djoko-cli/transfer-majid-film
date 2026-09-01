import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { User } from "@prisma/client";
import * as moment from "moment";
import * as nodemailer from "nodemailer";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { APP_NAME, CONTACT_EMAIL } from "src/constants";
import { byteToHumanSizeString } from "src/utils/fileSize.util";
import { renderEmailEnvelope } from "./email.template";

export interface TransferFile {
  name: string;
  /** Raw byte count as stored on File.size — formatted for display inside sendMail/buildContent. */
  size: number;
}

interface SendMailOptions {
  replyTo?: string;
  code?: string;
  ctaUrl?: string;
  /** Overrides the generic "Open" button label — e.g. "Download your files". */
  ctaLabel?: string;
  headline?: string;
  metaLine?: string;
  downloadUrl?: string;
  files?: TransferFile[];
}

@Injectable()
export class EmailService {
  constructor(
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new Logger(EmailService.name);

  getTransporter() {
    if (!this.config.get("smtp.enabled"))
      throw new InternalServerErrorException(this.i18n.t("email.smtpDisabled"));

    const username = this.config.get("smtp.username");
    const password = this.config.get("smtp.password");

    return nodemailer.createTransport({
      host: this.config.get("smtp.host"),
      port: this.config.get("smtp.port"),
      secure: this.config.get("smtp.port") == 465,
      auth:
        username || password ? { user: username, pass: password } : undefined,
      tls: {
        rejectUnauthorized: !this.config.get(
          "smtp.allowUnauthorizedCertificates",
        ),
      },
    });
  }

  // Shared by sendMail and sendTestMail so the admin's "Test SMTP" button
  // previews the exact same branded envelope real emails go out in, not a
  // simplified stand-in. When HTML is off, returns `text` byte-for-byte —
  // unchanged from this method's behavior before the envelope existed.
  private buildContent(text: string, options?: SendMailOptions): string {
    if (!this.config.get("email.sendHtmlEmails")) return text;

    const appUrl = this.config.get("general.appUrl");
    return renderEmailEnvelope({
      appName: APP_NAME,
      appUrl,
      logoUrl: `${appUrl}/img/logo.png`,
      bodyText: text,
      code: options?.code,
      ctaUrl: options?.ctaUrl,
      ctaLabel: options?.ctaUrl
        ? options?.ctaLabel ||
          this.i18n.t("email.templateCtaButton", {
            lang: this.config.get("general.defaultLanguage"),
          })
        : undefined,
      headline: options?.headline,
      metaLine: options?.metaLine,
      downloadUrl: options?.downloadUrl,
      downloadUrlLabel: options?.downloadUrl
        ? this.i18n.t("email.downloadLinkLabel", {
            lang: this.config.get("general.defaultLanguage"),
          })
        : undefined,
      files: options?.files?.map((file) => ({
        name: file.name,
        size: byteToHumanSizeString(file.size),
      })),
      filesLabel: options?.files?.length
        ? this.i18n.t(
            options.files.length === 1
              ? "email.filesLabelSingular"
              : "email.filesLabelPlural",
            {
              lang: this.config.get("general.defaultLanguage"),
              args: { count: options.files.length },
            },
          )
        : undefined,
    });
  }

  private async sendMail(
    email: string,
    subject: string,
    text: string,
    options?: SendMailOptions,
  ) {
    const isHtml = this.config.get("email.sendHtmlEmails");
    const content = this.buildContent(text, options);

    await this.getTransporter()
      .sendMail({
        from: `"${APP_NAME}" <${this.config.get("smtp.email")}>`,
        to: email,
        subject: subject,
        [isHtml ? "html" : "text"]: content,
        ...(options?.replyTo && { replyTo: options.replyTo }),
      })
      .catch((e) => {
        this.logger.error(e);
        throw new InternalServerErrorException(this.i18n.t("email.sendFailed"));
      });
  }

  // {size} is already human-formatted (byteToHumanSizeString) by the caller
  // — this only picks the singular/plural i18n key and formats the date,
  // mirroring the frontend's own summary.singular/plural pattern for the
  // completed-upload modal.
  private buildMetaLine(
    fileCount: number,
    totalSize: string,
    expiration: Date,
  ) {
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });
    const expiresPhrase =
      moment(expiration).unix() != 0
        ? this.i18n.t("email.expiresOnLabel", {
            lang,
            args: { date: moment(expiration).locale(locale).format("LL") },
          })
        : this.i18n.t("email.neverExpiresLabel", { lang });

    return this.i18n.t(
      fileCount === 1 ? "email.metaLineSingular" : "email.metaLinePlural",
      { lang, args: { count: fileCount, size: totalSize, expiresPhrase } },
    );
  }

  async sendMailToShareRecipients(
    recipientEmail: string,
    recipientId: string,
    shareId: string,
    creator?: User,
    description?: string,
    expiration?: Date,
    files: TransferFile[] = [],
  ) {
    if (!this.config.get("email.enableShareEmailRecipients"))
      throw new InternalServerErrorException(
        this.i18n.t("email.emailServiceDisabled"),
      );

    const shareUrl = `${this.config.get(
      "general.appUrl",
    )}/s/${shareId}?recipient=${encodeURIComponent(recipientId)}`;
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });
    const creatorName =
      creator?.username ??
      this.i18n.t("email.shareRecipientsCreatorFallback", { lang });

    let replyTo: string | undefined = undefined;
    if (
      this.config.get("email.shareRecipientsReplyToCreator") &&
      creator?.email
    ) {
      replyTo = `"${creator.username}" <${creator.email}>`;
    }

    const totalSize = byteToHumanSizeString(
      files.reduce((sum, file) => sum + file.size, 0),
    );

    await this.sendMail(
      recipientEmail,
      this.config.get("email.shareRecipientsSubject"),
      this.config
        .get("email.shareRecipientsMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{creator}", creatorName)
        .replaceAll("{creatorEmail}", creator?.email ?? "")
        .replaceAll("{shareUrl}", shareUrl)
        .replaceAll(
          "{desc}",
          description ??
            this.i18n.t("email.shareRecipientsDescFallback", { lang }),
        )
        .replaceAll(
          "{expires}",
          moment(expiration).unix() != 0
            ? moment(expiration).locale(locale).fromNow()
            : this.i18n.t("email.shareRecipientsExpiresNeverFallback", {
                lang,
              }),
        ),
      {
        replyTo,
        ctaUrl: shareUrl,
        ctaLabel: this.i18n.t("email.downloadButtonLabel", { lang }),
        headline: this.i18n.t(
          files.length === 1
            ? "email.recipientHeadlineSingular"
            : "email.recipientHeadlinePlural",
          {
            lang,
            args: {
              creator: creatorName,
              fileName: files[0]?.name,
              count: files.length,
            },
          },
        ),
        metaLine: files.length
          ? this.buildMetaLine(files.length, totalSize, expiration)
          : undefined,
        downloadUrl: shareUrl,
        files,
      },
    );
  }

  async sendShareDownloadNotification(
    creatorEmail: string,
    shareId: string,
    fileName: string,
    recipientEmail: string,
  ) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;

    await this.sendMail(
      creatorEmail,
      this.config.get("email.shareDownloadNotificationSubject"),
      this.config
        .get("email.shareDownloadNotificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{recipientEmail}", recipientEmail)
        .replaceAll("{fileName}", fileName)
        .replaceAll("{shareUrl}", shareUrl),
      { ctaUrl: shareUrl },
    );
  }

  // Same notification, for a share with no named recipient to report (a
  // Link-mode share, anonymous or signed-in) — see FileService.notifyDownload.
  async sendOwnerDownloadNotification(
    ownerEmail: string,
    shareId: string,
    fileName: string,
  ) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;

    await this.sendMail(
      ownerEmail,
      this.config.get("email.ownerDownloadNotificationSubject"),
      this.config
        .get("email.ownerDownloadNotificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{fileName}", fileName)
        .replaceAll("{shareUrl}", shareUrl),
      { ctaUrl: shareUrl },
    );
  }

  async sendMailToReverseShareCreator(recipientEmail: string, shareId: string) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;

    await this.sendMail(
      recipientEmail,
      this.config.get("email.reverseShareSubject"),
      this.config
        .get("email.reverseShareMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{shareUrl}", shareUrl),
      { ctaUrl: shareUrl },
    );
  }

  // An anonymous sender only ever sees their own link once, in a modal that
  // now closes on click-outside — with no account and no "Mes partages" to
  // fall back to, a mis-click loses the transfer permanently even though it
  // still exists and counts against storage. Emailing the same link to the
  // address they typed at creation time is the only durable backstop.
  async sendShareLinkToSender(
    recipientEmail: string,
    shareId: string,
    shareName: string | undefined,
    expiration: Date,
    files: TransferFile[] = [],
  ) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });
    const totalSize = byteToHumanSizeString(
      files.reduce((sum, file) => sum + file.size, 0),
    );

    await this.sendMail(
      recipientEmail,
      this.config.get("email.anonymousSenderLinkSubject"),
      this.config
        .get("email.anonymousSenderLinkMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{name}", shareName ? ` « ${shareName} »` : "")
        .replaceAll("{shareUrl}", shareUrl)
        .replaceAll(
          "{expires}",
          moment(expiration).unix() != 0
            ? moment(expiration).locale(locale).fromNow()
            : this.i18n.t("email.shareRecipientsExpiresNeverFallback", {
                lang,
              }),
        ),
      {
        // No CTA button here on purpose — unlike the recipient's email
        // above, there's no urgent action to take on your own sent
        // transfer; the link below is a reference copy, not a download
        // prompt (see EmailEnvelopeOptions.downloadUrl vs ctaUrl).
        // Mirrors the in-app completed-upload modal's own named/generic
        // title split (share-ready-named vs share-ready) for consistency
        // between the live confirmation and this backup email.
        headline: shareName
          ? this.i18n.t("email.senderHeadlineNamed", {
              lang,
              args: { name: shareName },
            })
          : this.i18n.t("email.senderHeadline", { lang }),
        metaLine: files.length
          ? this.buildMetaLine(files.length, totalSize, expiration)
          : undefined,
        downloadUrl: shareUrl,
        files,
      },
    );
  }

  // Nudge for a share that's about to expire and hasn't been picked back
  // up — sent to whoever owns it (signed-in creator or anonymous
  // senderEmail) by JobsService.notifyExpiringSenders(). Unlike
  // sendShareLinkToSender above, this one *does* carry a CTA button: that
  // email is a passive backup copy of a link you already have, this one
  // is prompting an action (go check it / grab it again) before it's gone.
  async sendSenderExpiryReminder(
    recipientEmail: string,
    shareId: string,
    shareName: string | undefined,
    expiration: Date,
    files: TransferFile[] = [],
  ) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });
    const totalSize = byteToHumanSizeString(
      files.reduce((sum, file) => sum + file.size, 0),
    );

    await this.sendMail(
      recipientEmail,
      this.config.get("email.expiringSenderNotificationSubject"),
      this.config
        .get("email.expiringSenderNotificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{name}", shareName ? ` « ${shareName} »` : "")
        .replaceAll("{shareUrl}", shareUrl),
      {
        ctaUrl: shareUrl,
        ctaLabel: this.i18n.t("email.viewShareButtonLabel", { lang }),
        headline: shareName
          ? this.i18n.t("email.expiringSenderHeadlineNamed", {
              lang,
              args: { name: shareName },
            })
          : this.i18n.t("email.expiringSenderHeadline", { lang }),
        metaLine: files.length
          ? this.buildMetaLine(files.length, totalSize, expiration)
          : undefined,
        downloadUrl: shareUrl,
        files,
      },
    );
  }

  // Same nudge, for a named Email-mode recipient who hasn't downloaded
  // yet — sent by JobsService.notifyExpiringRecipients(). Reuses the same
  // ?recipient= tracking URL sendMailToShareRecipients uses, so a click
  // through from this email still marks ShareRecipient.downloadedAt via
  // the normal download path.
  async sendRecipientExpiryReminder(
    recipientEmail: string,
    recipientId: string,
    shareId: string,
    creator: User | undefined,
    expiration: Date,
    files: TransferFile[] = [],
  ) {
    const shareUrl = `${this.config.get(
      "general.appUrl",
    )}/s/${shareId}?recipient=${encodeURIComponent(recipientId)}`;
    const lang = this.config.get("general.defaultLanguage");
    const totalSize = byteToHumanSizeString(
      files.reduce((sum, file) => sum + file.size, 0),
    );
    const creatorName =
      creator?.username ??
      this.i18n.t("email.shareRecipientsCreatorFallback", { lang });

    await this.sendMail(
      recipientEmail,
      this.config.get("email.expiringRecipientNotificationSubject"),
      this.config
        .get("email.expiringRecipientNotificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{shareUrl}", shareUrl),
      {
        ctaUrl: shareUrl,
        ctaLabel: this.i18n.t("email.downloadButtonLabel", { lang }),
        headline: this.i18n.t(
          files.length === 1
            ? "email.expiringRecipientHeadlineSingular"
            : "email.expiringRecipientHeadlinePlural",
          {
            lang,
            args: {
              creator: creatorName,
              fileName: files[0]?.name,
              count: files.length,
            },
          },
        ),
        metaLine: files.length
          ? this.buildMetaLine(files.length, totalSize, expiration)
          : undefined,
        downloadUrl: shareUrl,
        files,
      },
    );
  }

  async sendResetPasswordEmail(recipientEmail: string, token: string) {
    const resetPasswordUrl = `${this.config.get(
      "general.appUrl",
    )}/auth/resetPassword/${token}`;

    await this.sendMail(
      recipientEmail,
      this.config.get("email.resetPasswordSubject"),
      this.config
        .get("email.resetPasswordMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{url}", resetPasswordUrl),
      { ctaUrl: resetPasswordUrl },
    );
  }

  async sendInviteEmail(recipientEmail: string, password: string) {
    const loginUrl = `${this.config.get("general.appUrl")}/auth/signIn`;

    await this.sendMail(
      recipientEmail,
      this.config.get("email.inviteSubject"),
      this.config
        .get("email.inviteMessage")
        .replaceAll("{url}", loginUrl)
        .replaceAll("{password}", password)
        .replaceAll("{email}", recipientEmail),
      { ctaUrl: loginUrl },
    );
  }

  // token doubles as both the /auth/verify/:token link's last path segment
  // and a human-typeable 6-digit code (see AuthService.signUp) — the email
  // offers both ways in, hence both {url} and {code} substituted here.
  async sendVerificationEmail(recipientEmail: string, token: string) {
    const verificationUrl = `${this.config.get(
      "general.appUrl",
    )}/auth/verify/${token}`;

    await this.sendMail(
      recipientEmail,
      this.config.get("email.verificationSubject"),
      this.config
        .get("email.verificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{url}", verificationUrl)
        .replaceAll("{code}", token),
      { code: token, ctaUrl: verificationUrl },
    );
  }

  async sendVerificationCode(recipientEmail: string, code: string) {
    await this.sendMail(
      recipientEmail,
      this.config.get("verification.codeSubject"),
      this.config
        .get("verification.codeMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{code}", code),
      { code },
    );
  }

  // Only send* method whose "to" is fixed (CONTACT_EMAIL) rather than a
  // parameter — every other one sends an app notification out to a user;
  // this is the one direction that runs the other way, a visitor's own
  // words reaching the site owner. subject is free text the visitor
  // typed, so it goes through nodemailer's own `subject` field rather than
  // anything hand-concatenated into raw headers the way ContactController's
  // now-upstream DTO validation already guards against on the way in.
  async sendContactMessage(subject: string, message: string, replyTo?: string) {
    const lang = this.config.get("general.defaultLanguage");
    const sender =
      replyTo ?? this.i18n.t("email.contactAnonymousSender", { lang });

    await this.sendMail(
      CONTACT_EMAIL,
      `[Contact] ${subject}`,
      `${this.i18n.t("email.contactFromLabel", { lang })} ${sender}\n\n${message}`,
      {
        replyTo,
        headline: this.i18n.t("email.contactHeadline", { lang }),
      },
    );
  }

  async sendTestMail(recipientEmail: string) {
    const isHtml = this.config.get("email.sendHtmlEmails");
    const lang = this.config.get("general.defaultLanguage");
    const subject = this.i18n.t("email.testSubject", { lang });
    const content = this.buildContent(this.i18n.t("email.testText", { lang }));

    // Deliberately doesn't go through the shared sendMail() above — that
    // method swallows the real transport error behind a generic translated
    // message, but the admin's "Test SMTP" button is a diagnostic tool: it
    // needs to surface the actual failure (bad host, auth rejected, TLS
    // mismatch...), not "failed to send". buildContent() is still shared,
    // so this previews the exact same branded envelope a real email uses.
    await this.getTransporter()
      .sendMail({
        from: `"${APP_NAME}" <${this.config.get("smtp.email")}>`,
        to: recipientEmail,
        subject,
        [isHtml ? "html" : "text"]: content,
      })
      .catch((e) => {
        this.logger.error(e);
        throw new InternalServerErrorException(e.message);
      });
  }
}
