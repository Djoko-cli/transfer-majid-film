import { Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "fs";
import { access } from "fs/promises";
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

  // How long a reachability verdict is trusted before being re-probed. The
  // catalog is fetched on every load of the home and sign-in pages, so
  // without this a busy minute would stat the mount hundreds of times.
  private static readonly REACHABILITY_TTL_MS = 10_000;
  // A mount can be present but unresponsive, in which case a stat does not
  // fail — it hangs. Racing it means the visitor still gets an answer; the
  // pending call is bounded by the small sample below.
  private static readonly REACHABILITY_TIMEOUT_MS = 1_000;
  // Spread across the catalog rather than all taken from one project, so a
  // single project's folder going missing cannot look like the whole store
  // being gone.
  private static readonly REACHABILITY_SAMPLES = 3;

  private reachability: { checkedAt: number; reachable: boolean } | null = null;

  // Answers "can this instance actually serve a synced image right now",
  // which is NOT the same question as "is there a catalog" — and conflating
  // the two is what this method exists to stop.
  //
  // The two live in different places and fail independently: the catalog is
  // rows in SQLite, while the images are symlinks in BRAND_IMAGE_DIRECTORY
  // pointing into the majid.film mount (see brandSync.service.ts, which
  // symlinks rather than copies). Lose the mount and the rows are still
  // perfectly intact while every last link dangles — observed here as 3240
  // dead links against a catalog still cheerfully advertising 21 projects
  // and 408 stills. BrandPanel's own fallback is gated on the catalog being
  // EMPTY, so in that state it never engaged and the whole photographic
  // surface of the app went black, with 838 perfectly good bundled fallback
  // images sitting unused. Returning an empty catalog here is what makes
  // that fallback mean what its comment already claims it means.
  //
  // Deliberately requires EVERY sample to fail. One project whose folder
  // moved is partial rot, not an outage, and blanking the live catalog over
  // it would be a worse answer than showing the rest.
  private async imagesReachable(
    projects: { slug: string; stills: { still: number; widths: string }[] }[],
  ): Promise<boolean> {
    const now = Date.now();
    if (
      this.reachability &&
      now - this.reachability.checkedAt < BrandSlidesService.REACHABILITY_TTL_MS
    )
      return this.reachability.reachable;

    const withStills = projects.filter((p) => p.stills.length > 0);
    if (withStills.length === 0) return false;

    const picks = [
      withStills[0],
      withStills[Math.floor(withStills.length / 2)],
      withStills[withStills.length - 1],
    ].slice(0, BrandSlidesService.REACHABILITY_SAMPLES);

    const probes = picks.map(async (project) => {
      const still = project.stills[0];
      const widths = JSON.parse(still.widths) as number[];
      if (!widths.length) return false;
      // webp alone is enough: a width only ever reaches BrandStill when the
      // sync found BOTH an avif and a webp for it.
      const file = `${BRAND_IMAGE_DIRECTORY}/${project.slug}-s${still.still}-${widths[0]}.webp`;
      return Promise.race([
        access(file).then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) =>
          setTimeout(
            () => resolve(false),
            BrandSlidesService.REACHABILITY_TIMEOUT_MS,
          ).unref(),
        ),
      ]);
    });

    const reachable = (await Promise.all(probes)).some(Boolean);
    this.reachability = { checkedAt: now, reachable };
    return reachable;
  }

  // The live catalog synced from majid.film (see BrandSyncService) —
  // empty until a sync has actually run, by design: BrandPanel.tsx falls
  // back to its own static bundled catalog in that case, and
  // pages/admin/brand.tsx shows an honest "not synced yet" state rather
  // than either page pretending this is the complete picture.
  //
  // Also empty when the images cannot be reached at all, for exactly the
  // same reason — see imagesReachable above. "Synced once" and "servable
  // now" are different facts, and only the second one is worth advertising.
  async getCatalog() {
    const projects = await this.prisma.brandProject.findMany({
      include: { stills: { orderBy: { still: "asc" } } },
      orderBy: { slug: "asc" },
    });

    if (projects.length > 0 && !(await this.imagesReachable(projects)))
      return [];

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
