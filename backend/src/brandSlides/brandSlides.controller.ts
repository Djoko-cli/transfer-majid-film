import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Response } from "express";
import { I18nService } from "nestjs-i18n";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { BrandSlidesService } from "./brandSlides.service";
import { BrandSyncService } from "./brandSync.service";
import { UpdateBrandSlideDTO } from "./dto/updateBrandSlide.dto";

const IMAGE_FORMATS = ["avif", "webp"] as const;

@Controller("brand-slides")
export class BrandSlidesController {
  constructor(
    private brandSlidesService: BrandSlidesService,
    private brandSyncService: BrandSyncService,
    private readonly i18n: I18nService,
  ) {}

  // Public, no guard — BrandPanel.tsx renders on every auth page and the
  // public upload page, unauthenticated, and needs this to filter its
  // slide pool before first paint. @SkipThrottle for the same reason
  // ConfigController.list() has it: hit on every unauthenticated page
  // load, shouldn't compete with the app's global request throttle.
  @Get("disabled")
  @SkipThrottle()
  async listDisabled() {
    return this.brandSlidesService.listDisabled();
  }

  // Public, same reasoning as above — the live, synced catalog. Empty
  // until BrandSyncService has actually run once; BrandPanel.tsx falls
  // back to its own bundled static catalog in that case.
  @Get("catalog")
  @SkipThrottle()
  async getCatalog() {
    return this.brandSlidesService.getCatalog();
  }

  // Public — same audience as the two routes above, serving what the
  // static Next.js /img/brand/derived/* files serve for the fallback
  // catalog. Long cache lifetime: these are non-sensitive, rarely-changing
  // assets, matching majid.film's own documented 30-day image policy —
  // deliberately different from the private share-file download route,
  // which has no caching headers at all.
  @Get("image/:slug/:still/:width/:format")
  @SkipThrottle()
  async getImage(
    @Res({ passthrough: true }) res: Response,
    @Param("slug") slug: string,
    @Param("still", ParseIntPipe) still: number,
    @Param("width", ParseIntPipe) width: number,
    @Param("format") format: string,
  ) {
    if (!IMAGE_FORMATS.includes(format as (typeof IMAGE_FORMATS)[number]))
      throw new BadRequestException(this.i18n.t("brandSlides.invalidFormat"));

    const stream = await this.brandSlidesService.getImageStream(
      slug,
      still,
      width,
      format as "avif" | "webp",
    );

    res.set({
      "Content-Type": format === "avif" ? "image/avif" : "image/webp",
      "Cache-Control": "public, max-age=2592000",
    });

    return new StreamableFile(stream);
  }

  @Patch("admin/:slug/:still")
  @UseGuards(JwtGuard, AdministratorGuard)
  async setDisabled(
    @Param("slug") slug: string,
    @Param("still", ParseIntPipe) still: number,
    @Body() { disabled }: UpdateBrandSlideDTO,
  ) {
    return this.brandSlidesService.setDisabled(slug, still, disabled);
  }

  // Manual "Sync now" trigger — the same syncFromMajidfilm() the nightly
  // cron calls (jobs.service.ts), just invoked on demand. Translates the
  // service's own {ok:false, reason} result into a real HTTP error here;
  // the cron path instead just lets a non-ok result no-op quietly.
  @Post("admin/sync")
  @UseGuards(JwtGuard, AdministratorGuard)
  async sync() {
    const result = await this.brandSyncService.syncFromMajidfilm();
    if (result.ok === false) {
      if (result.reason === "already-running")
        throw new ConflictException(this.i18n.t("brandSlides.alreadyRunning"));
      throw new ServiceUnavailableException(
        this.i18n.t("brandSlides.notConfigured"),
      );
    }
    return result;
  }
}
