import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import {
  generateSecret,
  generateURI,
  generate,
  verify,
  createGuardrails,
} from "otplib";
import * as qrcode from "qrcode-svg";
import { I18nService } from "nestjs-i18n";
import { APP_NAME } from "src/constants";
import { PrismaService } from "src/prisma/prisma.service";
import { withUserCredentialsLock } from "src/utils/asyncLock.util";
import { AuthService, DeviceInfo } from "./auth.service";
import { AuthSignInTotpDTO } from "./dto/authSignInTotp.dto";

const legacyGuardrails = createGuardrails({
  MIN_SECRET_BYTES: 10,
});

@Injectable()
export class AuthTotpService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private readonly i18n: I18nService,
  ) {}

  async signInTotp(
    dto: AuthSignInTotpDTO,
    response?: Response,
    deviceInfo?: DeviceInfo,
  ) {
    // A tentative lookup purely to learn which user's lock to acquire —
    // re-read in full inside that lock below, exactly like
    // AuthService.signInWithPassword's own re-fetch. Without a lock here,
    // this method's own mint (createRefreshToken, and setTrustedDeviceCookie
    // when rememberDevice is set) ran completely unlocked: a password
    // change's own RefreshToken/TrustedDevice wipe could run, find nothing
    // yet to sweep, and moments later this method — redeeming a loginToken
    // that was legitimately issued *before* the change, from a password
    // check that was correct *at the time* — would still mint a session
    // the wipe was never given a chance to catch. Locked on the SAME
    // per-user key resetPassword/updatePassword/UserService.update already
    // use, so whichever side gets there first now runs to completion
    // before the other starts.
    const tentative = await this.prisma.loginToken.findFirst({
      where: { token: dto.loginToken },
    });
    if (!tentative)
      throw new UnauthorizedException(this.i18n.t("auth.invalidLoginToken"));

    return withUserCredentialsLock(tentative.userId, async () => {
      const token = await this.prisma.loginToken.findFirst({
        where: {
          token: dto.loginToken,
        },
        include: {
          user: true,
        },
      });

      // A concurrent password change, having won the lock first, deletes
      // every outstanding loginToken for this user (see resetPassword/
      // updatePassword/UserService.update) — so re-reading here, inside
      // the lock, is what makes that wipe actually able to invalidate an
      // in-flight TOTP redemption rather than just the sessions that
      // already existed before it ran.
      if (!token || token.used)
        throw new UnauthorizedException(this.i18n.t("auth.invalidLoginToken"));

      if (token.expiresAt < new Date())
        throw new UnauthorizedException(
          this.i18n.t("auth.loginTokenExpired"),
          "token_expired",
        );

      // Check the TOTP code
      const { totpSecret } = token.user;

      if (!totpSecret) {
        throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
      }

      const verified = await verify({
        token: dto.totp,
        secret: totpSecret,
        guardrails: legacyGuardrails,
      });
      if (!verified.valid) {
        throw new BadRequestException(this.i18n.t("auth.invalidCode"));
      }

      // Set the login token to used
      await this.prisma.loginToken.update({
        where: { token: token.token },
        data: { used: true },
      });

      // Only reached after TOTP actually succeeds above — unlike a plain
      // password sign-in, a device is never marked trusted on the strength
      // of a password alone for a TOTP-enabled account.
      if (dto.rememberDevice && response) {
        await this.authService.setTrustedDeviceCookie(
          response,
          token.user.id,
          deviceInfo,
        );
      }

      const { refreshToken, refreshTokenId } =
        await this.authService.createRefreshToken(token.user.id);
      const accessToken = await this.authService.createAccessToken(
        token.user,
        refreshTokenId,
      );

      return { accessToken, refreshToken };
    });
  }

  async enableTotp(user: User, password: string) {
    if (!(await this.authService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    // Check if we have a secret already
    const { totpVerified } = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpVerified: true },
    });

    if (totpVerified) {
      throw new BadRequestException(this.i18n.t("auth.totpAlreadyEnabled"));
    }

    const issuer = APP_NAME;
    const secret = generateSecret();

    const otpURL = generateURI({
      issuer: issuer,
      label: user.username || user.email,
      secret: secret,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        totpSecret: secret,
      },
    });

    // TODO: Maybe we should generate the QR code on the client rather than the server?
    const qrCode = new qrcode({
      content: otpURL,
      container: "svg-viewbox",
      join: true,
    }).svg();

    return {
      totpAuthUrl: otpURL,
      totpSecret: secret,
      qrCode:
        "data:image/svg+xml;base64," + Buffer.from(qrCode).toString("base64"),
    };
  }

  async verifyTotp(
    user: User,
    password: string,
    code: string,
    response: Response,
    request?: Request,
  ) {
    if (!(await this.authService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const { totpSecret } = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotInProgress"));
    }

    const expected = await generate({
      secret: totpSecret,
      guardrails: legacyGuardrails,
    });

    if (code !== expected) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpVerified: true,
      },
    });

    // A trusted-device cookie from before TOTP was ever enabled on this
    // account would otherwise now double as a TOTP bypass too (see
    // AuthService.signInTrusted's own comment on why a *TOTP-verified*
    // trusted-device cookie is safe to skip TOTP with) — this one was
    // never vetted by an actual TOTP challenge, so it doesn't get to
    // benefit from that trust. Clearing it here, at the exact moment TOTP
    // newly becomes required, forces this device back through a real TOTP
    // challenge once (which re-marks it trusted, same as any other device)
    // instead of silently keeping a bypass around for whatever's left of
    // its original 30 days.
    await this.authService.clearTrustedDeviceCookie(response, request);

    return true;
  }

  async disableTotp(user: User, password: string, code: string) {
    if (!(await this.authService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const { totpSecret } = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
    }

    const expected = await generate({
      secret: totpSecret,
      guardrails: legacyGuardrails,
    });

    if (code !== expected) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpVerified: false,
        totpEnabled: false,
        totpSecret: null,
      },
    });

    return true;
  }

  /**
   * Clears another account's second factor, on an administrator's authority.
   *
   * Until this existed, a lost authenticator was the end of an account:
   * `disableTotp` needs a code from the very device that was lost, there is
   * no recovery code to fall back on, and no other route touched the field.
   * The only remaining answer was editing the database by hand.
   *
   * The acting administrator's own password is required. A session cookie
   * alone must not be enough to strip a colleague's second factor — that
   * would make every stolen admin session a way through everyone else's
   * 2FA, which is a larger hole than the one being closed. Administrators
   * are already made to have a password before using the console (see
   * AdminPasswordGate), so this asks for something they have.
   *
   * It does NOT solve the last administrator losing their own authenticator:
   * there is nobody above them to ask. That case needs recovery codes,
   * which is a feature, not a guard.
   */
  async resetTotpForUser(
    admin: User,
    password: string,
    targetUserId: string,
  ) {
    if (!(await this.authService.verifyPassword(admin, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, totpSecret: true },
    });

    if (!target)
      throw new BadRequestException(this.i18n.t("auth.userNotFound"));

    if (!target.totpSecret)
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));

    await this.prisma.user.update({
      where: { id: target.id },
      data: {
        totpVerified: false,
        totpEnabled: false,
        totpSecret: null,
      },
    });

    // Any sign-in of theirs that was parked waiting for a code now refers to
    // a factor that no longer exists. Left alone these would sit until they
    // expired; dropping them means the next attempt starts clean.
    await this.prisma.loginToken.deleteMany({ where: { userId: target.id } });

    return true;
  }
}
