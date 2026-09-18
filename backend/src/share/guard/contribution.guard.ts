import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "src/prisma/prisma.service";

// What lets a stranger write into someone else's transfer, and the only
// thing that does. Three conditions, all necessary: the transfer is a
// collection, its collection window is still open, and the contribution
// named in the path belongs to it and has not been closed. A contribution
// is only ever opened against a proven identity (see ContributionService),
// so this guard inherits that proof rather than re-checking it.
@Injectable()
export class ContributionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const { id, contributionId } = request.params;

    const contribution = await this.prisma.shareContribution.findUnique({
      where: { id: contributionId },
      include: { share: { include: { collectionOf: true } } },
    });

    if (!contribution || contribution.shareId !== id)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    if (contribution.completedAt)
      throw new ForbiddenException(
        this.i18n.t("share.contributionClosed"),
        "contribution_closed",
      );

    if (
      !contribution.share.isCollection ||
      !contribution.share.collectionOf ||
      contribution.share.collectionOf.collectionEndsAt < new Date()
    )
      throw new ForbiddenException(
        this.i18n.t("share.collectionClosed"),
        "collection_closed",
      );

    (request as any).contribution = contribution;
    return true;
  }
}
