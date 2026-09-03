import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import * as fs from "fs";
import * as moment from "moment";
import { BrandSyncService } from "src/brandSlides/brandSync.service";
import { EmailService } from "src/email/email.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { ConfigService } from "src/config/config.service";
import { SHARE_DIRECTORY } from "../constants";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private reverseShareService: ReverseShareService,
    private fileService: FileService,
    private configServer: ConfigService,
    private emailService: EmailService,
    private brandSyncService: BrandSyncService,
  ) {}

  @Cron("* * * * *")
  async deleteExpiredShares() {
    const fileRetentionPeriod = this.configServer.get(
      "share.fileRetentionPeriod",
    );

    if (fileRetentionPeriod.value === -1) {
      return;
    }

    const thresholdDate = moment()
      .subtract(fileRetentionPeriod.value, fileRetentionPeriod.unit)
      .toDate();

    const expiredShares = await this.prisma.share.findMany({
      where: {
        // We want to remove only shares that have an expiration date + retention period less than the current date, but not 0
        AND: [
          { expiration: { lt: thresholdDate } },
          { expiration: { not: moment(0).toDate() } },
        ],
      },
    });

    for (const expiredShare of expiredShares) {
      await this.fileService.deleteAllFiles(expiredShare.id);
      await this.prisma.share.delete({
        where: { id: expiredShare.id },
      });
    }

    if (expiredShares.length > 0) {
      this.logger.log(`Deleted ${expiredShares.length} expired shares`);
    }
  }

  @Cron("0 * * * *")
  async deleteExpiredReverseShares() {
    const expiredReverseShares = await this.prisma.reverseShare.findMany({
      where: {
        shareExpiration: { lt: new Date() },
      },
    });

    for (const expiredReverseShare of expiredReverseShares) {
      await this.reverseShareService.remove(expiredReverseShare.id);
    }

    if (expiredReverseShares.length > 0) {
      this.logger.log(
        `Deleted ${expiredReverseShares.length} expired reverse shares`,
      );
    }
  }

  @Cron("0 */6 * * *")
  async deleteUnfinishedShares() {
    const cutoff = moment().subtract(1, "day").toDate();
    const unfinishedShares = await this.prisma.share.findMany({
      where: {
        uploadLocked: false,
        OR: [
          { updatedAt: { lt: cutoff } },
          { updatedAt: { equals: null }, createdAt: { lt: cutoff } },
        ],
      },
    });

    for (const unfinishedShare of unfinishedShares) {
      await this.fileService.deleteAllFiles(unfinishedShare.id);
      await this.prisma.share.delete({
        where: { id: unfinishedShare.id },
      });
    }

    if (unfinishedShares.length > 0) {
      this.logger.log(`Deleted ${unfinishedShares.length} unfinished shares`);
    }
  }

  @Cron("0 0 * * *")
  deleteTemporaryFiles() {
    let filesDeleted = 0;

    const shareDirectories = fs
      .readdirSync(SHARE_DIRECTORY, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const shareDirectory of shareDirectories) {
      const temporaryFiles = fs
        .readdirSync(`${SHARE_DIRECTORY}/${shareDirectory}`)
        .filter((file) => file.endsWith(".tmp-chunk"));

      for (const file of temporaryFiles) {
        const stats = fs.statSync(
          `${SHARE_DIRECTORY}/${shareDirectory}/${file}`,
        );
        const isOlderThanOneDay = moment(stats.mtime)
          .add(1, "day")
          .isBefore(moment());

        if (isOlderThanOneDay) {
          fs.rmSync(`${SHARE_DIRECTORY}/${shareDirectory}/${file}`);
          filesDeleted++;
        }
      }
    }

    this.logger.log(`Deleted ${filesDeleted} temporary files`);
  }

  @Cron("1 * * * *")
  async deleteExpiredTokens() {
    const { count: refreshTokenCount } =
      await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

    const { count: loginTokenCount } = await this.prisma.loginToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const { count: resetPasswordTokenCount } =
      await this.prisma.resetPasswordToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

    const { count: anonymousShareVerificationCount } =
      await this.prisma.anonymousShareVerification.deleteMany({
        where: { OR: [{ expiresAt: { lt: new Date() } }, { consumed: true }] },
      });

    const deletedTokensCount =
      refreshTokenCount +
      loginTokenCount +
      resetPasswordTokenCount +
      anonymousShareVerificationCount;

    if (deletedTokensCount > 0) {
      this.logger.log(`Deleted ${deletedTokensCount} expired refresh tokens`);
    }
  }

  @Cron("0 * * * *")
  async deleteUnactivatedUsers() {
    const cutoff = moment().subtract(24, "hours").toDate();
    const unactivatedUsers = await this.prisma.user.findMany({
      where: {
        isActivated: false,
        createdAt: { lt: cutoff },
      },
      include: { shares: true },
    });

    for (const user of unactivatedUsers) {
      await Promise.all(
        user.shares.map((share) => this.fileService.deleteAllFiles(share.id)),
      );
      await this.prisma.user.delete({ where: { id: user.id } });
    }

    if (unactivatedUsers.length > 0) {
      this.logger.log(`Deleted ${unactivatedUsers.length} unactivated users`);
    }
  }

  // Every 15 min rather than hourly, matching deleteExpiredShares' own
  // per-minute cadence more than the once-a-day jobs above — a short
  // admin-configured window (expiringSenderNotificationWindow) could
  // otherwise be missed entirely on a short-lived share.
  @Cron("*/15 * * * *")
  async notifyExpiringSenders() {
    if (
      !this.configServer.get("smtp.enabled") ||
      !this.configServer.get("email.enableExpiringSenderNotification")
    )
      return;

    const window = this.configServer.get(
      "email.expiringSenderNotificationWindow",
    );
    const threshold = moment().add(window.value, window.unit).toDate();

    const shares = await this.prisma.share.findMany({
      where: {
        expiryReminderSentAt: null,
        expiration: { lte: threshold, gt: new Date() },
        NOT: { expiration: moment(0).toDate() }, // "never expires" sentinel
        OR: [{ creatorId: { not: null } }, { senderEmail: { not: null } }],
        downloads: { none: {} }, // nobody has downloaded anything yet
      },
      include: { creator: true, files: true },
    });

    let sent = 0;
    for (const share of shares) {
      // A registered creator can opt out from their own account settings;
      // an anonymous sender (senderEmail, no account to opt out from) is
      // always notified, same reasoning as the unconditional "here's your
      // link" backstop email.
      if (share.creator && !share.creator.notifyOnExpiringSentShares) continue;

      const ownerEmail = share.creator?.email || share.senderEmail;
      if (!ownerEmail) continue;

      try {
        await this.emailService.sendSenderExpiryReminder(
          ownerEmail,
          share.id,
          share.name,
          share.expiration,
          share.files.map((file) => ({
            name: file.name,
            size: parseInt(file.size),
          })),
        );
        await this.prisma.share.update({
          where: { id: share.id },
          data: { expiryReminderSentAt: new Date() },
        });
        sent++;
      } catch (e) {
        this.logger.error(
          `Failed to send expiry reminder for share ${share.id}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} sender expiry reminders`);
    }
  }

  // Same idea as notifyExpiringSenders above, for a named Email-mode
  // recipient who hasn't downloaded yet (ShareRecipient.downloadedAt,
  // set by FileService.notifyDownload). No per-user opt-out to check —
  // most recipients are plain email addresses with no account at all.
  @Cron("*/15 * * * *")
  async notifyExpiringRecipients() {
    if (
      !this.configServer.get("smtp.enabled") ||
      !this.configServer.get("email.enableExpiringRecipientNotification") ||
      !this.configServer.get("email.enableShareEmailRecipients")
    )
      return;

    const window = this.configServer.get(
      "email.expiringRecipientNotificationWindow",
    );
    const threshold = moment().add(window.value, window.unit).toDate();

    const recipients = await this.prisma.shareRecipient.findMany({
      where: {
        downloadedAt: null,
        expiryReminderSentAt: null,
        share: {
          expiration: { lte: threshold, gt: new Date() },
          NOT: { expiration: moment(0).toDate() },
        },
      },
      include: { share: { include: { creator: true, files: true } } },
    });

    let sent = 0;
    for (const recipient of recipients) {
      try {
        await this.emailService.sendRecipientExpiryReminder(
          recipient.email,
          recipient.id,
          recipient.share.id,
          recipient.share.creator,
          recipient.share.expiration,
          recipient.share.files.map((file) => ({
            name: file.name,
            size: parseInt(file.size),
          })),
        );
        await this.prisma.shareRecipient.update({
          where: { id: recipient.id },
          data: { expiryReminderSentAt: new Date() },
        });
        sent++;
      } catch (e) {
        this.logger.error(
          `Failed to send expiry reminder to recipient ${recipient.id}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} recipient expiry reminders`);
    }
  }

  // Thin wrapper — the actual work (and its own logging) lives in
  // BrandSyncService, matching how this module already delegates to
  // FileService/ReverseShareService/EmailService rather than embedding
  // their logic directly here. A non-ok result (not configured, or
  // already mid-run from a concurrent manual trigger) is a quiet no-op
  // from a cron's perspective — nothing to surface here.
  @Cron("0 3 * * *")
  async syncBrandSlides() {
    await this.brandSyncService.syncFromMajidfilm();
  }
}
