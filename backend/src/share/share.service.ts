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
    private clamScanService: ClamScanService,
    private systemService: SystemService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    share: CreateShareDTO,
    user?: User,
    // The address the one-time-code flow actually proved belongs to this
    // visitor, resolved by the controller from the verification cookie.
    // Not the one they typed into the form: those are two different
    // things, and only this one may ever be shown to a recipient.
    verifiedSenderEmail?: string,
  ) {
    if (share.size) {
      const systemInfo = await this.systemService.getSystemInfo();
      if (systemInfo && systemInfo.total - systemInfo.used < share.size) {
        throw new BadRequestException(this.i18n.t("share.notEnoughSpace"));
      }

      if (user?.storageQuotaLimit) {
        const quotaLimit = parseInt(user.storageQuotaLimit);
        const activeStorageUsage = await getUserActiveStorageUsage(
          this.prisma,
          user.id,
        );

        const projectedUsage = activeStorageUsage + share.size;
        if (projectedUsage > quotaLimit) {
          const exceededBytes = projectedUsage - quotaLimit;
          const exceededSize = byteToHumanSizeString(exceededBytes);
          throw new BadRequestException(
            this.i18n.t("share.storageQuotaExceeded", {
              args: { exceededSize },
            }),
          );
        }
      }
    }

    if (!(await this.isShareIdAvailable(share.id)).isAvailable)
      throw new BadRequestException(this.i18n.t("share.idInUse"));

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

    const expirationDate = this.parseExpiration(share.expiration);
    if (!user?.isAdmin && !user?.canCreatePermanentShares) {
      this.validateExpiration(expirationDate);
    }

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
        name: share.name,
        description: share.description,
        // A signed-in creator's identity is already the `creator` relation
        // below — never persist a second, potentially-stale copy of their
        // email here. Only meaningful for an anonymous sender.
        // When the instance requires a one-time code, the address stored is
        // the one that code proved — never the one typed into the form.
        // They can differ, and until now the typed one won: a visitor could
        // prove an address they own, declare someone else's, and the
        // recipient would be shown that name and handed it as the Reply-To,
        // on this domain's letterhead. Proving an address is only worth
        // doing if it is the address that ends up being shown.
        //
        // With the requirement off nothing is proven, and the typed address
        // is all there is. It is still stored, because the "here is your own
        // link" backstop further down mails that address and nowhere else —
        // and ShareService.complete() refuses to hand it to a recipient,
        // which is the gate that makes storing it safe at all.
        senderEmail: user
          ? null
          : (this.config.get(
              "share.requireEmailVerificationForAnonymousShares",
            )
              ? verifiedSenderEmail?.toLowerCase().trim()
              : share.senderEmail?.toLowerCase().trim()) || null,
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

    return shareTuple;
  }

  // In-flight archive rebuilds, one entry per share id. See createZip.
  private zipRebuilds = new Map<string, Promise<void>>();

  // Rebuilds are serialised per share, because a collection's container
  // has many writers by design: several friends closing their deposit in
  // the same second is the designed case, not a race to shrug at, and two
  // archiver runs piping into the same `archive.zip` write stream
  // interleave into a corrupt file that isZipReady still reports ready.
  //
  // What this chain protects: concurrent rebuilds inside THIS node
  // process. What it does NOT protect: a second process, a second
  // replica, a container restart mid-write, or anything touching the file
  // outside this method — the map lives in memory and dies with the
  // process. This app runs as a single node process, which is the whole
  // reason a promise chain is enough. The day it does not, this needs a
  // real lock (a lockfile, an advisory DB lock, or a job queue), and a
  // bigger map will not stand in for one.
  async createZip(shareId: string) {
    if (this.config.get("s3.enabled")) return;

    const previous = this.zipRebuilds.get(shareId) ?? Promise.resolve();
    // The predecessor's failure must not cancel this rebuild — it is a
    // queue, not a dependency.
    const rebuild = previous.catch(() => {}).then(() => this.buildZip(shareId));
    this.zipRebuilds.set(shareId, rebuild);

    // Dropped once this run is the last one queued, so the map doesn't
    // keep one entry per share for the lifetime of the process.
    void rebuild
      .catch(() => {})
      .then(() => {
        if (this.zipRebuilds.get(shareId) === rebuild)
          this.zipRebuilds.delete(shareId);
      });

    return rebuild;
  }

  private async buildZip(shareId: string) {
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

    // Resolved on the write stream's own close, not on finalize() alone:
    // finalize() only says everything has been queued into the archive,
    // so a rebuild that returned there would hand the queue to the next
    // run while bytes were still being flushed into the very file it is
    // about to open.
    const written = new Promise<void>((resolve, reject) => {
      writeStream.on("close", () => resolve());
      writeStream.on("error", reject);
      archive.on("error", reject);
    });

    await archive.finalize();
    await written;
  }

  async complete(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: true,
        recipients: true,
        creator: true,
      },
    });

    // Refused ahead of the alreadyCompleted check below, which a
    // container would otherwise trip on its way to a misleading message.
    // A collection is never completed and never reopened: see
    // revertComplete() for what one owner click used to cost.
    if (share?.isCollection)
      throw new BadRequestException(this.i18n.t("share.collectionNotEditable"));

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
        share.name,
        share.creator,
        // Only when the OTP flow has actually proven this address belongs to
        // the person who typed it. senderEmail is collected for every
        // anonymous share regardless of that toggle (see create() above), so
        // the toggle — not the presence of a value — is what makes it safe
        // to hand a recipient a reply target on this domain's letterhead.
        this.config.get("share.requireEmailVerificationForAnonymousShares")
          ? (share.senderEmail ?? undefined)
          : undefined,
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

    // An anonymous sender (no account, so no "Mes transferts" to fall back
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
          share.recipients.map((recipient) => recipient.email),
        )
        .catch((e) => this.logger.error(e));
    }

    // The signed-in creator's own receipt. Not a backstop the way the block
    // above is — a creator never loses the link, "Mes transferts" has it — but
    // a record of the SEND: who it went to, which is the one thing that
    // listing shares cannot tell them afterwards. Opt-out per user
    // (notifyOnSentShares, default on) because it lands in a personal
    // mailbox. Caught rather than awaited-to-fail, same as above: a receipt
    // must never hold up the completion response the upload is waiting on.
    if (
      share.creator &&
      share.creator.notifyOnSentShares &&
      this.config.get("smtp.enabled")
    ) {
      await this.emailService
        .sendShareConfirmationToSender(
          share.creator.email,
          share.id,
          share.name,
          share.expiration,
          emailFiles,
          share.recipients.map((recipient) => recipient.email),
        )
        .catch((e) => this.logger.error(e));
    }

    // Check if any file is malicious with ClamAV
    void this.clamScanService.checkAndRemove(share.id);

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

    return this.transformShare(updatedShare);
  }

  // Refused outright for a collection's container, and this is the single
  // most destructive thing that could happen to one. Unlocking it is not
  // "reopening an upload": it makes ShareService.get() answer not-found
  // to everyone including its owner, drops it out of "Mes transferts"
  // (which filters on uploadLocked), makes the re-complete fail with
  // completionRequiresFile on an transfer that is legitimately still empty,
  // and hands it to JobsService.deleteUnfinishedShares, which within a
  // day deletes the container and cascades the link, the transfer and every
  // contribution away with it. Spec §3 exists to prevent exactly this,
  // and the check belongs here rather than only in the page that offers
  // the button — one is a convenience, the other is the rule.
  async revertComplete(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      select: { isCollection: true },
    });

    if (share?.isCollection)
      throw new BadRequestException(this.i18n.t("share.collectionNotEditable"));

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
        // Only ever non-null for a collection, and only its own owner-set
        // fields are read from it (collectionEndsAt, description) —
        // ShareController.get() is what turns this into ShareDTO's
        // `collection`, not this method, which stays about the Share row
        // itself.
        collectionOf: true,
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

  // Un transfert payé ne s'efface pas sous les pieds de celui qui a payé.
  // Partagée par remove() ET expire() : côté accès, les deux se valent —
  // expirer ramène l'expiration à maintenant, et le garde de téléchargement
  // (isPaidFor via paidAccess.util.ts) répond au même 404 "transfert non
  // trouvé/expiré" qu'une suppression. Sans ce même contrôle sur les deux
  // portes, un vendeur annulerait d'un clic la fenêtre qu'il vient de
  // vendre, sans rien rembourser. `force` est la confirmation explicite que
  // la console demandera plus tard, en affichant combien de personnes ont
  // payé et jusqu'à quand — aucun appelant ne le passe encore en v1.
  private async assertNoActivePaidAccess(shareId: string, force: boolean) {
    if (force) return;

    const enCours = await this.prisma.sharePayment.count({
      where: {
        shareId,
        revokedAt: null,
        accessUntil: { gt: new Date() },
      },
    });

    if (enCours > 0)
      throw new BadRequestException(
        this.i18n.t("share.paidAccessStillRunning", {
          args: { count: enCours },
        }),
      );
  }

  async remove(shareId: string, isDeleterAdmin = false, force = false) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (!share.creatorId && !isDeleterAdmin)
      throw new ForbiddenException(this.i18n.t("share.anonymousNoDelete"));

    await this.assertNoActivePaidAccess(shareId, force);

    await this.fileService.deleteAllFiles(shareId);
    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async expire(shareId: string, force = false) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (!share.creatorId) {
      throw new ForbiddenException(this.i18n.t("share.anonymousNoExpire"));
    }

    await this.assertNoActivePaidAccess(shareId, force);

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
    // Carried, never authored here: no edit path can set or clear the
    // restriction, so its only job is to survive one. It used to not:
    // the row was deleted whenever password and maxViews both came out
    // empty, and the upsert's create branch never copied it — so a share
    // restricted to its recipients, with no password and no view limit,
    // lost its restriction the moment its owner renamed it.
    const nextRestrictToRecipients =
      currentSecurity?.restrictToRecipients ?? false;

    // A row carrying nothing has no reason to exist; a row carrying only
    // the restriction very much does. The old test asked about two of the
    // three columns and threw the row away on their word alone.
    const carriesNothing =
      !nextPassword && !nextMaxViews && !nextRestrictToRecipients;

    if (carriesNothing) {
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
        restrictToRecipients: nextRestrictToRecipients,
      },
      update: {
        password: nextPassword,
        maxViews: nextMaxViews,
        restrictToRecipients: nextRestrictToRecipients,
      },
    });
  }

  async isShareCompleted(id: string) {
    return (await this.prisma.share.findUnique({ where: { id } })).uploadLocked;
  }

  // No existence check here - ShareOwnerGuard already threw NotFoundException
  // upstream if shareId doesn't resolve to a real share.
  async getDownloads(shareId: string) {
    return this.prisma.shareDownload.findMany({
      where: { shareId },
      orderBy: { createdAt: "desc" },
    });
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
