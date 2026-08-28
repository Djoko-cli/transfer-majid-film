import {
  Body,
  Controller,
  Get,
  GatewayTimeoutException,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { createKeyv } from "@keyv/redis";
import { I18nService } from "nestjs-i18n";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { EmailService } from "src/email/email.service";
import { ConfigService } from "./config.service";
import { AdminConfigDTO } from "./dto/adminConfig.dto";
import { ConfigDTO } from "./dto/config.dto";
import { TestEmailDTO } from "./dto/testEmail.dto";
import UpdateConfigDTO from "./dto/updateConfig.dto";

@Controller("configs")
export class ConfigController {
  constructor(
    private configService: ConfigService,
    private emailService: EmailService,
    private clamScanService: ClamScanService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @SkipThrottle()
  async list() {
    return new ConfigDTO().fromList(await this.configService.list());
  }

  @Get("admin/:category")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getByCategory(@Param("category") category: string) {
    return new AdminConfigDTO().fromList(
      await this.configService.getByCategory(category),
    );
  }

  @Patch("admin")
  @UseGuards(JwtGuard, AdministratorGuard)
  async updateMany(@Body() data: UpdateConfigDTO[]) {
    return new AdminConfigDTO().fromList(
      await this.configService.updateMany(data),
    );
  }

  @Post("admin/testEmail")
  @UseGuards(JwtGuard, AdministratorGuard)
  async testEmail(@Body() { email }: TestEmailDTO) {
    await this.emailService.sendTestMail(email);
  }

  @Post("admin/testRedis")
  @UseGuards(JwtGuard, AdministratorGuard)
  async testRedis() {
    const redisUrl = this.configService.get("cache.redis-url");
    const enabled = this.configService.get("cache.redis-enabled");

    if (!redisUrl) {
      throw new InternalServerErrorException(
        this.i18n.t("config.redisUrlNotSet"),
      );
    }

    const withTimeout = async <T>(
      promise: Promise<T>,
      timeoutMs: number,
    ): Promise<T> => {
      let timeout: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new GatewayTimeoutException(
                    this.i18n.t("config.redisTimedOut"),
                  ),
                ),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };

    const keyv = createKeyv(
      {
        url: redisUrl,
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: () =>
            new Error(this.i18n.t("config.redisConnectionFailed")),
        },
      } as any,
      { namespace: "transfer" },
    );
    const testKey = `connection-test:${Date.now()}`;

    try {
      await withTimeout(keyv.set(testKey, "ok", 5000), 5000);
      const value = await withTimeout(keyv.get(testKey), 5000);
      if (value !== "ok") {
        throw new Error(this.i18n.t("config.redisUnexpectedResponse"));
      }

      return { ok: true, enabled };
    } catch (e: any) {
      if (e instanceof GatewayTimeoutException) throw e;
      const message =
        typeof e?.message === "string"
          ? `${e?.name ? `${e.name}: ` : ""}${e.message}`
          : this.i18n.t("config.redisError");
      throw new InternalServerErrorException(message);
    } finally {
      const store: any = (keyv as any).store;
      try {
        await store?.client?.quit?.();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  @Get("admin/clamav/status")
  @UseGuards(JwtGuard, AdministratorGuard)
  async clamavStatus() {
    return this.clamScanService.getStatus();
  }

  @Get("admin/clamav/scans")
  @UseGuards(JwtGuard, AdministratorGuard)
  async clamavScans(
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const parsedTake = Math.min(parseInt(take) || 20, 100);
    const parsedSkip = parseInt(skip) || 0;
    return this.clamScanService.listScans(parsedTake, parsedSkip);
  }
}
