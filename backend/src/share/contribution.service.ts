import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ShareContribution } from "@prisma/client";
import { I18nService } from "nestjs-i18n";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ShareService } from "./share.service";

@Injectable()
export class ContributionService {
  constructor(
    private prisma: PrismaService,
    private shareService: ShareService,
    private emailService: EmailService,
    private clamScanService: ClamScanService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async open(
    shareId: string,
    name: string | undefined,
    userId: string | undefined,
    verifiedEmail: string | undefined,
  ) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { collectionOf: true },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (
      !share.isCollection ||
      !share.collectionOf ||
      share.collectionOf.collectionEndsAt < new Date()
    )
      throw new ForbiddenException(
        this.i18n.t("share.collectionClosed"),
        "collection_closed",
      );

    // An identity is required, and it is never the one that was typed: a
    // signed-in account, or an address the one-time code proved. The link
    // used to stand in for identity — a valid token was a free pass — and
    // that is exactly why nobody could tell who had sent what. Checked
    // before the claim below, so a request with no identity never spends
    // a use it was always going to be refused anyway.
    if (!userId && !verifiedEmail) throw new ForbiddenException();

    // Claimed atomically, right here, rather than merely read: a plain
    // `remainingUses <= 0` check is what let someone open far more
    // contributions than maxUseCount while the count stayed positive and
    // then complete them all. open() is the one action every
    // contribution goes through exactly once — finished or abandoned —
    // so it is the one place that can bind the count without adding
    // reclaim machinery. The alternative (claiming at complete()) was
    // tried and reverted: it strands an uploaded-but-never-closed
    // contribution forever, with no use spent, no notification, no zip,
    // and nothing on the server that ever reconciles it. An abandoned
    // contribution costs a use now, and that is accepted — these routes
    // require the collection's password and a proven identity, so
    // spending twenty uses means being an invited participant who
    // chooses to sabotage the transfer they were invited to, not a stranger
    // with a free pass.
    const claimed = await this.prisma.reverseShare.updateMany({
      where: { containerShareId: shareId, remainingUses: { gt: 0 } },
      data: { remainingUses: { decrement: 1 } },
    });
    if (claimed.count === 0)
      throw new ForbiddenException(
        this.i18n.t("share.collectionClosed"),
        "collection_full",
      );

    return this.prisma.shareContribution.create({
      data: {
        shareId,
        name: name || undefined,
        userId: userId || undefined,
        // Only ever the address the code proved, never re-declared once
        // a userId is known — see the schema's own comment on this field.
        email: !userId ? verifiedEmail : undefined,
      },
    });
  }

  // The archive is rebuilt from scratch on every contribution. On a
  // multi-gigabyte transfer that will be felt, and the answer then is to
  // build it on demand instead — measure before assuming either way.
  //
  // A plain close: the use this contribution spends was already claimed
  // at open() (see its own comment), and re-completing an already-closed
  // contribution is refused before this ever runs — ContributionGuard
  // reads the same completedAt and throws the same "contribution_closed"
  // for a request the guard itself already turned back.
  async complete(contribution: ShareContribution) {
    await this.prisma.share.update({
      where: { id: contribution.shareId },
      data: { isZipReady: false },
    });

    // Scanned, then rebuilt, in that order. A deposit is the one write
    // path in this product open to someone who does not own the
    // transfert, so it gets the same antivirus step the ordinary upload
    // has had all along (ShareService.complete()) — scoped to this
    // contribution's own files, since the container is everybody's
    // transfer. Chaining the rebuild behind it keeps a file the scan is
    // about to remove out of "tout télécharger". Both stay off the
    // response's critical path, exactly as the ordinary path does it: a
    // contributor should not wait on a multi-gigabyte scan to be told
    // their deposit landed. checkAndRemove() swallows its own errors, so
    // the rebuild runs either way.
    void this.clamScanService
      .checkAndRemove(contribution.shareId, contribution.id)
      .then(() => this.shareService.createZip(contribution.shareId))
      .then(() =>
        this.prisma.share.update({
          where: { id: contribution.shareId },
          data: { isZipReady: true },
        }),
      );

    const closed = await this.prisma.shareContribution.update({
      where: { id: contribution.id },
      data: { completedAt: new Date() },
    });

    const collection = await this.prisma.reverseShare.findUnique({
      where: { containerShareId: contribution.shareId },
      include: { creator: true },
    });

    if (collection?.sendEmailNotification && this.config.get("smtp.enabled")) {
      await this.emailService.sendMailToReverseShareCreator(
        collection.creator.email,
        contribution.shareId,
      );
    }

    return closed;
  }

  // The contributions with their files, for task 5's DTO. `user` is
  // included (username only — never the full row, which would otherwise
  // carry a password hash into memory for no reason) so a signed-in
  // contributor's group can show their account name instead of falling
  // through to "Anonyme": ShareController resolves the display name as
  // `contribution.name ?? contribution.user?.username`, since a signed-in
  // open() never stores a name (see open()'s own `name: name || undefined`
  // — nothing was ever asked, per spec §5.3).
  async getWithFiles(shareId: string) {
    return this.prisma.shareContribution.findMany({
      where: { shareId },
      include: { files: true, user: { select: { username: true } } },
      orderBy: { createdAt: "asc" },
    });
  }
}
