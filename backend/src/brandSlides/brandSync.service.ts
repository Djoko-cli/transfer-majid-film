import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { BRAND_IMAGE_DIRECTORY, MAJIDFILM_SOURCE_ROOT } from "src/constants";

// Matches majid.film's own build/make-images.py output exactly —
// s<still>-<width>.avif|webp, nothing else. Anchored specifically so it
// does NOT match a stale duplicate left by an interrupted image
// regeneration (e.g. "s1-1280 2.avif") — confirmed these exist for real on
// majid.film's own dbba/standup folders as of August 2026.
const DERIVED_FILE_PATTERN = /^s(\d+)-(\d+)\.(avif|webp)$/;

type ManifestEntry = { slug?: unknown; title?: unknown; year?: unknown };

// still -> sorted widths that have both an avif and a webp derivative.
type StillWidths = Record<number, number[]>;

export type BrandSyncResult =
  | { ok: false; reason: "not-configured" | "already-running" }
  | {
      ok: true;
      newProjects: number;
      updatedProjects: number;
      newStills: number;
      warnings: string[];
    };

// Reads majid.film's deployed output (brand-manifest.json +
// assets/img/derived/, mounted read-only at MAJIDFILM_SOURCE_ROOT — see
// constants.ts) and keeps BrandProject/BrandStill in sync with it. Split
// out from BrandSlidesService (the existing, much simpler disabled-flag
// CRUD) the same way FileModule splits FileService from
// LocalFileService/S3FileService — this is a different order of
// complexity and deserves its own file.
//
// Deliberately mirrors NasImportService's own conventions throughout
// (symlink-don't-copy, sequential-not-transactional writes, never-delete)
// since it's solving a structurally similar problem: bringing files from
// an admin-mounted read-only tree into this app without duplicating them.
@Injectable()
export class BrandSyncService implements OnModuleInit {
  private readonly logger = new Logger(BrandSyncService.name);
  // Plain in-memory flag, checked and set synchronously before the first
  // await in syncFromMajidfilm() below — race-safe on Node's
  // single-threaded event loop with no lock needed, since nothing can
  // interleave between the check and the set. Good enough for a
  // single-container app; a concurrent cron tick and manual "Sync now"
  // click just means one of them gets told to try again shortly.
  private running = false;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private isEnabled(): boolean {
    return !!MAJIDFILM_SOURCE_ROOT && this.config.get("brand.enableSync");
  }

  // Self-heals the "public page has nothing synced yet" window down to
  // however long boot takes, rather than leaving it to the first nightly
  // cron (up to 24h) — see BrandPanel.tsx's own static-fallback comment
  // for why that window matters. Awaited (not fire-and-forget): a few
  // seconds added to a rare event (container restart) is a good trade for
  // the app never being ready with an empty catalog when sync could have
  // already filled it. Never lets a sync failure fail app boot itself —
  // a NAS blip at the exact moment of startup shouldn't crash the app.
  async onModuleInit() {
    if (!this.isEnabled()) return;
    try {
      const count = await this.prisma.brandProject.count();
      if (count === 0) {
        this.logger.log(
          "No BrandProject rows yet — running an initial sync at boot",
        );
        await this.syncFromMajidfilm();
      }
    } catch (e) {
      this.logger.error(`Initial brand sync at boot failed: ${e.message || e}`);
    }
  }

  async syncFromMajidfilm(): Promise<BrandSyncResult> {
    if (!this.isEnabled()) return { ok: false, reason: "not-configured" };
    if (this.running) return { ok: false, reason: "already-running" };
    this.running = true;

    try {
      return await this.runSync();
    } finally {
      this.running = false;
    }
  }

