import { Module } from "@nestjs/common";
import { BrandSlidesController } from "./brandSlides.controller";
import { BrandSlidesService } from "./brandSlides.service";

@Module({
  controllers: [BrandSlidesController],
  providers: [BrandSlidesService],
})
export class BrandSlidesModule {}
