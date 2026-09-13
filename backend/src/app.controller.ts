import { Controller, Get, Logger, Res } from "@nestjs/common";
import { Response } from "express";
import { APP_VERSION, GITHUB_DEFAULT_BRANCH, GITHUB_REPO } from "./constants";
import { ConfigService } from "./config/config.service";
import { PrismaService } from "./prisma/prisma.service";

@Controller("/")
export class AppController {
  private readonly logger = new Logger(AppController.name);
  // GITHUB_REPO is private, so the /releases/latest lookup below needs a
  // token regardless — cached rather than fetched per admin page load,
  // same TTL-cache shape as the OIDC provider's own discovery/JWK cache.
  private releaseCache: {
    expires: number;
    tag: string | null;
    drift: number | null;
  } | null = null;

  constructor(
    private prismaService: PrismaService,
    private config: ConfigService,
  ) {}

  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prismaService.config.findMany();
      return "OK";
    } catch {
      res.statusCode = 500;
      return "ERROR";
    }
  }

  @Get("version")
  async version() {
    const { tag: latest, drift } = await this.getReleaseState();
    // "dev" (a local or workflow_dispatch build with no release tag) has
    // nothing meaningful to compare against, same as no token configured
    // or a failed lookup — the admin panel just doesn't render a badge
    // for any of these, rather than showing a misleading "outdated".
    const upToDate =
      !latest || APP_VERSION === "dev" ? null : APP_VERSION === latest;
    return { version: APP_VERSION, latest, upToDate, drift };
  }

  // Both halves of "where does this deployment sit" in one cached lookup:
  // which release is newest, and how far the repository has already moved
  // past it. They share a TTL because they are read together, on the same
  // admin page load, and would otherwise expire out of step and disagree.
  private async getReleaseState(): Promise<{
    tag: string | null;
    drift: number | null;
  }> {
    const token = this.config.get("general.versionCheckToken");
    if (!token) return { tag: null, drift: null };

    if (this.releaseCache && this.releaseCache.expires > Date.now()) {
      return { tag: this.releaseCache.tag, drift: this.releaseCache.drift };
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    };

    let tag: string | null = null;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers },
      );
      if (res.ok) {
        tag = ((await res.json()) as { tag_name: string }).tag_name;
      } else {
        this.logger.warn(
          `Latest-release check failed: GitHub returned ${res.status}`,
        );
      }
    } catch (e) {
      this.logger.warn(`Latest-release check failed: ${e.message}`);
    }

    // Deliberately a second call that fails on its own terms: a drift lookup
    // that 404s (the tag deleted, the branch renamed) must not cost the
    // version badge it only decorates. It degrades to null and the badge
    // falls back to the two states it always had.
    let drift: number | null = null;
    if (tag) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/compare/${tag}...${GITHUB_DEFAULT_BRANCH}`,
          { headers },
        );
        if (res.ok) {
          // ahead_by counts the head's commits absent from the base, which
          // is the question being asked. `total_commits` is the same number
          // for this comparison but stops being so the moment the branch is
          // also behind, so it is the wrong field to reach for.
          drift = ((await res.json()) as { ahead_by: number }).ahead_by;
        } else {
          this.logger.warn(`Drift check failed: GitHub returned ${res.status}`);
        }
      } catch (e) {
        this.logger.warn(`Drift check failed: ${e.message}`);
      }
    }

    this.releaseCache = { expires: Date.now() + 1000 * 60 * 10, tag, drift };
    return { tag, drift };
  }
}
