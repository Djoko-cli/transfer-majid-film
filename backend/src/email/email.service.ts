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
  /** Sender-side only — see EmailEnvelopeOptions.recipients for why a
   * recipient's own copy must never carry this. */
  recipients?: string[];
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
      recipients: options?.recipients,
      recipientsLabel: options?.recipients?.length
        ? this.i18n.t("email.recipientsLabel", {
            lang: this.config.get("general.defaultLanguage"),
          })
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
    shareName: string | undefined,
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
      this.i18n.t("email.shareRecipientsSubject", { lang }),
      this.i18n
        .t("email.shareRecipientsMessage", { lang })
        .replaceAll("\\n", "\n")
        .replaceAll("{creator}", creatorName)
        .replaceAll("{creatorEmail}", creator?.email ?? "")
        .replaceAll("{shareUrl}", shareUrl)
        // An absent description substitutes to nothing at all. It used to
        // substitute to "No description", which is a sentence about the
        // sender's form-filling rather than anything the recipient wants —
        // and with the default template being just "{desc}", it was the
        // entire message. The HTML envelope already carries the headline,
        // the size/expiry line, the download button and the file list, so
        // an empty body loses nothing.
        .replaceAll("{desc}", description ?? "")
        .replaceAll(
          "{expires}",
          moment(expiration).unix() != 0
            ? moment(expiration).locale(locale).fromNow()
            : this.i18n.t("email.shareRecipientsExpiresNeverFallback", {
                lang,
              }),
        )
        // Last, so it tidies after every substitution rather than only the
        // one above it. Removing a placeholder can leave the blank line
        // that separated it from its neighbours doubled up — harmless in
        // HTML, where renderParagraphs drops empty paragraphs, but a
        // plain-text mail would show the gap.
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
      {
        replyTo,
        ctaUrl: shareUrl,
        ctaLabel: this.i18n.t("email.downloadButtonLabel", { lang }),
        // The sender's own name for the transfer wins whenever they gave
        // one: it is the only part of this headline they actually chose,
        // and it says what the thing IS. The file name is a stand-in for
        // it — a decent one for a single file, useless for "Capture
        // d'écran 2026-09-16 à 18.15.10.png", and silently discarded for
        // several files in favour of a bare count. Same named/generic
        // split the sender's own confirmation already makes (see
        // senderHeadlineNamed in sendShareLinkToSender), so both ends of
        // one transfer now call it by the same name.
        headline: shareName
          ? this.i18n.t("email.recipientHeadlineNamed", {
              lang,
              args: { creator: creatorName, name: shareName },
            })
          : this.i18n.t(
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
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      creatorEmail,
      this.i18n.t("email.shareDownloadNotificationSubject", { lang }),
      this.i18n
        .t("email.shareDownloadNotificationMessage", { lang })
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
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      ownerEmail,
      this.i18n.t("email.ownerDownloadNotificationSubject", { lang }),
      this.i18n
        .t("email.ownerDownloadNotificationMessage", { lang })
        .replaceAll("\\n", "\n")
        .replaceAll("{fileName}", fileName)
        .replaceAll("{shareUrl}", shareUrl),
      { ctaUrl: shareUrl },
    );
  }

  async sendMailToReverseShareCreator(recipientEmail: string, shareId: string) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      recipientEmail,
      this.i18n.t("email.reverseShareSubject", { lang }),
      this.i18n
        .t("email.reverseShareMessage", { lang })
        .replaceAll("\\n", "\n")
        .replaceAll("{shareUrl}", shareUrl),
      { ctaUrl: shareUrl },
    );
  }

  // An anonymous sender only ever sees their own link once, in a modal that
  // now closes on click-outside — with no account and no "Mes transferts" to
  // fall back to, a mis-click loses the transfer permanently even though it
  // still exists and counts against storage. Emailing the same link to the
  // address they typed at creation time is the only durable backstop.
  async sendShareLinkToSender(
    recipientEmail: string,
    shareId: string,
    shareName: string | undefined,
    expiration: Date,
    files: TransferFile[] = [],
    recipients: string[] = [],
  ) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });
    const totalSize = byteToHumanSizeString(
      files.reduce((sum, file) => sum + file.size, 0),
    );

    await this.sendMail(
      recipientEmail,
      this.i18n.t("email.anonymousSenderLinkSubject", { lang }),
      this.i18n
        .t("email.anonymousSenderLinkMessage", { lang })
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
        // Mirrors the in-app completed-upload modal's own split, both ways:
        // named vs generic, and "sent" vs "ready". An anonymous sender can
        // address a transfer or just take a link, and only the first of
        // those put anything in the post — saying "envoyé" over a Link-mode
        // share would claim a delivery that never happened.
        headline: recipients.length
          ? shareName
            ? this.i18n.t("email.senderHeadlineNamed", {
                lang,
                args: { name: shareName },
              })
            : this.i18n.t("email.senderHeadline", { lang })
          : shareName
            ? this.i18n.t("email.senderHeadlineReadyNamed", {
                lang,
                args: { name: shareName },
              })
            : this.i18n.t("email.senderHeadlineReady", { lang }),
        metaLine: files.length
          ? this.buildMetaLine(files.length, totalSize, expiration)
          : undefined,
        downloadUrl: shareUrl,
        files,
        // An anonymous sender can address a transfer too, and this email is
        // their only copy of who it went to — the same record the signed-in
        // creator's receipt below carries. Empty in Link mode, where the
        // section simply does not render.
        recipients,
      },
    );
  }

  // The signed-in sender's own receipt, sent the moment a share is
  // finished. Distinct from sendShareLinkToSender above, which exists
  // because an anonymous sender would otherwise LOSE the link: a creator
  // has "Mes transferts" and never loses anything, so this one is not a
  // backstop but a record — what went out, to whom, when. That is the part
  // "Mes transferts" genuinely cannot show, because it lists shares, not
  // sends, and a recipient list is not otherwise recoverable from the UI.
  //
  // Gated per user rather than by admin config (User.notifyOnSentShares,
  // default on) — it lands in a personal mailbox, so the person who owns
  // that mailbox decides.
  async sendShareConfirmationToSender(
    creatorEmail: string,
    shareId: string,
    shareName: string | undefined,
    expiration: Date,
    files: TransferFile[] = [],
    recipients: string[] = [],
  ) {
    const shareUrl = `${this.config.get("general.appUrl")}/s/${shareId}`;
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });
    const totalSize = byteToHumanSizeString(
      files.reduce((sum, file) => sum + file.size, 0),
    );

    // One recipient is named outright, several are counted: a headline is
    // one line and an address is long. The full list is right below in its
    // own section either way, so nothing is hidden by counting here.
    const headline = recipients.length
      ? this.i18n.t(
          recipients.length === 1
            ? shareName
              ? "email.senderConfirmationHeadlineNamedOne"
              : "email.senderConfirmationHeadlineOne"
            : shareName
              ? "email.senderConfirmationHeadlineNamedMany"
              : "email.senderConfirmationHeadlineMany",
          {
            lang,
            args: {
              name: shareName,
              recipient: recipients[0],
              count: recipients.length,
            },
          },
        )
      : // Link mode: nobody was mailed, so there is nobody to name — and
        // nothing to call sent either. The share is ready and its sender
        // still has to pass the link on, which is what these two say.
        shareName
        ? this.i18n.t("email.senderHeadlineReadyNamed", {
            lang,
            args: { name: shareName },
          })
        : this.i18n.t("email.senderHeadlineReady", { lang });

    // What the subject calls this transfer. Named or not, it has to be
    // something the sender can pick out of a mailbox months later, so an
    // unnamed transfer borrows the recipient email's own fallback rather
    // than inventing a third convention: the file's name when there is one
    // file, the item count when there are several. complete() refuses a
    // share with no files at all, so there is no empty case to answer for.
    const subjectName =
      shareName ??
      (files.length === 1
        ? files[0].name
        : this.i18n.t("email.filesLabelPlural", {
            lang,
            args: { count: files.length },
          }));

    // The preposition lives in here rather than in the template, so Link
    // mode — nobody was mailed, so there is nobody to name — collapses the
    // whole fragment instead of leaving a dangling "à". The template's own
    // spacing around the placeholder is then tidied below.
    const subjectRecipients = recipients.length
      ? this.i18n.t(
          recipients.length === 1
            ? "email.senderConfirmationSubjectToOne"
            : "email.senderConfirmationSubjectToMany",
          {
            lang,
            args: { recipient: recipients[0], count: recipients.length },
          },
        )
      : "";

    await this.sendMail(
      creatorEmail,
      this.i18n
        .t(
          recipients.length
            ? "email.senderConfirmationSubject"
            : "email.senderConfirmationSubjectReady",
          { lang },
        )
        .replaceAll("{name}", subjectName)
        .replaceAll("{recipients}", subjectRecipients)
        // Whitespace only — a subject is one line, so this collapses the gap
        // an emptied placeholder leaves rather than reflowing anything.
        .replace(/\s{2,}/g, " ")
        .trim(),
      this.i18n
        .t("email.senderConfirmationMessage", { lang })
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
        // No CTA, same reasoning as sendShareLinkToSender: this is a record
        // of something already done, not a prompt to act.
        headline,
        metaLine: files.length
          ? this.buildMetaLine(files.length, totalSize, expiration)
          : undefined,
        downloadUrl: shareUrl,
        files,
        recipients,
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
      this.i18n.t("email.expiringSenderNotificationSubject", { lang }),
      this.i18n
        .t("email.expiringSenderNotificationMessage", { lang })
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
      this.i18n.t("email.expiringRecipientNotificationSubject", { lang }),
      this.i18n
        .t("email.expiringRecipientNotificationMessage", { lang })
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
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      recipientEmail,
      this.i18n.t("email.resetPasswordSubject", { lang }),
      this.i18n
        .t("email.resetPasswordMessage", { lang })
        .replaceAll("\\n", "\n")
        .replaceAll("{url}", resetPasswordUrl),
      { ctaUrl: resetPasswordUrl },
    );
  }

  async sendInviteEmail(recipientEmail: string, password: string) {
    const loginUrl = `${this.config.get("general.appUrl")}/auth/signIn`;
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      recipientEmail,
      this.i18n.t("email.inviteSubject", { lang }),
      this.i18n
        .t("email.inviteMessage", { lang })
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
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      recipientEmail,
      this.i18n.t("email.verificationSubject", { lang }),
      this.i18n
        .t("email.verificationMessage", { lang })
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

  // One of two send* methods whose "to" is fixed (CONTACT_EMAIL) rather
  // than a parameter — see sendNewAccountNotification below for the other.
  // Every other method here sends an app notification out to a user; these
  // two run the other direction, back to the site owner. subject is free
  // text the visitor typed, so it goes through nodemailer's own `subject`
  // field rather than anything hand-concatenated into raw headers the way
  // ContactController's own upstream DTO validation already guards against
  // on the way in.
  async sendContactMessage(
    subject: string,
    message: string,
    replyTo?: string,
    ip?: string,
    userAgent?: string,
    referer?: string,
  ) {
    const lang = this.config.get("general.defaultLanguage");
    const sender =
      replyTo ?? this.i18n.t("email.contactAnonymousSender", { lang });

    // Same labeled-line metadata block majid.film's own contact form
    // already sends (IP, device, page), just localized through this app's
    // i18n instead of hardcoded French — requested directly, matched as
    // closely as this app's own conventions allow. Truncated and stripped
    // of newlines for the same reason majid.film's contact.php does it:
    // a malformed/oversized User-Agent or Referer shouldn't be able to
    // break the block's own line-per-field layout (this is plain-text
    // sendMail(), not raw SMTP headers, so it's a readability safeguard
    // here, not the header-injection defense it is in PHP's mail()).
    const sanitize = (value?: string) =>
      (value ?? "—").slice(0, 300).replace(/[\r\n]/g, " ");

    const metadata = [
      `${this.i18n.t("email.contactFromLabel", { lang })} ${sender}`,
      `${this.i18n.t("email.contactIpLabel", { lang })} ${sanitize(ip)}`,
      `${this.i18n.t("email.contactDeviceLabel", { lang })} ${sanitize(userAgent)}`,
      `${this.i18n.t("email.contactPageLabel", { lang })} ${sanitize(referer)}`,
    ].join("\n");

    await this.sendMail(
      CONTACT_EMAIL,
      `[Contact] ${subject}`,
      `${metadata}\n\n${message}`,
      {
        replyTo,
        headline: this.i18n.t("email.contactHeadline", { lang }),
      },
    );
  }

  // Fire-and-forget from AuthService.signUp's perspective — see that
  // method's own comment for why this runs after its transaction commits
  // rather than inside it, and why a failure here is caught there instead
  // of propagating: this is a best-effort admin notification, never
  // something that should turn a visitor's own successful signup into an
  // error response.
  async sendNewAccountNotification(username: string, email: string) {
    const lang = this.config.get("general.defaultLanguage");

    await this.sendMail(
      CONTACT_EMAIL,
      this.i18n.t("email.newAccountSubject", { lang }),
      this.i18n.t("email.newAccountBody", { lang, args: { username, email } }),
      { headline: this.i18n.t("email.newAccountHeadline", { lang }) },
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
