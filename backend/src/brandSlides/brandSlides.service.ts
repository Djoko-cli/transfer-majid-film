import { Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "fs";
import { I18nService } from "nestjs-i18n";
import { BRAND_IMAGE_DIRECTORY } from "src/constants";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class BrandSlidesService {
  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

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

  // The live catalog synced from majid.film (see BrandSyncService) —
  // empty until a sync has actually run, by design: BrandPanel.tsx falls
  // back to its own static bundled catalog in that case, and
  // pages/admin/brand.tsx shows an honest "not synced yet" state rather
  // than either page pretending this is the complete picture.
  async getCatalog() {
    const projects = await this.prisma.brandProject.findMany({
      include: { stills: { orderBy: { still: "asc" } } },
      orderBy: { slug: "asc" },
    });

    return projects.map((project) => ({
      slug: project.slug,
      title: project.title,
      year: project.year,
      stills: project.stills.map((s) => ({
        still: s.still,
        widths: JSON.parse(s.widths) as number[],
      })),
    }));
  }

  // Validates against the DB, not the filesystem, before ever opening
  // anything: every legitimate (slug, still, width) is already recorded
  // in BrandStill (a closed set, unlike NasImportService's open
  // admin-selected tree), so that lookup alone is the authoritative
  // "does this exist" answer — a forged slug/width 404s right here,
  // before any filesystem call. `format` is checked by the controller
  // against a literal enum before this is even called.
  async getImageStream(
    slug: string,
    still: number,
    width: number,
    format: "avif" | "webp",
  ) {
    const row = await this.prisma.brandStill.findUnique({
      where: { slug_still: { slug, still } },
    });
    const widths = row ? (JSON.parse(row.widths) as number[]) : [];
    if (!widths.includes(width))
      throw new NotFoundException(this.i18n.t("brandSlides.imageNotFound"));

    // Same open/error -> clean-404 pattern local.service.ts's get() uses
    // for share files, for the same reason: a symlink into a NAS mount
    // can go stale (majid.film reorganizing a folder), and that has to
    // surface before any HTTP headers are sent, not mid-stream.
    return new Promise<ReturnType<typeof createReadStream>>(
      (resolve, reject) => {
        const stream = createReadStream(
          `${BRAND_IMAGE_DIRECTORY}/${slug}-s${still}-${width}.${format}`,
        );
        stream.on("open", () => resolve(stream));
        stream.on("error", () =>
          reject(
            new NotFoundException(this.i18n.t("brandSlides.imageNotFound")),
          ),
        );
      },
    );
  }
}