  private async runSync(): Promise<BrandSyncResult> {
    const root = MAJIDFILM_SOURCE_ROOT as string;
    const warnings: string[] = [];
    let newProjects = 0;
    let updatedProjects = 0;
    let newStills = 0;

    let manifest: ManifestEntry[];
    try {
      const raw = await fs.readFile(
        path.join(root, "brand-manifest.json"),
        "utf8",
      );
      manifest = JSON.parse(raw);
    } catch (e) {
      this.logger.warn(
        `Could not read brand-manifest.json from ${root}: ${e.message || e}`,
      );
      return {
        ok: true,
        newProjects: 0,
        updatedProjects: 0,
        newStills: 0,
        warnings: [`brand-manifest.json unreadable: ${e.message || e}`],
      };
    }

    for (const entry of manifest) {
      const slug = typeof entry.slug === "string" ? entry.slug : undefined;
      const title = typeof entry.title === "string" ? entry.title : undefined;
      const year = typeof entry.year === "string" ? entry.year : undefined;
      if (!slug || !title || !year) {
        warnings.push(
          `Skipped a manifest entry missing slug/title/year: ${JSON.stringify(entry)}`,
        );
        continue;
      }

      const stillWidths = await this.discoverStills(root, slug, warnings);
      const stillNumbers = Object.keys(stillWidths).map(Number);
      if (stillNumbers.length === 0) {
        // Never create a project with nothing to show — a confusing 0/0
        // entry in the admin list. Only affects brand-new projects: an
        // existing one that transiently loses every still on one run
        // still isn't touched (see the never-delete note below).
        warnings.push(
          `${slug}: no valid derived stills found, skipping for now`,
        );
        continue;
      }

      const existing = await this.prisma.brandProject.findUnique({
        where: { slug },
        include: { stills: true },
      });

      if (!existing) {
        await this.prisma.brandProject.create({
          data: {
            slug,
            title,
            year,
            stills: {
              create: stillNumbers.map((still) => ({
                still,
                widths: JSON.stringify(stillWidths[still]),
              })),
            },
          },
        });
        newProjects++;
        newStills += stillNumbers.length;
      } else {
        // Compare before writing — @updatedAt bumps on every .update()
        // regardless of whether anything actually changed, which would
        // otherwise touch all 21+ rows nightly even on a quiet night and
        // defeat its use as a real change signal.
        if (existing.title !== title || existing.year !== year) {
          await this.prisma.brandProject.update({
            where: { slug },
            data: { title, year },
          });
          updatedProjects++;
        }

        const existingWidthsByStill: Record<number, string> = {};
        for (const s of existing.stills)
          existingWidthsByStill[s.still] = s.widths;

        for (const still of stillNumbers) {
          const widthsJson = JSON.stringify(stillWidths[still]);
          if (existingWidthsByStill[still] === undefined) {
            await this.prisma.brandStill.create({
              data: { slug, still, widths: widthsJson },
            });
            newStills++;
          } else if (existingWidthsByStill[still] !== widthsJson) {
            await this.prisma.brandStill.update({
              where: { slug_still: { slug, still } },
              data: { widths: widthsJson },
            });
          }
          // A still present in existingWidthsByStill but no longer in
          // stillNumbers is never deleted — see the module-level comment
          // on this service and DisabledBrandSlide's own precedent.
        }
      }

      await this.symlinkStills(root, slug, stillWidths);
    }

    if (warnings.length || newProjects || updatedProjects || newStills) {
      this.logger.log(
        `Brand sync: ${newProjects} new project(s), ${updatedProjects} updated, ` +
          `${newStills} new still(s)` +
          (warnings.length ? `, ${warnings.length} warning(s)` : ""),
      );
      for (const w of warnings) this.logger.warn(w);
    }

    return { ok: true, newProjects, updatedProjects, newStills, warnings };
  }

  // Reads the ALREADY-GENERATED derivatives directly — never the JPEG
  // masters, never recomputed — same "read the derived folder instead of
  // recalculating" principle majid.film's own build.py already applies to
  // itself (see srcset() there). A still with a JPEG but no generated
  // derivative yet isn't ready to serve on either site.
  private async discoverStills(
    root: string,
    slug: string,
    warnings: string[],
  ): Promise<StillWidths> {
    const dir = path.join(root, "assets", "img", "derived", slug);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      warnings.push(`${slug}: no assets/img/derived/${slug}/ folder`);
      return {};
    }

    const formatsByStillWidth: Record<number, Record<number, Set<string>>> = {};
    for (const name of entries) {
      const m = name.match(DERIVED_FILE_PATTERN);
      if (!m) continue; // also excludes stale "s1-1280 2.avif"-style strays
      const still = Number(m[1]);
      const width = Number(m[2]);
      const format = m[3];
      formatsByStillWidth[still] ??= {};
      formatsByStillWidth[still][width] ??= new Set();
      formatsByStillWidth[still][width].add(format);
    }

    const result: StillWidths = {};
    for (const [stillStr, widthMap] of Object.entries(formatsByStillWidth)) {
      const still = Number(stillStr);
      const complete: number[] = [];
      const incomplete: number[] = [];
      for (const [widthStr, formats] of Object.entries(widthMap)) {
        const width = Number(widthStr);
        if (formats.has("avif") && formats.has("webp")) complete.push(width);
        else incomplete.push(width);
      }
      if (incomplete.length) {
        warnings.push(
          `${slug} s${still}: width(s) missing an avif/webp pair: ${incomplete.sort((a, b) => a - b).join(", ")}`,
        );
      }
      if (complete.length) result[still] = complete.sort((a, b) => a - b);
    }
    return result;
  }

  // Symlinks, never copies — the real bytes stay on the read-only NAS
  // mount, exactly like NasImportService.importBatch()'s own
  // fs.symlink(target, linkPath) call. Re-attempted for every still on
  // every run (not just new ones): cheap, and self-healing if a link was
  // ever removed out from under this directory some other way.
  private async symlinkStills(
    root: string,
    slug: string,
    stillWidths: StillWidths,
  ) {
    await fs.mkdir(BRAND_IMAGE_DIRECTORY, { recursive: true });

    for (const [stillStr, widths] of Object.entries(stillWidths)) {
      const still = Number(stillStr);
      for (const width of widths) {
        for (const format of ["avif", "webp"] as const) {
          const linkPath = `${BRAND_IMAGE_DIRECTORY}/${slug}-s${still}-${width}.${format}`;
          const targetPath = path.join(
            root,
            "assets",
            "img",
            "derived",
            slug,
            `s${still}-${width}.${format}`,
          );
          try {
            await fs.symlink(targetPath, linkPath);
          } catch (e: any) {
            if (e.code !== "EEXIST") throw e;
          }
        }
      }
    }
  }
}
