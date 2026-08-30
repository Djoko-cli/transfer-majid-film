import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, User } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as argon from "argon2";
import * as crypto from "crypto";
import { Request, Response } from "express";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";
import { OAuthService } from "../oauth/oauth.service";
import { GenericOidcProvider } from "../oauth/provider/genericOidc.provider";
import { UserSevice } from "../user/user.service";
import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { LdapService } from "./ldap.service";

const TRUSTED_DEVICE_COOKIE = "trusted_device";
const TRUSTED_DEVICE_PURPOSE = "trusted-device";
const TRUSTED_DEVICE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private ldapService: LdapService,
    private userService: UserSevice,
    @Inject(forwardRef(() => OAuthService)) private oAuthService: OAuthService,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new Logger(AuthService.name);

  async isFirstUser(): Promise<boolean> {
    return (await this.prisma.user.count()) == 0;
  }

  // Doubles as both the /auth/verify/:token link's last path segment and a
  // human-typeable code — see signUp()'s comment for the entropy tradeoff
  // this implies.
  private generateActivationCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  async signUp(
    dto: AuthRegisterDTO,
    ip: string,
    isAdmin?: boolean,
    skipVerification?: boolean,
  ) {
    const isFirstUser = await this.isFirstUser();
    const enableEmailVerification = this.config.get(
      "email.enableEmailVerification",
    );
    const email = dto.email.toLowerCase().trim();

    const hash = dto.password ? await argon.hash(dto.password) : null;
    const needsVerification =
      !isFirstUser && !skipVerification && enableEmailVerification;

    // The verification token is a 6-digit code now (see
    // generateActivationCode), not a UUID — sent as both a clickable link
    // and a typeable code (EmailService.sendVerificationEmail). That's only
    // 900,000 combinations, so two pending signups can rarely land on the
    // same code and collide on the column's unique constraint; retried
    // once with a fresh code rather than surfacing a confusing "field
    // already exists" error to a brand-new signup. A second collision in a
    // row is treated as a real error instead of retried again.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              username: dto.username,
              password: hash,
              isAdmin: isAdmin ?? isFirstUser,
              isActivated: !needsVerification,
              activationToken: needsVerification
                ? this.generateActivationCode()
                : null,
              activationTokenExpiresAt: needsVerification
                ? moment().add(60, "minutes").toDate()
                : null,
            },
          });

          if (user.activationToken) {
            await this.emailService.sendVerificationEmail(
              user.email,
              user.activationToken,
            );
            return { verificationRequired: true };
          }

          const { refreshToken, refreshTokenId } =
            await this.createRefreshToken(user.id, undefined, tx);
          const accessToken = await this.createAccessToken(
            user,
            refreshTokenId,
          );

          this.logger.log(`User ${user.email} signed up from IP ${ip}`);
          return { accessToken, refreshToken, user };
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          if (duplicatedField === "activationToken" && attempt === 0) {
            continue;
          }
          throw new BadRequestException(
            this.i18n.t("auth.userAlreadyExists", {
              args: { field: duplicatedField },
            }),
          );
        }
        throw e;
      }
    }
  }

  async signIn(dto: AuthSignInDTO, ip: string, response?: Response) {
    if (!dto.email && !dto.username) {
      throw new BadRequestException(
        this.i18n.t("auth.emailOrUsernameRequired"),
      );
    }

    const tokenOptions = { response, rememberDevice: dto.rememberDevice };

    if (!this.config.get("oauth.disablePassword")) {
      const email = dto.email?.toLowerCase().trim();
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ email }, { username: dto.username }],
        },
      });

      if (user?.password && (await argon.verify(user.password, dto.password))) {
        if (!user.isActivated) {
          throw new UnauthorizedException(
            this.i18n.t("auth.accountNotActivated"),
          );
        }
        this.logger.log(
          `Successful password login for user ${user.email} from IP ${ip}`,
        );
        return this.generateToken(user, undefined, tokenOptions);
      }
    }

    if (this.config.get("ldap.enabled")) {
      /*
       * E-mail-like user credentials are passed as the email property
       * instead of the username. Since the username format does not matter
       * when searching for users in LDAP, we simply use the username
       * in whatever format it is provided.
       */
      const ldapUsername = dto.username || dto.email;
      this.logger.debug(`Trying LDAP login for user ${ldapUsername}`);
      const ldapUser = await this.ldapService.authenticateUser(
        ldapUsername,
        dto.password,
      );
      if (ldapUser) {
        const user = await this.userService.findOrCreateFromLDAP(dto, ldapUser);
        this.logger.log(
          `Successful LDAP login for user ${ldapUsername} (${user.id}) from IP ${ip}`,
        );
        return this.generateToken(user, undefined, tokenOptions);
      }
    }

    this.logger.log(
      `Failed login attempt for user ${dto.email || dto.username} from IP ${ip}`,
    );
    throw new UnauthorizedException(this.i18n.t("auth.wrongCredentials"));
  }

  async generateToken(
    user: User,
    oauth?: { idToken?: string },
    tokenOptions?: { response?: Response; rememberDevice?: boolean },
  ) {
    // TODO: Make all old loginTokens invalid when a new one is created
    // Check if the user has TOTP enabled
    if (user.totpVerified && !(oauth && this.config.get("oauth.ignoreTotp"))) {
      const loginToken = await this.createLoginToken(user.id);

      return { loginToken };
    }

    // Only reached once a *real* session is about to be issued below — a
    // TOTP loginToken above isn't a session yet, and must never mark a
    // device trusted on password alone (see AuthTotpService.signInTotp,
    // which sets this same cookie after TOTP actually succeeds).
    if (tokenOptions?.response && tokenOptions?.rememberDevice) {
      this.setTrustedDeviceCookie(tokenOptions.response, user.id);
    }

    const { refreshToken, refreshTokenId } = await this.createRefreshToken(
      user.id,
      oauth?.idToken,
    );
    const accessToken = await this.createAccessToken(user, refreshTokenId);

    return { accessToken, refreshToken };
  }

  async requestResetPassword(emailInput: string) {
    if (this.config.get("oauth.disablePassword"))
      throw new ForbiddenException(this.i18n.t("auth.passwordSignInDisabled"));

    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { resetPasswordToken: true },
    });

    if (!user) return;

    if (user.ldapDN) {
      this.logger.log(
        `Failed password reset request for user ${email} because it is an LDAP user`,
      );
      throw new BadRequestException(
        this.i18n.t("auth.ldapResetPasswordNotAllowed"),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete old reset password token
      if (user.resetPasswordToken) {
        await tx.resetPasswordToken.delete({
          where: { token: user.resetPasswordToken.token },
        });
      }

      const { token } = await tx.resetPasswordToken.create({
        data: {
          expiresAt: moment().add(1, "hour").toDate(),
          user: { connect: { id: user.id } },
        },
      });

      await this.emailService.sendResetPasswordEmail(user.email, token);
    });
  }

  async resetPassword(token: string, newPassword: string) {
    if (this.config.get("oauth.disablePassword"))
      throw new ForbiddenException(this.i18n.t("auth.passwordSignInDisabled"));

    const user = await this.prisma.user.findFirst({
      where: { resetPasswordToken: { token } },
    });

    if (!user)
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));

    const newPasswordHash = await argon.hash(newPassword);

    await this.prisma.resetPasswordToken.delete({
      where: { token },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    });
  }

  private async activateUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActivated: true,
        activationToken: null,
        activationTokenExpiresAt: null,
        activationAttempts: 0,
      },
    });
  }

  async verifyAccount(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { activationToken: token },
    });

    if (
      !user ||
      (user.activationTokenExpiresAt &&
        user.activationTokenExpiresAt < new Date())
    ) {
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
    }

    await this.activateUser(user.id);
  }

  // The code-entry counterpart to verifyAccount(token) above — same
  // underlying token (see generateActivationCode), but scoped to a known
  // email so wrong guesses are attributable to one account and rate
  // limited, unlike the link-click endpoint's global token lookup (which
  // only has the IP throttle to lean on).
  async verifyAccountByCode(emailInput: string, code: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (
      !user ||
      user.isActivated ||
      !user.activationToken ||
      (user.activationTokenExpiresAt &&
        user.activationTokenExpiresAt < new Date())
    ) {
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
    }

    if (user.activationAttempts >= 5) {
      throw new BadRequestException(this.i18n.t("verification.tooManyAttempts"));
    }

    if (user.activationToken !== code) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { activationAttempts: { increment: 1 } },
      });
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.activateUser(user.id);
  }

  async resendVerification(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) return;

    if (user.isActivated) {
      throw new BadRequestException(this.i18n.t("auth.userAlreadyActivated"));
    }

    const activationToken = this.generateActivationCode();
    const activationTokenExpiresAt = moment().add(60, "minutes").toDate();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          activationToken,
          activationTokenExpiresAt,
          // A fresh code deserves a fresh attempt budget.
          activationAttempts: 0,
        },
      });

      await this.emailService.sendVerificationEmail(
        user.email,
        activationToken,
      );
    });
  }

  async updatePassword(user: User, newPassword: string, oldPassword?: string) {
    const isPasswordValid =
      !user.password || (await argon.verify(user.password, oldPassword));

    if (!isPasswordValid)
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const hash = await argon.hash(newPassword);

    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    return this.createRefreshToken(user.id);
  }

  async createAccessToken(user: User, refreshTokenId: string) {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
        refreshTokenId,
      },
      {
        expiresIn: "15min",
        secret: this.config.get("internal.jwtSecret"),
      },
    );
  }

  async signOut(accessToken: string) {
    const { refreshTokenId } =
      (this.jwtService.decode(accessToken) as {
        refreshTokenId: string;
      }) || {};

    if (refreshTokenId) {
      const oauthIDToken = await this.prisma.refreshToken
        .findFirst({
          select: { oauthIDToken: true },
          where: { id: refreshTokenId },
        })
        .then((refreshToken) => refreshToken?.oauthIDToken)
        .catch((e) => {
          // Ignore error if refresh token doesn't exist
          if (e.code != "P2025") throw e;
        });
      await this.prisma.refreshToken
        .delete({ where: { id: refreshTokenId } })
        .catch((e) => {
          // Ignore error if refresh token doesn't exist
          if (e.code != "P2025") throw e;
        });

      if (typeof oauthIDToken === "string") {
        const [providerName, idTokenHint] = oauthIDToken.split(":");
        const provider = this.oAuthService.availableProviders()[providerName];
        let signOutFromProviderSupportedAndActivated = false;
        try {
          signOutFromProviderSupportedAndActivated = this.config.get(
            `oauth.${providerName}-signOut`,
          );
        } catch {
          // Ignore error if the provider is not supported or if the provider sign out is not activated
        }
        if (
          provider instanceof GenericOidcProvider &&
          signOutFromProviderSupportedAndActivated
        ) {
          const configuration = await provider.getConfiguration();
          if (URL.canParse(configuration.end_session_endpoint)) {
            const redirectURI = new URL(configuration.end_session_endpoint);
            redirectURI.searchParams.append(
              "post_logout_redirect_uri",
              this.config.get("general.appUrl"),
            );
            redirectURI.searchParams.append("id_token_hint", idTokenHint);
            redirectURI.searchParams.append(
              "client_id",
              this.config.get(`oauth.${providerName}-clientId`),
            );
            return redirectURI.toString();
          }
        }
      }
    }
  }

  async refreshAccessToken(refreshToken: string) {
    const refreshTokenMetaData = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!refreshTokenMetaData || refreshTokenMetaData.expiresAt < new Date())
      throw new UnauthorizedException();

    return this.createAccessToken(
      refreshTokenMetaData.user,
      refreshTokenMetaData.id,
    );
  }

  async createRefreshToken(
    userId: string,
    idToken?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const prisma = tx || this.prisma;
    const sessionDuration = this.config.get("general.sessionDuration");
    const { id, token } = await prisma.refreshToken.create({
      data: {
        userId,
        expiresAt: moment()
          .add(sessionDuration.value, sessionDuration.unit)
          .toDate(),
        oauthIDToken: idToken,
      },
    });

    return { refreshTokenId: id, refreshToken: token };
  }

  async createLoginToken(userId: string) {
    const loginToken = (
      await this.prisma.loginToken.create({
        data: { userId, expiresAt: moment().add(5, "minutes").toDate() },
      })
    ).token;

    return loginToken;
  }

  addTokensToResponse(
    response: Response,
    refreshToken?: string,
    accessToken?: string,
  ) {
    const isSecure = this.config.get("general.secureCookies");
    if (accessToken)
      response.cookie("access_token", accessToken, {
        sameSite: "lax",
        secure: isSecure,
        maxAge: 1000 * 60 * 60 * 24 * 30 * 3, // 3 months
      });
    if (refreshToken) {
      const now = moment();
      const sessionDuration = this.config.get("general.sessionDuration");
      const maxAge = moment(now)
        .add(sessionDuration.value, sessionDuration.unit)
        .diff(now);
      response.cookie("refresh_token", refreshToken, {
        path: "/api/auth/token",
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        maxAge,
      });
    }
  }

  // Set only once a real session is actually issued (see generateToken) —
  // never on a bare TOTP loginToken, which isn't a session yet. Survives a
  // normal signOut() on purpose: signOut only ever clears access_token/
  // refresh_token, never this one — recognizing a returning device is
  // meant to work again right after logging out, not just before it.
  setTrustedDeviceCookie(response: Response, userId: string) {
    const token = this.jwtService.sign(
      { sub: userId, purpose: TRUSTED_DEVICE_PURPOSE },
      { secret: this.config.get("internal.jwtSecret"), expiresIn: "30d" },
    );
    response.cookie(TRUSTED_DEVICE_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("general.secureCookies"),
      maxAge: TRUSTED_DEVICE_MAX_AGE_MS,
    });
  }

  clearTrustedDeviceCookie(response: Response) {
    response.cookie(TRUSTED_DEVICE_COOKIE, "", {
      path: "/",
      maxAge: -1,
      secure: this.config.get("general.secureCookies"),
    });
  }

  // Read-only: never mutates anything, never issues a session. Only tells
  // the sign-in page whether to offer "Welcome back {username}" instead of
  // the normal form. username only — no email, no other fields — since
  // this is the one endpoint that answers before any authentication at all.
  async getTrustedDeviceInfo(
    request: Request,
  ): Promise<{ recognized: false } | { recognized: true; username: string }> {
    const token = request.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (!token) return { recognized: false };

    try {
      const claims = await this.jwtService.verifyAsync(token, {
        secret: this.config.get("internal.jwtSecret"),
      });
      if (claims.purpose !== TRUSTED_DEVICE_PURPOSE) return { recognized: false };

      const user = await this.prisma.user.findUnique({
        where: { id: claims.sub },
        select: { username: true, isActivated: true },
      });
      if (!user?.isActivated) return { recognized: false };

      return { recognized: true, username: user.username };
    } catch {
      return { recognized: false };
    }
  }

  // The actual sign-in triggered by the "Welcome back" button — re-verifies
  // the cookie server-side (never trusts that the earlier read-only check
  // already ran) and hands off to the exact same generateToken() every
  // other sign-in path uses, so a TOTP-enabled account still hits the TOTP
  // wall even from a trusted device: a leaked cookie alone can't fully
  // bypass a deliberately-configured second factor.
  async signInTrusted(request: Request) {
    const token = request.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (!token) throw new UnauthorizedException(this.i18n.t("auth.tokenInvalidOrExpired"));

    let claims: { sub?: string; purpose?: string };
    try {
      claims = await this.jwtService.verifyAsync(token, {
        secret: this.config.get("internal.jwtSecret"),
      });
    } catch {
      throw new UnauthorizedException(this.i18n.t("auth.tokenInvalidOrExpired"));
    }
    if (claims.purpose !== TRUSTED_DEVICE_PURPOSE)
      throw new UnauthorizedException(this.i18n.t("auth.tokenInvalidOrExpired"));

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user?.isActivated)
      throw new UnauthorizedException(this.i18n.t("auth.tokenInvalidOrExpired"));

    return this.generateToken(user);
  }

  /**
   * Returns the user id if the user is logged in, null otherwise
   */
  async getIdOfCurrentUser(request: Request): Promise<string | null> {
    if (!request.cookies.access_token) return null;
    try {
      const payload = await this.jwtService.verifyAsync(
        request.cookies.access_token,
        {
          secret: this.config.get("internal.jwtSecret"),
        },
      );
      return payload.sub;
    } catch {
      return null;
    }
  }

  async verifyPassword(user: User, password: string) {
    if (!user.password && this.config.get("ldap.enabled")) {
      return !!(await this.ldapService.authenticateUser(
        user.username,
        password,
      ));
    }

    return argon.verify(user.password, password);
  }
}
