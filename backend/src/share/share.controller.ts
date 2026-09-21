import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { File, ReverseShare, Share, ShareSecurity, User } from "@prisma/client";
import { Request, Response } from "express";
import * as moment from "moment";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { AdminShareDTO } from "./dto/adminShare.dto";
import { CreateShareDTO } from "./dto/createShare.dto";
import { MyShareDTO } from "./dto/myShare.dto";
import { ShareDTO } from "./dto/share.dto";
import { ShareDownloadDTO } from "./dto/shareDownload.dto";
import { ShareMetaDataDTO } from "./dto/shareMetaData.dto";
import { SharePasswordDto } from "./dto/sharePassword.dto";
import { UpdateShareDTO } from "./dto/updateShare.dto";
import { GetShare } from "./decorator/getShare.decorator";
import { CreateShareGuard } from "./guard/createShare.guard";
import { ShareOwnerGuard } from "./guard/shareOwner.guard";
import { StrictShareOwnerGuard } from "./guard/strictShareOwner.guard";
import { ShareSecurityGuard } from "./guard/shareSecurity.guard";
import { ShareTokenSecurity } from "./guard/shareTokenSecurity.guard";
import { IdValidation } from "./guard/shareIdValidation.guard";
import { ShareService } from "./share.service";
import { ContributionService } from "./contribution.service";
import { VerificationService } from "src/verification/verification.service";
import { CompletedShareDTO } from "./dto/shareComplete.dto";
import { isPaidFor } from "./paidAccess.util";
@Controller("shares")
export class ShareController {
  constructor(
    private shareService: ShareService,
    private contributionService: ContributionService,
    private verificationService: VerificationService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  @Get("all")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getAllShares() {
    return new AdminShareDTO().fromList(await this.shareService.getShares());
  }

  @Get()
  @UseGuards(JwtGuard)
  async getMyShares(@GetUser() user: User) {
    return new MyShareDTO().fromList(
      await this.shareService.getSharesByUser(user.id),
    );
  }

  @Get("received")
  @UseGuards(JwtGuard)
  async getReceivedShares(@GetUser() user: User) {
    if (!this.config.get("share.enableUserRecipients"))
      throw new ForbiddenException("User recipients are not enabled");
    return this.shareService.getReceivedShares(user.id);
  }

  @Get(":id")
  @UseGuards(IdValidation, ShareSecurityGuard)
  async get(@Param("id") id: string, @Req() request: Request) {
    const share = await this.shareService.get(id);
    const isPaidForViewer = this.resolveIsPaidForViewer(share, request);
    // Keyed off isCollection alone, deliberately not off collectionOf: a
    // container whose link row has been deleted is still a collection,
    // still full of contributions, and used to fall through to a raw
    // ShareDTO here — which published every real ShareContribution uuid in
    // files[].contributionId. Those ids happen to be unusable while
    // collectionOf is missing (ContributionGuard refuses too), but the
    // rule is that they are never published, and it must not rest on a
    // second check elsewhere happening to agree.
    if (!share.isCollection) {
      return new ShareDTO().from({ ...share, isPaidForViewer });
    }

    const { files, collection } = await this.buildCollectionState(id, share);
    return new ShareDTO().from({
      ...share,
      files,
      collection,
      isPaidForViewer,
    });
  }

  // Le même calcul que ShareSecurityGuard.checkPayment (isPaidFor), plus
  // les deux mêmes dérogations que ShareSecurityGuard.canActivate :
  // créateur et administrateur avec allowAdminAccessAllShares. Sans elles,
  // le vendeur verrait "Débloquer pour 300 €" sur son propre transfert —
  // isPaidFor seul répond "as-tu payé", pas "la porte s'ouvrira-t-elle
  // pour toi". C'est shareSecurity.guard.ts qui reste l'autorité : ce
  // booléen n'est qu'un affichage, jamais une décision d'accès — s'il se
  // trompe, au pire l'écran ment, jamais un fichier ne part à qui ne l'a
  // pas payé.
  private resolveIsPaidForViewer(
    share: {
      priceCents: number | null;
      creatorId: string | null;
      payments: { email: string; revokedAt: Date | null }[];
    },
    request: Request,
  ): boolean {
    const user = request.user as User | undefined;

    if (user && share.creatorId === user.id) return true;
    if (user?.isAdmin && this.config.get("share.allowAdminAccessAllShares"))
      return true;

    return isPaidFor({
      priceCents: share.priceCents,
      verifiedEmail: this.verificationService.getVerifiedEmail(request),
      payments: share.payments,
    });
  }

  // Assembled here, not in ShareService.get(), which stays about the Share
  // row alone — this is what turns spec §5.2's "l'transfer, groupée par
  // contribution" into ShareDTO.collection. Only ever called once get()
  // has already confirmed share.isCollection, i.e. this really is a
  // collection — every ordinary transfer's response never reaches this
  // method at all, and simply has no `collection` key.
  //
  // collectionOf may still be null here, for a container whose link row
  // was deleted: there is then no window and no use count to report, so
  // `collection` is left out exactly as for an ordinary transfer (the
  // frontend already treats it as optional) — but the file projection
  // below still runs, because the opaque keys are not a nicety of the
  // open state.
  //
  // A contribution's real id is the only thing ContributionGuard checks
  // before letting a POST write files into it, or close it (see that
  // guard's own comment) — identity is proven once, at open(), and every
  // write after that trusts the id alone. Before this method existed, that
  // id was known only to whoever opened the contribution. Handing it back
  // here to every transfer reader — collection.contributions[].id, and each
  // file's own contributionId — would let anyone past the password gate
  // POST into another contributor's still-open upload and complete it, and
  // since name-level impersonation is accepted by this whole design (a
  // first name nobody verifies) but the proven address is not, that
  // reattributes real address-backed files to whoever opens fastest. The
  // window is the in-flight upload, and it is permanent for one that was
  // abandoned — a failed deposit leaves its contribution open forever (see
  // ContributionService.open()'s own comment on that accepted tradeoff).
  //
  // So neither the response's contributions list nor any file in it ever
  // carries the real id: keyByContributionId hands out an opaque key —
  // stable within this one response, meaningless outside it, useless
  // against ContributionGuard — and every file's contributionId is
  // rewritten to match before serialization. The real id keeps going to
  // exactly one place: the response to POST .../contributions, read only
  // by whoever just proved their own identity to get it.
  private async buildCollectionState(
    shareId: string,
    share: Share & { collectionOf: ReverseShare | null; files: File[] },
  ) {
    const contributions = await this.contributionService.getWithFiles(shareId);
    const reverseShare = share.collectionOf;

    const keyByContributionId = new Map(
      contributions.map((contribution, index) => [contribution.id, String(index)]),
    );

    const files = share.files.map((file) => ({
      ...file,
      contributionId: file.contributionId
        ? (keyByContributionId.get(file.contributionId) ?? null)
        : null,
    }));

    if (!reverseShare) return { files, collection: undefined };

    return {
      files,
      collection: {
        // Folds in remainingUses, not just the deposit window: a
        // collection that has spent every use it was given is just as
        // closed to a new deposit as one whose window has passed, and
        // the frontend has one boolean to ask, not two.
        isOpen:
          reverseShare.collectionEndsAt > new Date() &&
          reverseShare.remainingUses > 0,
        endsAt: reverseShare.collectionEndsAt,
        description: reverseShare.description ?? undefined,
        contributions: contributions.map((contribution) => ({
          id: keyByContributionId.get(contribution.id)!,
          // A signed-in contributor's open() never stores a name — their
          // account already identifies them (spec §5.3) — so this falls
          // back to the account's own username rather than reading as
          // unattributed.
          name: contribution.name ?? contribution.user?.username ?? undefined,
          createdAt: contribution.createdAt,
          fileCount: contribution.files.length,
        })),
      },
    };
  }

  @Get(":id/from-owner")
  @UseGuards(IdValidation, StrictShareOwnerGuard)
  async getFromOwner(@Param("id") id: string) {
    return new ShareDTO().from(await this.shareService.get(id));
  }

  @Get(":id/metaData")
  @UseGuards(IdValidation, ShareSecurityGuard)
  async getMetaData(@Param("id") id: string) {
    return new ShareMetaDataDTO().from(await this.shareService.getMetaData(id));
  }

  // Same guard as PATCH :id below - creator or admin, plus, for an
  // anonymous share (which has no creator to check against), whoever
  // holds its id while it's still being uploaded to. Once that share is
  // marked complete, ShareOwnerGuard locks anonymous access out entirely,
  // so nobody but the creator or an admin can reach this route after that
  // point.
  @Get(":id/downloads")
  @UseGuards(IdValidation, ShareOwnerGuard)
  async getDownloads(@Param("id") id: string, @GetUser() user: User) {
    const downloads = await this.shareService.getDownloads(id);
    return new ShareDownloadDTO().fromList(
      user?.isAdmin ? downloads : downloads.map((d) => ({ ...d, ipAddress: null })),
    );
  }

  @Post()
  @UseGuards(CreateShareGuard)
  async create(
    @Body() body: CreateShareDTO,
    @Req() request: Request,
    @GetUser() user: User,
  ) {
    return new ShareDTO().from(
      await this.shareService.create(
        body,
        user,
        // Read here rather than in the service: the cookie is an HTTP
        // detail, and the service should be handed a proven address or
        // nothing at all.
        this.verificationService.getVerifiedEmail(request) ?? undefined,
      ),
    );
  }

  @Patch(":id")
  @UseGuards(IdValidation, ShareOwnerGuard)
  async update(
    @Param("id") id: string,
    @Body() body: UpdateShareDTO,
    @GetShare() share: Share & { security?: ShareSecurity },
    @GetUser() user: User,
  ) {
    return new MyShareDTO().from(
      await this.shareService.update(id, body, user, share),
    );
  }

  @Post(":id/complete")
  @HttpCode(202)
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async complete(@Param("id") id: string) {
    return new CompletedShareDTO().from(await this.shareService.complete(id));
  }

  @Delete(":id/complete")
  @UseGuards(IdValidation, StrictShareOwnerGuard)
  async revertComplete(@Param("id") id: string) {
    return new ShareDTO().from(await this.shareService.revertComplete(id));
  }

  @Delete(":id")
  @UseGuards(IdValidation, ShareOwnerGuard)
  async remove(@Param("id") id: string, @GetUser() user: User) {
    const isDeleterAdmin = user?.isAdmin === true;
    await this.shareService.remove(id, isDeleterAdmin);
  }

  @Post(":id/expire")
  @HttpCode(200)
  @UseGuards(IdValidation, ShareOwnerGuard)
  async expire(@Param("id") id: string) {
    await this.shareService.expire(id);
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60 * 1000,
    },
  })
  @Get("isShareIdAvailable/:id")
  async isShareIdAvailable(@Param("id") id: string) {
    return this.shareService.isShareIdAvailable(id);
  }

  @HttpCode(200)
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @UseGuards(IdValidation, ShareTokenSecurity)
  @Post(":id/token")
  async getShareToken(
    @Param("id") id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: SharePasswordDto,
  ) {
    const token = await this.shareService.getShareToken(id, body.password);

    this.clearShareTokenCookies(request, response);
    response.cookie(`share_${id}_token`, token, {
      path: "/",
      httpOnly: true,
    });

    return { token };
  }

  /**
   * Keeps the 10 most recent share token cookies and deletes the rest and all expired ones
   */
  private clearShareTokenCookies(request: Request, response: Response) {
    const shareTokenCookies = Object.entries(request.cookies)
      .filter(([key]) => key.startsWith("share_") && key.endsWith("_token"))
      .map(([key, value]) => ({
        key,
        payload: this.jwtService.decode(value),
      }));

    const expiredTokens = shareTokenCookies.filter(
      (cookie) => cookie.payload.exp < moment().unix(),
    );
    const validTokens = shareTokenCookies.filter(
      (cookie) => cookie.payload.exp >= moment().unix(),
    );

    expiredTokens.forEach((cookie) => response.clearCookie(cookie.key));

    if (validTokens.length > 10) {
      validTokens
        .sort((a, b) => a.payload.exp - b.payload.exp)
        .slice(0, -10)
        .forEach((cookie) => response.clearCookie(cookie.key));
    }
  }
}
