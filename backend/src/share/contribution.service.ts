import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ShareContribution } from "@prisma/client";
import { I18nService } from "nestjs-i18n";
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

    if (share.collectionOf.remainingUses <= 0)
      throw new ForbiddenException(
        this.i18n.t("share.collectionClosed"),
        "collection_closed",
      );

    // An identity is required, and it is never the one that was typed: a
    // signed-in account, or an address the one-time code proved. The link
    // used to stand in for identity — a valid token was a free pass — and
    // that is exactly why nobody could tell who had sent what.
    if (!userId && !verifiedEmail) throw new ForbiddenException();

    // remainingUses is spent in complete(), not here: it counts deposits
    // actually made, and an opened-then-abandoned contribution must cost
    // the collection nothing — see complete()'s own comment.
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
  // multi-gigabyte album that will be felt, and the answer then is to
  // build it on demand instead — measure before assuming either way.
  async complete(contribution: ShareContribution) {
    // Conditional rather than a plain decrement, and done first: the count
    // is only *read* at open() (see its own comment), so nothing stops
    // someone opening far more contributions than maxUseCount while it is
    // still positive and then completing them all. Bounding it here,
    // atomically, at the one moment a deposit actually becomes real, is
    // what makes maxUseCount mean what it says — a plain decrement would
    // let the count go negative and accept unlimited deposits. Checked
    // before completedAt is ever touched, so a genuinely exhausted
    // collection refuses cleanly: no zip rebuild, no contribution left
    // looking completed behind the error the caller actually sees.
    const claimed = await this.prisma.reverseShare.updateMany({
      where: {
        containerShareId: contribution.shareId,
        remainingUses: { gt: 0 },
      },
      data: { remainingUses: { decrement: 1 } },
    });
    if (claimed.count === 0)
      throw new ForbiddenException(
        this.i18n.t("share.collectionClosed"),
        "collection_full",
      );

    // Conditional on completedAt still being null, so two concurrent
    // completions of the *same* contribution can both pass the claim
    // above, but only one of them actually closes it. The loser's write
    // matches zero rows: refund the use it just claimed (it never really
    // happened) and say plainly that the contribution is already closed,
    // rather than double-spending on one deposit made once.
    const closing = await this.prisma.shareContribution.updateMany({
      where: { id: contribution.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (closing.count === 0) {
      await this.prisma.reverseShare.updateMany({
        where: { containerShareId: contribution.shareId },
        data: { remainingUses: { increment: 1 } },
      });
      throw new ForbiddenException(
        this.i18n.t("share.contributionClosed"),
        "contribution_closed",
      );
    }

    await this.prisma.share.update({
      where: { id: contribution.shareId },
      data: { isZipReady: false },
    });

    void this.shareService.createZip(contribution.shareId).then(() =>
      this.prisma.share.update({
        where: { id: contribution.shareId },
        data: { isZipReady: true },
      }),
    );

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

    return this.prisma.shareContribution.findUnique({
      where: { id: contribution.id },
    });
  }

  // The contributions with their files, for task 5's DTO.
  async getWithFiles(shareId: string) {
    return this.prisma.shareContribution.findMany({
      where: { shareId },
      include: { files: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
