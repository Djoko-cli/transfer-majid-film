import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class BrandSlidesService {
  constructor(private prisma: PrismaService) {}

  // Every currently-disabled (slug, still) pair — absence from this list is
  // the default, "enabled" state (see DisabledBrandSlide's own schema
  // comment), so this is the full exclusion set, not a full slide catalog.
  async listDisabled() {
    return this.prisma.disabledBrandSlide.findMany({
      select: { slug: true, still: true },
    });
  }

  async setDisabled(slug: string, still: number, disabled: boolean) {
    if (disabled) {
      await this.prisma.disabledBrandSlide.upsert({
        where: { slug_still: { slug, still } },
        create: { slug, still },
        update: {},
      });
    } else {
      // deleteMany, not delete: a safe no-op if the row's already absent
      // (a double-click before the first request resolved, or "enable
      // all" hitting a still that was already enabled) rather than a
      // P2025 needing its own try/catch.
      await this.prisma.disabledBrandSlide.deleteMany({
        where: { slug, still },
      });
    }

    return { slug, still, disabled };
  }
}
