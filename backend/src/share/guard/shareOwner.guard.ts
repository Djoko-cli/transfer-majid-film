import {
  ExecutionContext,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";

@Injectable()
export class ShareOwnerGuard extends JwtGuard {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {
    super(configService);
  }

  isBase64(toCheck: string) {
    const isBase64 = /^[a-zA-Z0-9_-]*={0,2}$/.test(toCheck);
    return isBase64;
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    if (!this.isBase64(shareId)) {
      throw new BadRequestException(this.i18n.t("file.invalidIdFormat"));
    }

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    (request as any).share = share;

    // Run the JWTGuard to set the user
    await super.canActivate(context);
    const user = request.user as User;

    // If the user is the creator of the share, allow access
    if (user && share.creatorId == user.id) return true;

    // If the user is an admin, allow access
    if (this.allowAdmin && user?.isAdmin) return true;

    // An anonymous share has no owner once it is finished, so nobody
    // passes an ownership check for it — least of all whoever merely
    // holds its link. While it is still being uploaded to, though, the
    // only person who can hold its id is the person creating it, and
    // this same guard fronts every upload route: refusing outright would
    // let an anonymous sender create a share and then fail to put a
    // single file in it.
    //
    // What this closes is the two reads nothing checked afterwards, both
    // of which only happen once the share is complete: GET :id/downloads,
    // whose service method has no ownership check at all, and
    // GET :id/from-owner, which returns the whole share — file list
    // included — past both the password and the visitor limit. It also
    // closes a third, worse one: DELETE :id/complete, fronted by this
    // same check via StrictShareOwnerGuard, which flips uploadLocked back
    // to false — without this, anyone holding a completed anonymous
    // share's id could reopen it that way and then add or delete files
    // through the four upload routes and DELETE :shareId/files/:fileId,
    // all fronted by the same guard. The three writes the base guard
    // fronts already refuse anonymous shares further in
    // (ShareService.update, remove and expire).
    if (!share.creatorId) return !share.uploadLocked;

    // If not signed in, deny access
    if (!user) return false;

    return false;
  }

  protected get allowAdmin(): boolean {
    return true;
  }
}
