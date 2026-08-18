import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon from "argon2";
import * as crypto from "crypto";
import { Request } from "express";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";

const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const ANON_SHARE_TOKEN_COOKIE = "anon_share_token";
const ANON_SHARE_TOKEN_PURPOSE = "anonymous-share";

@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
    private jwtService: JwtService,
    private readonly i18n: I18nService,
  ) {}

  async requestCode(email: string) {
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await argon.hash(code);

    await this.prisma.anonymousShareVerification.create({
      data: {
        email,
        codeHash,
        expiresAt: moment().add(CODE_EXPIRY_MINUTES, "minutes").toDate(),
      },
    });

    await this.emailService.sendVerificationCode(email, code);
  }

  async verifyCode(email: string, code: string): Promise<string> {
    const verification = await this.prisma.anonymousShareVerification.findFirst(
      {
        where: { email, consumed: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      },
    );

    if (!verification)
      throw new BadRequestException(
        this.i18n.t("verification.codeInvalidOrExpired"),
      );

    if (verification.attempts >= MAX_ATTEMPTS)
      throw new BadRequestException(
        this.i18n.t("verification.tooManyAttempts"),
      );

    const isValid = await argon.verify(verification.codeHash, code);

    if (!isValid) {
      await this.prisma.anonymousShareVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.anonymousShareVerification.update({
      where: { id: verification.id },
      data: { consumed: true },
    });

    return this.jwtService.sign(
      { email, purpose: ANON_SHARE_TOKEN_PURPOSE },
      { secret: this.config.get("internal.jwtSecret"), expiresIn: "4h" },
    );
  }

  setVerificationCookie(response, token: string) {
    response.cookie(ANON_SHARE_TOKEN_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }

  isRequestVerified(request: Request): boolean {
    const token = request.cookies?.[ANON_SHARE_TOKEN_COOKIE];
    if (!token) return false;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
      });
      return claims.purpose === ANON_SHARE_TOKEN_PURPOSE && !!claims.email;
    } catch {
      return false;
    }
  }
}
