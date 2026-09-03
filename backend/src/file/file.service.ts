import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { LocalFileService } from "./local.service";
import { S3FileService } from "./s3.service";
import { ConfigService } from "src/config/config.service";
import { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "src/email/email.service";
import { I18nService } from "nestjs-i18n";

const UPDATED_AT_THROTTLE_MS = 5 * 60 * 1000;
const DOWNLOAD_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

@Injectable()
export class FileService {
  constructor(
    private prisma: PrismaService,
    private localFileService: LocalFileService,
    private s3FileService: S3FileService,
    private configService: ConfigService,
    private emailService: EmailService,
    private readonly i18n: I18nService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}
  private readonly logger = new Logger(FileService.name);

  // Determine which service to use based on the current config value
  // shareId is optional -> can be used to overwrite a storage provider
  private getStorageService(
    storageProvider?: string,
  ): S3FileService | LocalFileService {
    if (storageProvider != undefined)
      return storageProvider == "S3"
        ? this.s3FileService
        : this.localFileService;
    return this.configService.get("s3.enabled")
      ? this.s3FileService
      : this.localFileService;
  }

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: {
      id?: string;
      name: string;
    },
    shareId: string,
  ) {
    await this.touchShare(shareId);
    const storageService = this.getStorageService();
    return storageService.create(data, chunk, file, shareId);
  }

  private async touchShare(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { updatedAt: true },
    });
    if (!share) return;
    if (
      share.updatedAt &&
      Date.now() - share.updatedAt.getTime() < UPDATED_AT_THROTTLE_MS
    )
      return;
    await this.prisma.share.update({
      where: { id: shareId },
      data: { updatedAt: new Date() },
    });
  }

  async createPreSignedUploadUrls(
    shareId: string,
    fileName: string,
    totalChunks: number,
  ) {
    await this.touchShare(shareId);
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      return { directToS3: false };
    }
    const res = await this.s3FileService.createPreSignedUploadUrls(
      shareId,
      fileName,
      totalChunks,
    );
    return { directToS3: true, ...res };
  }

  async completePreSignedUpload(
    shareId: string,
    fileId: string,
    fileName: string,
    uploadId: string,
    parts: Array<{ ETag: string; PartNumber: number }>,
  ) {
    await this.touchShare(shareId);
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      throw new BadRequestException(this.i18n.t("file.s3NotSupported"));
    }
    return this.s3FileService.completePreSignedUpload(
      shareId,
      fileId,
      fileName,
      uploadId,
      parts,
    );
  }

  async abortPreSignedUpload(
    shareId: string,
    fileName: string,
    uploadId: string,
  ) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      throw new BadRequestException(this.i18n.t("file.s3NotSupported"));
    }
    return this.s3FileService.abortPreSignedUpload(shareId, fileName, uploadId);
  }

  async getPreSignedDownloadUrl(
    shareId: string,
    fileId: string,
    isDownload: boolean,
  ): Promise<string> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      throw new BadRequestException(this.i18n.t("file.s3NotSupported"));
    }
    return this.s3FileService.getPreSignedDownloadUrl(
      shareId,
      fileId,
      isDownload,
    );
  }

  async get(shareId: string, fileId: string): Promise<File> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
    });
    const storageService = this.getStorageService(share.storageProvider);
    return storageService.get(shareId, fileId);
  }

  async remove(shareId: string, fileId: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return storageService.remove(shareId, fileId);
  }

  async deleteAllFiles(shareId: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { id: true, storageProvider: true },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return storageService.deleteAllFiles(shareId);
  }

  async quarantineAllFiles(shareId: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { id: true, storageProvider: true },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return storageService.quarantineAllFiles(shareId);
  }

  async getZip(shareId: string): Promise<Readable> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true, hasNasImportedFiles: true },
    });

    // A NAS-import share is always local (NasImportService.ensureEnabled
    // refuses to import while S3 is enabled) and never has a cached
    // archive.zip on disk — see LocalFileService.streamZip's own comment
    // for why generating one on completion would defeat the whole
    // feature. Built live instead, straight into this response.
    if (share?.hasNasImportedFiles)
      return await this.localFileService.streamZip(shareId);

    const storageService = this.getStorageService(share?.storageProvider);
    return await storageService.getZip(shareId);
  }

  // recipientId present: a named Email-mode recipient downloaded — notify
  // the signed-in creator, as before. recipientId absent: a share with no
  // named recipient was downloaded (an anonymous or signed-in Link-mode
  // share) — notify whoever owns it instead. The two are mutually
  // exclusive by construction, so there's no double-notification risk.
  async notifyDownload(
    shareId: string,
    fileName: string,
    recipientId?: string,
  ) {
    // Recorded unconditionally, ahead of the notification toggle below —
    // JobsService.notifyExpiringRecipients() needs to know a named
    // recipient already picked this up regardless of whether download
    // notifications are even enabled. Only the first download counts (the
    // where clause no-ops on every download after that).
    if (recipientId) {
      await this.prisma.shareRecipient
        .updateMany({
          where: { id: recipientId, downloadedAt: null },
          data: { downloadedAt: new Date() },
        })
        .catch((e) =>
          this.logger.error(
            `Failed to record download for recipient ${recipientId}`,
            e,
          ),
        );
    }

    // Same "unconditional, ahead of the toggle below" reasoning as the
    // block above — the download-history log (see ShareDownload's own
    // schema comment) fires regardless of whether email notifications are
    // even on, and regardless of email/count history the block above
    // already tracks: this records every download, not just the first.
    await this.recordShareDownload(shareId, fileName, recipientId);

    if (!this.configService.get("email.enableShareDownloadNotifications"))
      return;

    if (recipientId) {
      await this.notifyRecipientDownload(shareId, fileName, recipientId);
    } else {
      await this.notifyOwnerDownload(shareId, fileName);
    }
  }

  // Every FileController call site invokes notifyDownload unawaited
  // (`void ...`) — an uncaught throw here would become an unhandled
  // rejection, so this fails closed exactly like the updateMany() above.
  private async recordShareDownload(
    shareId: string,
    fileName: string,
    recipientId?: string,
  ) {
    try {
      const recipient = recipientId
        ? await this.prisma.shareRecipient.findUnique({
            where: { id: recipientId },
            select: { email: true },
          })
        : null;

      // FileController.getZip() always calls notifyDownload with this
      // synthesized name (it's what Content-Disposition sends too) —
      // recognized here and stored as null so the downloads page can
      // render "whole transfer" instead of a name nobody actually typed.
      const isWholeShareZip = fileName === `${shareId}.zip`;

      await this.prisma.shareDownload.create({
        data: {
          shareId,
          fileName: isWholeShareZip ? null : fileName,
          recipientEmail: recipient?.email ?? null,
        },
      });
    } catch (e) {
      this.logger.error(
        `Failed to record ShareDownload for share ${shareId}`,
        e,
      );
    }
  }

  private async notifyRecipientDownload(
    shareId: string,
    fileName: string,
    recipientId: string,
  ) {
    try {
      if (
        !this.configService.get("smtp.enabled") ||
        !this.configService.get("email.enableShareEmailRecipients")
      )
        return;

      const notificationKey = `share-download-notification:${shareId}:${recipientId}`;
      if (await this.cache.get<true>(notificationKey)) return;

      const share = await this.prisma.share.findUnique({
        where: { id: shareId },
        select: {
          id: true,
          creator: { select: { email: true } },
          recipients: {
            where: { id: recipientId },
            select: { email: true },
          },
        },
      });

      const recipient = share?.recipients[0];
      if (!share?.creator?.email || !recipient) return;

      await this.cache.set(
        notificationKey,
        true,
        DOWNLOAD_NOTIFICATION_COOLDOWN_MS,
      );

      await this.emailService.sendShareDownloadNotification(
        share.creator.email,
        share.id,
        fileName,
        recipient.email,
      );
    } catch (e) {
      this.logger.error(
        `Failed to notify recipient download for share ${shareId}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  // Link-mode shares have no named recipient to key a per-recipient cooldown
  // on, and no email.enableShareEmailRecipients dependency — deliberately
  // not checked here, since this path exists precisely for shares that have
  // none. The owner is either a signed-in creator or the sender's own
  // self-reported email (Share.senderEmail, see ShareService.create()).
  private async notifyOwnerDownload(shareId: string, fileName: string) {
    try {
      if (!this.configService.get("smtp.enabled")) return;

      const notificationKey = `share-download-notification:${shareId}:owner`;
      if (await this.cache.get<true>(notificationKey)) return;

      const share = await this.prisma.share.findUnique({
        where: { id: shareId },
        select: {
          id: true,
          senderEmail: true,
          creator: { select: { email: true } },
        },
      });

      const ownerEmail = share?.creator?.email || share?.senderEmail;
      if (!ownerEmail) return;

      await this.cache.set(
        notificationKey,
        true,
        DOWNLOAD_NOTIFICATION_COOLDOWN_MS,
      );

      await this.emailService.sendOwnerDownloadNotification(
        ownerEmail,
        shareId,
        fileName,
      );
    } catch (e) {
      this.logger.error(
        `Failed to notify owner download for share ${shareId}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  async getStorageProvider(shareId: string): Promise<string> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    return share?.storageProvider || "LOCAL";
  }

  async getFileName(shareId: string, fileId: string): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, shareId },
      select: { name: true },
    });
    if (!file) throw new NotFoundException(this.i18n.t("file.notFound"));
    return file.name;
  }

  private async streamToUint8Array(stream: Readable): Promise<Uint8Array> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      stream.on("error", reject);
    });
  }
}

export interface File {
  metaData: {
    id: string;
    size: string;
    createdAt: Date;
    mimeType: string | false;
    name: string;
    shareId: string;
  };
  file: Readable;
}
