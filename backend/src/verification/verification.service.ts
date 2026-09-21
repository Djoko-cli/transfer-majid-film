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
    // Same row the email quotes back to the reader — see
    // EmailService.sendVerificationCode, which formats this very value into
    // {expires}. One setting, so the code's real lifetime and the sentence
    // describing it cannot drift apart.
    const expiry = this.config.get("verification.codeExpiration");
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await argon.hash(code);

    await this.prisma.anonymousShareVerification.create({
      data: {
        email,
        codeHash,
        expiresAt: moment().add(expiry.value, expiry.unit).toDate(),
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

    return this.issueTokenFor(email);
  }

  /**
   * Frappe le jeton d'adresse prouvée SANS passer par un code.
   *
   * À n'appeler que depuis un chemin qui a déjà prouvé l'adresse autrement.
   * Il n'en existe qu'un : le retour de Stripe, où c'est Stripe qui rapporte
   * l'adresse ayant payé, et où l'identifiant de session — que seul l'acheteur
   * reçoit, dans son URL de retour — tient lieu de preuve de possession.
   * Ailleurs, passer par verifyCode().
   */
  issueTokenFor(email: string): string {
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
    return !!this.getVerifiedEmail(request);
  }

  // Reused by ShareService.complete() to email an anonymous sender their own
  // link — see isRequestVerified above for the boolean-only check.
  getVerifiedEmail(request: Request): string | null {
    const token = request.cookies?.[ANON_SHARE_TOKEN_COOKIE];
    if (!token) return null;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
      });
      return claims.purpose === ANON_SHARE_TOKEN_PURPOSE && claims.email
        ? claims.email
        : null;
    } catch {
      return null;
    }
  }
}
