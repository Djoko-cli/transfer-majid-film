import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { AuthService } from "./auth.service";
import { AuthTotpService } from "./authTotp.service";
import { GetUser } from "./decorator/getUser.decorator";
import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { AuthSignInTotpDTO } from "./dto/authSignInTotp.dto";
import { EnableTotpDTO } from "./dto/enableTotp.dto";
import { VerifyAccountDTO } from "./dto/verifyAccount.dto";
import { VerifyAccountCodeDTO } from "./dto/verifyAccountCode.dto";
import { ResendVerificationDTO } from "./dto/resendVerification.dto";
import { ResetPasswordDTO } from "./dto/resetPassword.dto";
import { TokenDTO } from "./dto/token.dto";
import { UpdatePasswordDTO } from "./dto/updatePassword.dto";
import { VerifyTotpDTO } from "./dto/verifyTotp.dto";
import { JwtGuard } from "./guard/jwt.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private authTotpService: AuthTotpService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  // Public and unguarded on purpose — the frontend middleware needs this on
  // every request, before anyone is authenticated, to redirect a fresh
  // instance (no users at all yet) straight to sign-up instead of showing
  // the normal public upload page with no obvious way to become admin.
  @Get("needsSetup")
  @SkipThrottle()
  async needsSetup() {
    return { needsSetup: await this.authService.isFirstUser() };
  }

  @Post("signUp")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  async signUp(
    @Body() dto: AuthRegisterDTO,
    @Req() { ip }: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!this.config.get("share.allowRegistration"))
      throw new ForbiddenException(this.i18n.t("auth.registrationNotAllowed"));

    const result = await this.authService.signUp(dto, ip);

    this.authService.addTokensToResponse(
      response,
      result.refreshToken,
      result.accessToken,
    );

    return result;
  }

  @Post("signIn")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(200)
  async signIn(
    @Body() dto: AuthSignInDTO,
    @Req() { ip }: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signIn(dto, ip, response);

    if (result.accessToken && result.refreshToken) {
      this.authService.addTokensToResponse(
        response,
        result.refreshToken,
        result.accessToken,
      );
    }

    return result;
  }

  // Public and unguarded — the sign-in page needs to know, before any
  // authentication at all, whether to offer "Welcome back {username}"
  // instead of the normal email/password form. Read-only: never mutates
  // anything, never issues a session (see signInTrusted below for that).
  @Get("trustedDevice")
  @SkipThrottle()
  async getTrustedDevice(@Req() request: Request) {
    return this.authService.getTrustedDeviceInfo(request);
  }

  // The actual sign-in behind the "Welcome back" button's single click —
  // deliberately never triggered on page load, only by that explicit
  // action, since a trusted device should offer a one-click return, not a
  // silent auto-login a family member could be surprised by.
  @Post("signIn/trusted")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(200)
  async signInTrusted(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signInTrusted(request);

    if (result.accessToken && result.refreshToken) {
      this.authService.addTokensToResponse(
        response,
        result.refreshToken,
        result.accessToken,
      );
    }

    return result;
  }

  // "Ce n'est pas vous ?" — clears the cookie server-side immediately so a
  // fresh page load on this device no longer recognizes the previous user,
  // rather than only flipping local UI state.
  @Post("trustedDevice/forget")
  @HttpCode(204)
  async forgetTrustedDevice(@Res({ passthrough: true }) response: Response) {
    this.authService.clearTrustedDeviceCookie(response);
  }

  @Post("signIn/totp")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(200)
  async signInTotp(
    @Body() dto: AuthSignInTotpDTO,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authTotpService.signInTotp(dto, response);

    this.authService.addTokensToResponse(
      response,
      result.refreshToken,
      result.accessToken,
    );

    return new TokenDTO().from(result);
  }

  @Post("resetPassword/:email")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(202)
  async requestResetPassword(@Param("email") email: string) {
    await this.authService.requestResetPassword(email);
  }

  @Post("resetPassword")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDTO) {
    return await this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("verify")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async verifyAccount(@Body() dto: VerifyAccountDTO) {
    await this.authService.verifyAccount(dto.token);
  }

  // The same underlying code, entered by hand instead of clicked as a link
  // — see AuthService.verifyAccountByCode for why this is scoped to an
  // email (attempt-limited) rather than a bare token lookup like above.
  @Post("verify/code")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async verifyAccountByCode(@Body() dto: VerifyAccountCodeDTO) {
    await this.authService.verifyAccountByCode(dto.email, dto.code);
  }

  @Post("verify/resend")
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async resendVerification(@Body() dto: ResendVerificationDTO) {
    await this.authService.resendVerification(dto.email);
  }

  @Patch("password")
  @UseGuards(JwtGuard)
  async updatePassword(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: UpdatePasswordDTO,
  ) {
    const result = await this.authService.updatePassword(
      user,
      dto.password,
      dto.oldPassword,
    );

    this.authService.addTokensToResponse(response, result.refreshToken);
    return new TokenDTO().from(result);
  }

  @Post("token")
  @HttpCode(200)
  async refreshAccessToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.cookies.refresh_token) throw new UnauthorizedException();

    const accessToken = await this.authService.refreshAccessToken(
      request.cookies.refresh_token,
    );
    this.authService.addTokensToResponse(response, undefined, accessToken);
    return new TokenDTO().from({ accessToken });
  }

  @Post("signOut")
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const redirectURI = await this.authService.signOut(
      request.cookies.access_token,
    );

    const isSecure = this.config.get("general.secureCookies");
    response.cookie("access_token", "", {
      maxAge: -1,
      secure: isSecure,
    });
    response.cookie("refresh_token", "", {
      path: "/api/auth/token",
      httpOnly: true,
      maxAge: -1,
      secure: isSecure,
    });

    if (typeof redirectURI === "string") {
      return { redirectURI: redirectURI.toString() };
    }
  }

  @Post("totp/enable")
  @UseGuards(JwtGuard)
  async enableTotp(@GetUser() user: User, @Body() body: EnableTotpDTO) {
    return this.authTotpService.enableTotp(user, body.password);
  }

  @Post("totp/verify")
  @UseGuards(JwtGuard)
  async verifyTotp(
    @GetUser() user: User,
    @Body() body: VerifyTotpDTO,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authTotpService.verifyTotp(
      user,
      body.password,
      body.code,
      response,
    );
  }

  @Post("totp/disable")
  @UseGuards(JwtGuard)
  async disableTotp(@GetUser() user: User, @Body() body: VerifyTotpDTO) {
    // Note: We use VerifyTotpDTO here because it has both fields we need: password and totp code
    return this.authTotpService.disableTotp(user, body.password, body.code);
  }
}
