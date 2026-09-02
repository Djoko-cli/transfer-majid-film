import { Controller, Get, Logger, Res } from "@nestjs/common";
import { Response } from "express";
import { APP_VERSION, GITHUB_REPO } from "./constants";
import { ConfigService } from "./config/config.service";
import { PrismaService } from "./prisma/prisma.service";

@Controller("/")
export class AppController {
  private readonly logger = new Logger(AppController.name);
  // GITHUB_REPO is private, so the /releases/latest lookup below needs a
  // token regardless — cached rather than fetched per admin page load,
  // same TTL-cache shape as the OIDC provider's own discovery/JWK cache.
  private latestReleaseCache: { expires: number; tag: string | null } | null =
    null;

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
    const latest = await this.getLatestRelease();
    // "dev" (a local or workflow_dispatch build with no release tag) has
    // nothing meaningful to compare against, same as no token configured
    // or a failed lookup — the admin panel just doesn't render a badge
    // for any of these, rather than showing a misleading "outdated".
    const upToDate =
      !latest || APP_VERSION === "dev" ? null : APP_VERSION === latest;
    return { version: APP_VERSION, latest, upToDate };
  }

  private async getLatestRelease(): Promise<string | null> {
    const token = this.config.get("general.versionCheckToken");
    if (!token) return null;

    if (this.latestReleaseCache && this.latestReleaseCache.expires > Date.now()) {
      return this.latestReleaseCache.tag;
    }

    let tag: string | null = null;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        },
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

    this.latestReleaseCache = { expires: Date.now() + 1000 * 60 * 10, tag };
    return tag;
  }
}
