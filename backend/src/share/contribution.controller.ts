import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SkipThrottle } from "@nestjs/throttler";
import { Request } from "express";
import { ConfigService } from "src/config/config.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { VerificationService } from "src/verification/verification.service";
import { ContributionService } from "./contribution.service";
import { ContributionGuard } from "./guard/contribution.guard";
import { ShareSecurityGuard } from "./guard/shareSecurity.guard";
import { IdValidation } from "./guard/shareIdValidation.guard";

@Controller("shares/:id/contributions")
export class ContributionController {
  constructor(
    private contributionService: ContributionService,
    private verificationService: VerificationService,
    private fileService: FileService,
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // ShareSecurityGuard is the one door spec §5.1 wants asked before
  // reading *or* depositing: a password-protected (or recipient-
  // restricted) collection must refuse a deposit exactly as it refuses a
  // read, and it must do so before ContributionGuard ever runs — a
  // stranger holding a link's slug but not its password proves nothing
  // by opening a contribution. It costs a real contributor nothing extra:
  // reading the album already put them through the same token cycle.
  @Post()
  @UseGuards(IdValidation, ShareSecurityGuard)
  async open(
    @Param("id") shareId: string,
    @Body() body: { name?: string },
    @Req() request: Request,
  ) {
    const contribution = await this.contributionService.open(
      shareId,
      body?.name,
      await this.getCurrentUserId(request),
      // Read here rather than in the service: the cookie is an HTTP
      // detail, and the service should be handed a proven address or
      // nothing at all — same pattern as ShareController.create().
      this.verificationService.getVerifiedEmail(request) ?? undefined,
    );
    return { id: contribution.id };
  }

  @Post(":contributionId/files")
  @SkipThrottle()
  @UseGuards(IdValidation, ShareSecurityGuard, ContributionGuard)
  async uploadFile(
    @Query()
    query: {
      id: string;
      name: string;
      chunkIndex: string;
      totalChunks: string;
    },
    @Body() body: string,
    @Param("id") shareId: string,
    @Param("contributionId") contributionId: string,
  ) {
    const { id, name, chunkIndex, totalChunks } = query;

    // The id, when present, is never one a caller invents — it's only
    // ever the one this same route handed back in an earlier chunk's
    // response, echoed so the upload can resume (see share.service.ts's
    // uploadFile on the frontend). fileService.create() itself refuses an
    // id that already names a real row (LocalFileService.create()), which
    // covers this route and the classic one with the one check.

    // Data can be empty if the file is empty
    const file = await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
      contributionId,
    );

    // Only ever matches a row once the last chunk has landed and
    // LocalFileService.create() has actually created the File — a no-op
    // on every chunk before that, since this route (like
    // FileController.create() itself) has no way to know which chunk is
    // last ahead of the call above returning. Scoped to this share and to
    // a file with no contribution yet: even if some future caller ever
    // reused an id the check above didn't catch, this can still only ever
    // claim a file of this collection that belongs to nobody yet — never
    // repoint an already-attributed file, and never reach into another
    // transfer entirely.
    await this.prisma.file.updateMany({
      where: { id: file.id, shareId, contributionId: null },
      data: { contributionId },
    });

    return file;
  }

  @Post(":contributionId/complete")
  @HttpCode(200)
  @UseGuards(IdValidation, ShareSecurityGuard, ContributionGuard)
  async complete(@Req() request: Request) {
    return this.contributionService.complete((request as any).contribution);
  }

  // Mirrors AuthService.getIdOfCurrentUser. Resolved here instead of by
  // injecting AuthModule, which would open a real module cycle through
  // UserModule -> FileModule -> ShareModule for a single lookup. The
  // cookie is an HTTP detail either way — same reasoning as
  // VerificationService.getVerifiedEmail just above.
  private async getCurrentUserId(
    request: Request,
  ): Promise<string | undefined> {
    const token = request.cookies?.access_token;
    if (!token) return undefined;

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get("internal.jwtSecret"),
      });
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
