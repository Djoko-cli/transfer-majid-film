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

  @Post()
  @UseGuards(IdValidation)
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
  @UseGuards(IdValidation, ContributionGuard)
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

    // Data can be empty if the file is empty
    const file = await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
    );

    // Only ever matches a row once the last chunk has landed and
    // LocalFileService.create() has actually created the File — a no-op
    // on every chunk before that, since this route (like
    // FileController.create() itself) has no way to know which chunk is
    // last ahead of the call above returning.
    await this.prisma.file.updateMany({
      where: { id: file.id },
      data: { contributionId },
    });

    return file;
  }

  @Post(":contributionId/complete")
  @HttpCode(200)
  @UseGuards(IdValidation, ContributionGuard)
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
