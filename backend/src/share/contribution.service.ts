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

    return this.prisma.$transaction(async (tx) => {
      await tx.reverseShare.update({
        where: { id: share.collectionOf.id },
        data: { remainingUses: { decrement: 1 } },
      });

      return tx.shareContribution.create({
        data: {
          shareId,
          name: name || undefined,
          userId: userId || undefined,
          // Only ever the address the code proved, never re-declared once
          // a userId is known — see the schema's own comment on this field.
          email: !userId ? verifiedEmail : undefined,
        },
      });
    });
  }

  // The archive is rebuilt from scratch on every contribution. On a
  // multi-gigabyte album that will be felt, and the answer then is to
  // build it on demand instead — measure before assuming either way.
  async complete(contribution: ShareContribution) {
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

    const closed = await this.prisma.shareContribution.update({
      where: { id: contribution.id },
      data: { completedAt: new Date() },
    });

    const collection = await this.prisma.reverseShare.findUnique({
      where: { containerShareId: contribution.shareId },
      include: { creator: true },
    });

    if (
      collection?.sendEmailNotification &&
      this.config.get("smtp.enabled")
    ) {
      await this.emailService.sendMailToReverseShareCreator(
        collection.creator.email,
        contribution.shareId,
      );
    }

    return closed;
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
