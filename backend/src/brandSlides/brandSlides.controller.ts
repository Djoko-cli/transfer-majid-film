import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { BrandSlidesService } from "./brandSlides.service";
import { UpdateBrandSlideDTO } from "./dto/updateBrandSlide.dto";

@Controller("brand-slides")
export class BrandSlidesController {
  constructor(private brandSlidesService: BrandSlidesService) {}

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

  @Patch("admin/:slug/:still")
  @UseGuards(JwtGuard, AdministratorGuard)
  async setDisabled(
    @Param("slug") slug: string,
    @Param("still", ParseIntPipe) still: number,
    @Body() { disabled }: UpdateBrandSlideDTO,
  ) {
    return this.brandSlidesService.setDisabled(slug, still, disabled);
  }
}
