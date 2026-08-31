import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { Prisma, Share, User, ShareSecurity } from "@prisma/client";
import * as archiver from "archiver";
import * as argon from "argon2";
import * as crypto from "crypto";
import * as fs from "fs";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { SystemService } from "src/system/system.service";
import { parseRelativeDateToAbsolute } from "src/utils/date.util";
import { byteToHumanSizeString } from "src/utils/fileSize.util";
import { getUserActiveStorageUsage } from "src/utils/storageQuota.util";
import { SHARE_DIRECTORY } from "../constants";
import { CreateShareDTO } from "./dto/createShare.dto";
import { UpdateShareDTO } from "./dto/updateShare.dto";

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private fileService: FileService,
    private emailService: EmailService,
    private config: ConfigService,
    private jwtService: JwtService,
    private reverseShareService: ReverseShareService,
    private clamScanService: ClamScanService,
    private systemService: SystemService,
    private readonly i18n: I18nService,
  ) {}

  async create(share: CreateShareDTO, user?: User, reverseShareToken?: string) {
    const reverseShare =
      await this.reverseShareService.getByToken(reverseShareToken);
    const quotaOwner = reverseShare ? reverseShare.creator : user;

    if (share.size) {
      const systemInfo = await this.systemService.getSystemInfo();
      if (systemInfo && systemInfo.total - systemInfo.used < share.size) {
        throw new BadRequestException(this.i18n.t("share.notEnoughSpace"));
      }

      if (quotaOwner?.storageQuotaLimit) {
        const quotaLimit = parseInt(quotaOwner.storageQuotaLimit);
        const activeStorageUsage = await getUserActiveStorageUsage(
          this.prisma,
          quotaOwner.id,
        );

        const projectedUsage = activeStorageUsage + share.size;
        if (projectedUsage > quotaLimit) {
          const exceededBytes = projectedUsage - quotaLimit;
          const exceededSize = byteToHumanSizeString(exceededBytes);
          throw new BadRequestException(
            reverseShare
              ? this.i18n.t("share.reverseShareQuotaExceeded", {
                  args: { exceededSize },
                })
              : this.i18n.t("share.storageQuotaExceeded", {
                  args: { exceededSize },
                }),
          );
        }
      }
    }

    if (!(await this.isShareIdAvailable(share.id)).isAvailable)
      throw new BadRequestException(this.i18n.t("share.idInUse"));

    // Same reasoning as expirationDate/finalName below: a reverse share's
    // own security is set once by its creator (CreateReverseShareDTO),
    // never per-submission any more — the frontend sends no security of
    // its own for a reverse share at all. reverseShare.password is
    // already hashed (ReverseShareService.create, at reverse share
    // creation time), so it's used as-is here, not re-hashed — hashing an
    // already-hashed value would just make it permanently unverifiable.
    // restrictToRecipients has no reverse-share equivalent (there's no
    // creator-facing recipients field to restrict to), so it's simply
    // never set on this path.
    if (reverseShare) {
      share.security =
        reverseShare.password || reverseShare.maxViews
          ? {
              password: reverseShare.password || undefined,
              maxViews: reverseShare.maxViews || undefined,
              restrictToRecipients: undefined,
            }
          : undefined;
    } else {
      if (!share.security || Object.keys(share.security).length == 0)
        share.security = undefined;

      if (share.security?.restrictToRecipients && share.security?.password) {
        throw new BadRequestException(
          "Cannot set a password on a share restricted to recipients.",
        );
      }

      if (share.security?.password) {
        share.security.password = await argon.hash(share.security.password);
      }

      if (
        this.configService.get("share.enableUserRecipients") &&
        share.security?.restrictToRecipients
      ) {
        if (!share.recipients?.length) {
          throw new BadRequestException(
            "A share restricted to recipients must have at least one recipient.",
          );
        }
        // Note: we intentionally do NOT check whether the recipient emails belong
        // to registered accounts. Doing so would leak which emails have an account
        // (account enumeration). Recipients who aren't registered yet simply sign
        // up to gain access (see ShareSecurityGuard); if signups are disabled they
        // can't access it.
      }
    }

    let expirationDate: Date;

    // If share is created by a reverse share token override the expiration date
    if (reverseShare) {
      expirationDate = reverseShare.shareExpiration;
    } else {
      expirationDate = this.parseExpiration(share.expiration);
      if (!user?.isAdmin && !user?.canCreatePermanentShares) {
        this.validateExpiration(expirationDate);
      }
    }

    // Same idea as expirationDate above: a reverse share's own name (set
    // only by its creator, at creation time — see CreateReverseShareDTO)
    // always wins over whatever the submission itself carries, which for
    // a reverse share is never a visitor's own choice any more (the
    // frontend no longer offers that field) but still a real, sometimes-
    // meaningful fallback: the file-derived default name computed
    // client-side. Only actually overrides when the creator set one —
    // reverseShare.name is optional, same as a direct share's.
    const finalName = reverseShare?.name || share.name;
    // Same pattern, one field over — the frontend sends no description of
    // its own for a reverse share submission any more either.
    const finalDescription = reverseShare?.description || share.description;

    fs.mkdirSync(`${SHARE_DIRECTORY}/${share.id}`, {
      recursive: true,
    });

    const {
      size: _size,
      security: _security,
      recipients: _recipients,
      expiration: _expiration,
      name: _name,
      description: _description,
      ...shareData
    } = share;

    const shareTuple = await this.prisma.share.create({
      data: {
        ...shareData,
        name: finalName,
        description: finalDescription,
        // A signed-in creator's identity is already the `creator` relation
        // below — never persist a second, potentially-stale copy of their
        // email here. Only meaningful for an anonymous sender.
        senderEmail: user
          ? null
          : share.senderEmail?.toLowerCase().trim() || null,
        expiration: expirationDate,
        creator: { connect: user ? { id: user.id } : undefined },
        security: { create: share.security },
        recipients: {
          create: share.recipients
            ? share.recipients.map((email) => ({ email }))
            : [],
        },
        storageProvider: this.configService.get("s3.enabled") ? "S3" : "LOCAL",
      },
    });

    if (reverseShare) {
      // Assign share to reverse share token
      await this.prisma.reverseShare.update({
        where: { token: reverseShareToken },
        data: {
          shares: {
            connect: { id: shareTuple.id },
          },
        },
      });
    }

    return shareTuple;
  }

  async createZip(shareId: string) {
    if (this.config.get("s3.enabled")) return;

    const path = `${SHARE_DIRECTORY}/${shareId}`;

    const files = await this.prisma.file.findMany({ where: { shareId } });
    const archive = archiver("zip", {
      zlib: { level: this.config.get("share.zipCompressionLevel") },
    });
    const writeStream = fs.createWriteStream(`${path}/archive.zip`);

    for (const file of files) {
      archive.append(fs.createReadStream(`${path}/${file.id}`), {
        name: file.name,
      });
    }

    archive.pipe(writeStream);
    await archive.finalize();
  }

  async complete(id: string, reverseShareToken?: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: true,
        recipients: true,
        creator: true,
        reverseShare: { include: { creator: true } },
      },
    });

    if (await this.isShareCompleted(id))
      throw new BadRequestException(this.i18n.t("share.alreadyCompleted"));

    if (share.files.length == 0)
      throw new BadRequestException(
        this.i18n.t("share.completionRequiresFile"),
      );

    // File.size is stored as a string — shared by both email calls below,
    // which show the transfer's actual contents (see EmailService.TransferFile).
    const emailFiles = share.files.map((file) => ({
      name: file.name,
      size: parseInt(file.size),
    }));

    // Asynchronously create a zip of all files — except for a share with
    // NAS-imported files, where createZip() would read every symlinked
    // file into a genuine cached archive.zip, physically duplicating the
    // imported content onto disk (exactly what importing instead of
    // uploading exists to avoid). Those get isZipReady set directly
    // instead: FileService.getZip() builds their zip live, on demand, for
    // every download rather than once up front, so there's nothing to
    // wait on — it's "ready" the moment the share is.
    if (share.files.length > 1) {
      if (share.hasNasImportedFiles) {
        await this.prisma.share.update({
          where: { id },
          data: { isZipReady: true },
        });
      } else {
        this.createZip(id).then(() =>
          this.prisma.share.update({
            where: { id },
            data: { isZipReady: true },
          }),
        );
      }
    }

    // Send email for each recipient
    for (const recipient of share.recipients) {
      await this.emailService.sendMailToShareRecipients(
        recipient.email,
        recipient.id,
        share.id,
        share.creator || share.reverseShare?.creator,
        share.description,
        share.expiration,
        emailFiles,
      );
    }

    // Auto-link email recipients who are registered users so the share appears in their dashboard
    if (this.configService.get("share.enableUserRecipients")) {
      const emails = share.recipients.map((r) => r.email);
      if (emails.length > 0) {
        const matchedUsers = await this.prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true },
        });
        for (const matchedUser of matchedUsers) {
          await this.prisma.shareUserRecipient.upsert({
            where: {
              userId_shareId: { userId: matchedUser.id, shareId: share.id },
            },
            create: { userId: matchedUser.id, shareId: share.id },
            update: {},
          });
        }
      }
    }

    const notifyReverseShareCreator = share.reverseShare
      ? this.config.get("smtp.enabled") &&
        share.reverseShare.sendEmailNotification
      : undefined;

    if (notifyReverseShareCreator) {
      await this.emailService.sendMailToReverseShareCreator(
        share.reverseShare.creator.email,
        share.id,
      );
    }

    // An anonymous sender (no account, so no "Mes partages" to fall back
    // to) only ever sees this link once — email it to the self-reported
    // address stored at creation time (ShareService.create()), as a
    // backstop against a lost/mis-clicked link. Unconditional on OTP
    // verification having run: senderEmail is always collected for an
    // anonymous share regardless of whether that toggle is on. Caught
    // rather than awaited-to-fail: a courtesy backup email should never
    // block the completion response the upload itself is waiting on.
    if (
      !share.creator &&
      share.senderEmail &&
      this.config.get("smtp.enabled")
    ) {
      await this.emailService
        .sendShareLinkToSender(
          share.senderEmail,
          share.id,
          share.name,
          share.expiration,
          emailFiles,
        )
        .catch((e) => this.logger.error(e));
    }

    // Check if any file is malicious with ClamAV
    void this.clamScanService.checkAndRemove(share.id);

    if (share.reverseShare) {
      await this.prisma.reverseShare.update({
        where: { token: reverseShareToken },
        data: { remainingUses: { decrement: 1 } },
      });
    }

    await this.prisma.share.update({
      where: { id },
      data: { uploadLocked: true },
    });

    // Included with files (transformShare sums their size) so the
    // completion response can actually confirm what was just sent — the
    // bare `update()` result above has neither, since only `uploadLocked`
    // was touched.
    const updatedShare = await this.prisma.share.findUnique({
      where: { id },
      include: { files: true },
    });

    return {
      ...this.transformShare(updatedShare),
      notifyReverseShareCreator,
    };
  }

  async revertComplete(id: string) {
    return this.prisma.share.update({
      where: { id },
      data: { uploadLocked: false, isZipReady: false },
    });
  }

  async getShares() {
    const shares = await this.prisma.share.findMany({
      orderBy: {
        expiration: "desc",
      },
      include: { files: true, creator: true, security: true, recipients: true },
    });

    return shares.map((share) => this.transformShare(share));
  }

  async getSharesByUser(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: {
        creator: { id: userId },
        uploadLocked: true,
        // We want to grab any shares that are not expired or have their expiration date set to "never" (unix 0)
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: moment(0).toDate() } },
        ],
      },
      orderBy: {
        expiration: "desc",
      },
      include: { recipients: true, files: true, security: true, creator: true },
    });

    return shares.map((share) => this.transformShare(share));
  }

  async get(id: string): Promise<any> {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: {
          orderBy: {
            name: "asc",
          },
        },
        creator: true,
        security: true,
      },
    });

    if (share.removedReason)
      throw new NotFoundException(share.removedReason, "share_removed");

    if (!share || !share.uploadLocked)
      throw new NotFoundException(this.i18n.t("share.notFound"));
    return {
      ...share,
      hasPassword: !!share.security?.password,
      // ShareDTO declares size as always-@Expose()d, but it isn't a real
      // column on Share (see schema.prisma) — every other read path
      // computes it via transformShare(); this one predates DownloadAllButton
      // needing it and never did, so it silently serialized as undefined.
      size:
        share.files?.reduce((acc, file) => acc + parseInt(file.size), 0) ?? 0,
    };
  }

  async getMetaData(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
    });

    if (!share || !share.uploadLocked)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    return share;
  }

  async remove(shareId: string, isDeleterAdmin = false) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (!share.creatorId && !isDeleterAdmin)
      throw new ForbiddenException(this.i18n.t("share.anonymousNoDelete"));

    await this.fileService.deleteAllFiles(shareId);
    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async expire(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (!share.creatorId) {
      throw new ForbiddenException(this.i18n.t("share.anonymousNoExpire"));
    }

    await this.prisma.share.update({
      where: { id: shareId },
      data: { expiration: moment().toDate() },
    });
  }

  async update(
    shareId: string,
    body: UpdateShareDTO,
    user?: User,
    share?: Share & { security?: ShareSecurity },
  ) {
    const currentShare =
      share ||
      (await this.prisma.share.findUnique({
        where: { id: shareId },
        include: { security: true },
      }));

    const isUpdaterAdmin = user?.isAdmin === true;
    if (!currentShare.creatorId && !isUpdaterAdmin) {
      throw new ForbiddenException(this.i18n.t("share.anonymousNoUpdate"));
    }

    let expirationDate: Date | undefined;
    if (body.expiration !== undefined) {
      expirationDate = this.parseExpiration(body.expiration);
      if (!user?.isAdmin && !user?.canCreatePermanentShares) {
        this.validateExpiration(expirationDate);
      }
    }

    const data: Prisma.ShareUpdateInput = {
      name: body.name !== undefined ? body.name || null : undefined,
      description:
        body.description !== undefined ? body.description || null : undefined,
      expiration: expirationDate,
    };

    await this.prisma.share.update({
      where: { id: shareId },
      data,
    });

    if (body.security) {
      await this.updateSecurity(shareId, body, currentShare.security);
    }

    const updatedShare = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { creator: true, files: true, recipients: true, security: true },
    });

    return this.transformShare(updatedShare);
  }

  private async updateSecurity(
    shareId: string,
    body: UpdateShareDTO,
    currentSecurity?: ShareSecurity,
  ) {
    const nextPassword = body.security.removePassword
      ? null
      : body.security.password
        ? await argon.hash(body.security.password)
        : currentSecurity?.password;
    const nextMaxViews =
      body.security.maxViews !== undefined
        ? body.security.maxViews
        : currentSecurity?.maxViews;

    if (!nextPassword && !nextMaxViews) {
      if (currentSecurity) {
        await this.prisma.shareSecurity.delete({ where: { shareId } });
      }
      return;
    }

    await this.prisma.shareSecurity.upsert({
      where: { shareId },
      create: {
        share: { connect: { id: shareId } },
        password: nextPassword,
        maxViews: nextMaxViews,
      },
      update: {
        password: nextPassword,
        maxViews: nextMaxViews,
      },
    });
  }

  async isShareCompleted(id: string) {
    return (await this.prisma.share.findUnique({ where: { id } })).uploadLocked;
  }

  async getReceivedShares(userId: string) {
    return this.prisma.shareUserRecipient.findMany({
      where: { userId },
      include: {
        share: {
          include: {
            creator: true,
            files: true,
            security: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private transformShare(share: any) {
    return {
      ...share,
      size:
        share.files?.reduce((acc, file) => acc + parseInt(file.size), 0) ?? 0,
      recipients: share.recipients?.map((recipient) => recipient.email) ?? [],
      security: {
        maxViews: share.security?.maxViews,
        passwordProtected: !!share.security?.password,
        restrictToRecipients: !!share.security?.restrictToRecipients,
      },
    };
  }

  private parseExpiration(expiration: string) {
    if (expiration === "never") return moment(0).toDate();

    if (
      /^\d+-(minute|hour|day|week|month|year|minutes|hours|days|weeks|months|years)$/.test(
        expiration,
      )
    ) {
      return parseRelativeDateToAbsolute(expiration);
    }

    const absoluteExpiration = moment(expiration, moment.ISO_8601, true);
    if (absoluteExpiration.isValid()) return absoluteExpiration.toDate();

    throw new BadRequestException(this.i18n.t("share.invalidExpiration"));
  }

  private validateExpiration(expiration: Date) {
    const expiresNever = moment(expiration).isSame(0);
    const maxExpiration = this.config.get("share.maxExpiration");

    if (
      maxExpiration.value !== 0 &&
      (expiresNever ||
        expiration >
          moment().add(maxExpiration.value, maxExpiration.unit).toDate())
    ) {
      throw new BadRequestException(this.i18n.t("share.maxExpirationExceeded"));
    }
  }

  async isShareIdAvailable(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    return { isAvailable: !share };
  }

  async increaseViewCount(share: Share) {
    await this.prisma.share.update({
      where: { id: share.id },
      data: { views: share.views + 1 },
    });
  }

  async getShareToken(shareId: string, password: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      include: {
        security: true,
      },
    });

    if (share?.security?.password) {
      if (!password) {
        throw new ForbiddenException(
          this.i18n.t("file.passwordProtected"),
          "share_password_required",
        );
      }

      const isPasswordValid = await argon.verify(
        share.security.password,
        password,
      );
      if (!isPasswordValid) {
        throw new ForbiddenException(
          this.i18n.t("share.wrongPassword"),
          "wrong_password",
        );
      }
    }

    if (share.security?.maxViews && share.security.maxViews <= share.views) {
      throw new ForbiddenException(
        this.i18n.t("share.maxViewsExceeded"),
        "share_max_views_exceeded",
      );
    }

    const token = await this.generateShareToken(share);
    await this.increaseViewCount(share);
    return token;
  }

  async generateShareToken(share: Share & { security?: ShareSecurity }) {
    const { id: shareId, expiration, createdAt, security } = share;

    const tokenPayload = {
      shareId,
      shareCreatedAt: moment(createdAt).unix(),
      sharePasswordSignature: this.getSharePasswordSignature(
        security?.password,
      ),
      iat: moment().unix(),
    };

    const tokenOptions: JwtSignOptions = {
      secret: this.config.get("internal.jwtSecret"),
    };

    if (!moment(expiration).isSame(0)) {
      const diffSeconds = moment(expiration).diff(new Date(), "seconds");
      // Default to a 1 hour token if the share is expired but being viewed by an admin
      tokenOptions.expiresIn = diffSeconds > 0 ? diffSeconds : 3600;
    }

    return this.jwtService.sign(tokenPayload, tokenOptions);
  }

  async verifyShareToken(
    share: Share & { security?: ShareSecurity },
    token: string,
  ) {
    const { expiration, createdAt, security } = share;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
        // Ignore expiration if expiration is 0
        ignoreExpiration: moment(expiration).isSame(0),
      });

      return (
        claims.shareId == share.id &&
        claims.shareCreatedAt == moment(createdAt).unix() &&
        (!security?.password ||
          claims.sharePasswordSignature ===
            this.getSharePasswordSignature(security.password))
      );
    } catch {
      return false;
    }
  }

  private getSharePasswordSignature(password?: string) {
    if (!password) return undefined;

    return crypto
      .createHmac("sha512", this.config.get("internal.jwtSecret"))
      .update(password)
      .digest("hex");
  }
}
