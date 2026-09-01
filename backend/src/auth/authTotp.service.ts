import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Response } from "express";
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
import { AuthService } from "./auth.service";
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

  async signInTotp(dto: AuthSignInTotpDTO, response?: Response) {
    const token = await this.prisma.loginToken.findFirst({
      where: {
        token: dto.loginToken,
      },
      include: {
        user: true,
      },
    });

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
      this.authService.setTrustedDeviceCookie(response, token.user.id);
    }

    const { refreshToken, refreshTokenId } =
      await this.authService.createRefreshToken(token.user.id);
    const accessToken = await this.authService.createAccessToken(
      token.user,
      refreshTokenId,
    );

    return { accessToken, refreshToken };
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
    this.authService.clearTrustedDeviceCookie(response);

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
}
