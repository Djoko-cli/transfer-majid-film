import { Module } from "@nestjs/common";
import { BrandSlidesController } from "./brandSlides.controller";
import { BrandSlidesService } from "./brandSlides.service";
import { BrandSyncService } from "./brandSync.service";

@Module({
  controllers: [BrandSlidesController],
  providers: [BrandSlidesService, BrandSyncService],
  // JobsModule injects BrandSyncService to call it from its own nightly
  // @Cron wrapper — see jobs.service.ts.
  exports: [BrandSyncService],
})
export class BrandSlidesModule {}
