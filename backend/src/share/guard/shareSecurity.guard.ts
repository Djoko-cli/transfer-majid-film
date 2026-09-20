import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "src/prisma/prisma.service";
import { ShareService } from "src/share/share.service";
import { ConfigService } from "src/config/config.service";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { VerificationService } from "src/verification/verification.service";
import { User } from "@prisma/client";
import { REQUIRES_PAYMENT_KEY } from "src/share/decorator/requiresPayment.decorator";
import { isPaidFor } from "src/share/paidAccess.util";

@Injectable()
export class ShareSecurityGuard extends JwtGuard {
  constructor(
    private shareService: ShareService,
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly i18n: I18nService,
    private readonly reflector: Reflector,
    private readonly verificationService: VerificationService,
  ) {
    super(configService);
  }

  protected async authenticateUser(
    context: ExecutionContext,
  ): Promise<User | undefined> {
    await super.canActivate(context);
    const request: Request = context.switchToHttp().getRequest();
    return request.user as User;
  }

  protected async isRecipient(
    share: {
      id: string;
      userRecipients: { userId: string }[];
      recipients: { email: string }[];
    },
    user?: User,
  ): Promise<boolean> {
    if (!user) return false;
    if (!this.configService.get("share.enableUserRecipients")) return false;

    // Already linked as a recipient of this share.
    const isLinked = share.userRecipients.some((r) => r.userId === user.id);
    if (isLinked) return true;

    // Otherwise, if the user's (account-verified) email matches one of the
    // share's recipients, grant access and link them
    const userEmail = user.email?.toLowerCase();
    const isEmailRecipient =
      !!userEmail &&
      share.recipients.some((r) => r.email.toLowerCase() === userEmail);
    if (isEmailRecipient) {
      await this.prisma.shareUserRecipient.upsert({
        where: { userId_shareId: { userId: user.id, shareId: share.id } },
        create: { userId: user.id, shareId: share.id },
        update: {},
      });
      return true;
    }
    return false;
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    const shareToken = request.cookies[`share_${shareId}_token`];

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: {
        security: true,
        userRecipients: { select: { userId: true } },
        recipients: { select: { email: true } },
        payments: { select: { email: true, revokedAt: true } },
      },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    const user = await this.authenticateUser(context);

    // If admin access is enabled and user is admin, allow access
    if (
      user?.isAdmin &&
      this.configService.get("share.allowAdminAccessAllShares")
    ) {
      return true;
    }

    if (
      moment().isAfter(share.expiration) &&
      !moment(share.expiration).isSame(0)
    ) {
      throw new NotFoundException(this.i18n.t("share.notFound"));
    }

    // The creator never needed a token to prove anything about their own
    // share: they can already read the whole of it through /from-owner,
    // delete it and expire it. Until the tokenless byte path was removed
    // they reached their own files only because that path let *everyone*
    // through — so this is not a new door, it is the one door the creator
    // always had, finally written down. The restriction check below has
    // exempted them all along, for the same reason.
    if (user && share.creatorId === user.id) return true;

    // If user sharing is enabled, check if the authenticated user is a recipient
    if (await this.isRecipient(share, user)) {
      this.checkPayment(context, share, request);
      return true;
    }

    // If share is restricted to named recipients, block everyone else (excluding the creator)
    if (
      share.security?.restrictToRecipients &&
      (!user || share.creatorId !== user.id)
    ) {
      throw new ForbiddenException(
        this.i18n.t("share.restrictedToRecipients"),
        "share_restricted_to_recipients",
      );
    }

    if (share.security?.password && !shareToken)
      throw new ForbiddenException(
        this.i18n.t("file.passwordProtected"),
        "share_password_required",
      );

    if (!(await this.shareService.verifyShareToken(share, shareToken)))
      throw new ForbiddenException(
        this.i18n.t("share.tokenRequired"),
        "share_token_required",
      );

    // Posée en dernier, après mot de passe et restriction : payer ne dispense
    // de rien d'autre. Les deux dérogations plus haut — administrateur et
    // créateur — gardent leur `return true` inconditionnel, volontairement :
    // le vendeur doit pouvoir télécharger son propre transfert payant sans
    // se le payer à lui-même. Le destinataire nommé, lui, n'a pas cette
    // excuse — être invité sur le transfert n'est pas l'avoir vendu — donc
    // son issue à `isRecipient` ci-dessus passe par le même contrôle.
    this.checkPayment(context, share, request);

    return true;
  }

  // Lève si la route est marquée `@RequiresPayment()` et que le transfert est
  // payant et non payé par l'adresse prouvée de cette requête ; ne fait rien
  // sinon. Appelée aux deux seules sorties de canActivate qui ne sont pas une
  // dérogation (administrateur, créateur) : voir les deux appels ci-dessus.
  private checkPayment(
    context: ExecutionContext,
    share: {
      priceCents: number | null;
      payments: { email: string; revokedAt: Date | null }[];
    },
    request: Request,
  ): void {
    const exigePaiement = this.reflector.get<boolean>(
      REQUIRES_PAYMENT_KEY,
      context.getHandler(),
    );

    if (
      exigePaiement &&
      !isPaidFor({
        priceCents: share.priceCents,
        verifiedEmail: this.verificationService.getVerifiedEmail(request),
        payments: share.payments,
      })
    ) {
      throw new ForbiddenException(
        this.i18n.t("share.paymentRequired"),
        "share_payment_required",
      );
    }
  }
}
