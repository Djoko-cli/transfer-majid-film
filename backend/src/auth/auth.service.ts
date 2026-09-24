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
import { withUserCredentialsLock } from "src/utils/asyncLock.util";
import { OAuthService } from "../oauth/oauth.service";
import { GenericOidcProvider } from "../oauth/provider/genericOidc.provider";
import { UserSevice } from "../user/user.service";
import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { LdapService } from "./ldap.service";

const TRUSTED_DEVICE_COOKIE = "trusted_device";
const TRUSTED_DEVICE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Best-effort labels for a device list a human has to read, not an
// auth decision — never falls back to blocking or throwing.
export type DeviceInfo = { ipAddress?: string; userAgent?: string };

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
        // Captured via closure rather than put on the transaction's own
        // return value — that return value is exactly what the controller
        // sends back as the HTTP response body (see AuthController.signUp),
        // and the full Prisma User row carries the password hash. This
        // stays out of band, read only by the notification below.
        let createdUser: User | undefined;

        const result = await this.prisma.$transaction(async (tx) => {
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
          createdUser = user;

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

        // Fire-and-forget, after the transaction above has already
        // committed rather than inside it — this app's DATABASE_URL caps
        // the pool at connection_limit=1, so holding that transaction
        // open for an SMTP round-trip would block every other request
        // (login, downloads, share creation) for however long that takes.
        // Not awaited and always caught rather than left to throw: this is
        // a best-effort admin notification, and a failure in it (SMTP off,
        // misconfigured, momentarily down) must never turn what was
        // otherwise a successful signup into an error response for the
        // person who just signed up.
        if (
          this.config.get("email.enableNewAccountNotifications") &&
          createdUser
        ) {
          this.emailService
            .sendNewAccountNotification(createdUser.username, createdUser.email)
            .catch((e) => this.logger.error(e));
        }

        return result;
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

  async signIn(
    dto: AuthSignInDTO,
    ip: string,
    response?: Response,
    userAgent?: string,
  ) {
    if (!dto.email && !dto.username) {
      throw new BadRequestException(
        this.i18n.t("auth.emailOrUsernameRequired"),
      );
    }

    const tokenOptions = {
      response,
      rememberDevice: dto.rememberDevice,
      deviceInfo: { ipAddress: ip, userAgent },
    };

    if (!this.config.get("oauth.disablePassword")) {
      const email = dto.email?.toLowerCase().trim();
      const userLookup = await this.prisma.user.findFirst({
        where: {
          OR: [{ email }, { username: dto.username }],
        },
      });

      // A cheap, unlocked check first: does THIS supplied password even
      // look right against the copy already in hand? A wrong guess (or
      // an OAuth-only/LDAP-only account with no local password at all)
      // fails here and never touches the lock below at all — the same
      // cost a wrong-password attempt always had, no new contention.
      // Without this, every attempt against an existing user's email —
      // right password or not — queued behind the SAME per-user lock
      // updatePassword/resetPassword/UserService.update now use, so an
      // unauthenticated caller who merely knew or guessed a victim's
      // email could fire a burst of wrong-password sign-ins and delay
      // that victim's own concurrent password change or an admin's
      // reset, each guess paying a full argon2 verify strictly before
      // the next queued operation for that user could even start. This
      // check can never authorize anything by itself — a password that
      // looks right here but is stale by the time the lock is actually
      // acquired is re-verified for real, against a fresh row, inside
      // signInWithPassword below, same as if this check didn't exist.
      const passwordLooksRight =
        userLookup?.password &&
        (await argon.verify(userLookup.password, dto.password));

      if (passwordLooksRight) {
        // Everything from the real (re-fetched) password check through
        // minting the session/trusted-device row runs inside one lock,
        // keyed to this user, shared with resetPassword/updatePassword/
        // UserService.update's own hash-commit-then-revoke sequences —
        // see asyncLock.util.ts. Reordering those methods' own deletes to
        // run after their password commit (done 2026-09-06/07) sounded
        // sufficient but isn't: argon2's hash/verify cost is comparable
        // both sides, so a sign-in that reads the row and starts
        // verifying a moment before a password change commits can still
        // finish its own verify (correctly, against what was still the
        // live password at that instant) and mint a brand-new session
        // AFTER the change's delete has already run and found nothing
        // yet to sweep — a session born valid that a password change
        // happening at effectively the same moment was never able to
        // catch. A lock spanning verify-through-mint on this side, and
        // commit-through-delete on the other, means whichever request
        // actually got there first completes in full before the other
        // even starts — including re-reading the password from inside
        // the lock rather than trusting `userLookup` from before it, so
        // a change that landed first is never checked against a value
        // captured before it existed.
        const signedIn = await withUserCredentialsLock(userLookup.id, () =>
          this.signInWithPassword(
            userLookup.id,
            dto.password,
            ip,
            tokenOptions,
          ),
        );
        if (signedIn) return signedIn;
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

  // Only ever called from inside signIn's withUserCredentialsLock above —
  // re-fetches the user itself rather than trusting a copy read before
  // the lock was acquired, which is the entire point of doing this under
  // lock at all (see that call site's comment). Returns null on a wrong
  // password so signIn can fall through to LDAP, exactly like the
  // inline check this replaced.
  private async signInWithPassword(
    userId: string,
    password: string,
    ip: string,
    tokenOptions: Parameters<AuthService["generateToken"]>[2],
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.password || !(await argon.verify(user.password, password))) {
      return null;
    }

    if (!user.isActivated) {
      throw new UnauthorizedException(this.i18n.t("auth.accountNotActivated"));
    }
    this.logger.log(
      `Successful password login for user ${user.email} from IP ${ip}`,
    );
    return this.generateToken(user, undefined, tokenOptions);
  }

  async generateToken(
    user: User,
    oauth?: { idToken?: string },
    tokenOptions?: {
      response?: Response;
      rememberDevice?: boolean;
      // Best-effort labels stored on the new TrustedDevice row (see
      // setTrustedDeviceCookie), purely so a human looking at the account
      // page or the admin console later has something to recognize —
      // never part of any auth decision.
      deviceInfo?: DeviceInfo;
      // Only ever set by signInTrusted() below, and only once it has
      // already verified — server-side, this call — that the trusted-
      // device cookie names a real, unexpired TrustedDevice row for this
      // exact user. That row is itself only ever created after a real
      // TOTP challenge already succeeded once on this device (see
      // AuthTotpService.signInTotp and setTrustedDeviceCookie's own
      // comments) — this is what lets a returning trusted device skip
      // TOTP again for up to 30 days, the same "remember this device"
      // pattern most 2FA implementations offer, rather than only ever
      // skipping the password field the way this originally shipped.
      skipTotp?: boolean;
    },
  ) {
    // TODO: Make all old loginTokens invalid when a new one is created
    // Check if the user has TOTP enabled
    if (
      user.totpVerified &&
      !(oauth && this.config.get("oauth.ignoreTotp")) &&
      !tokenOptions?.skipTotp
    ) {
      const loginToken = await this.createLoginToken(user.id);

      return { loginToken };
    }

    // Only reached once a *real* session is about to be issued below — a
    // TOTP loginToken above isn't a session yet, and must never mark a
    // device trusted on password alone (see AuthTotpService.signInTotp,
    // which sets this same cookie after TOTP actually succeeds).
    if (tokenOptions?.response && tokenOptions?.rememberDevice) {
      await this.setTrustedDeviceCookie(
        tokenOptions.response,
        user.id,
        tokenOptions.deviceInfo,
      );
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

    // The expiry was written (an hour, see requestResetPassword) and never
    // read: a token stayed good until the next request replaced it.
    const user = await this.prisma.user.findFirst({
      where: { resetPasswordToken: { token, expiresAt: { gt: new Date() } } },
    });

    if (!user)
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));

    const newPasswordHash = await argon.hash(newPassword);

    await this.prisma.resetPasswordToken.delete({
      where: { token },
    });

    // A "forgot password" reset is the one flow anyone can trigger with
    // just access to the account's inbox, no prior credential at all — if
    // that's happening because the account was actually compromised, an
    // existing session on some other device (a stolen laptop, a synced
    // browser profile) and a trusted device from before are exactly the
    // kind of standing access this reset is meant to shut off. This
    // token can prove the requester controls the account's email, but it
    // said nothing about which sessions or devices should still be
    // trusted afterward, and nothing here ever asked.
    //
    // The whole commit-then-wipe sequence runs inside one lock, shared
    // with signIn's own password-verification branch (see
    // withUserCredentialsLock's call there for the full reasoning) —
    // reordering the deletes to run after the password commit (done
    // 2026-09-06) sounded sufficient on its own but wasn't: argon2's
    // verify cost on the sign-in side is comparable to hash here, so a
    // sign-in already mid-verify against the still-live old password
    // could still finish and mint a session after these deletes had
    // already run and found nothing to sweep. The lock means whichever
    // request actually got here first runs to completion — commit and
    // both deletes, or verify and mint — before the other starts at all.
    await withUserCredentialsLock(user.id, async () => {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: newPasswordHash },
      });
      await this.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      });
      await this.prisma.trustedDevice.deleteMany({
        where: { userId: user.id },
      });
      // Also closes off any TOTP sign-in still mid-flight: a loginToken
      // proves a password check that was correct *before* this change,
      // not that it still is — see AuthTotpService.signInTotp's own lock
      // and re-read of this same row for why deleting it here (rather
      // than leaving it to expire on its own, up to 5 minutes later) is
      // what actually lets that re-read observe the change.
      await this.prisma.loginToken.deleteMany({
        where: { userId: user.id },
      });
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
      throw new BadRequestException(
        this.i18n.t("verification.tooManyAttempts"),
      );
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
    // Same reasoning as resetPassword's own lock — a self-service
    // password change is meant to force every other signed-in session to
    // re-authenticate, and cut off any trusted device skipping password
    // AND TOTP both, without a concurrent sign-in slipping a fresh
    // session past the wipe (see withUserCredentialsLock's call in
    // signIn for the full race description). createRefreshToken for
    // *this* request's own new session sits inside the same lock too —
    // harmless (it's this request's own commit, not a race), and keeps
    // the whole commit-wipe-reissue sequence atomic in one place.
    //
    // The oldPassword check itself also moved inside the lock, re-fetching
    // the user instead of trusting the `user` argument the controller
    // passes in — that argument comes from @GetUser(), read by
    // JwtStrategy at the very start of THIS request, before this method
    // even runs. Checking it outside the lock meant a second, slower
    // request for the same account (another tab, a phished old password
    // being replayed) could still be mid-verify against that stale copy
    // while a first, legitimate change already committed a new password
    // and released the lock — that slow request's own verify would then
    // resolve true against the password that USED to be current, let it
    // acquire the now-free lock, and unconditionally overwrite the
    // just-committed new password with its own, undoing a real password
    // change with nothing but a superseded credential. Re-fetching and
    // re-verifying inside the lock closes this the same way
    // signInWithPassword does for signIn.
    return withUserCredentialsLock(user.id, async () => {
      const current = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      const isPasswordValid =
        !current.password ||
        (await argon.verify(current.password, oldPassword));

      if (!isPasswordValid)
        throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

      const hash = await argon.hash(newPassword);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: hash },
      });
      await this.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      });
      await this.prisma.trustedDevice.deleteMany({
        where: { userId: user.id },
      });
      // Also closes off any TOTP sign-in still mid-flight — see
      // resetPassword's identical delete for the full reasoning.
      await this.prisma.loginToken.deleteMany({
        where: { userId: user.id },
      });

      return this.createRefreshToken(user.id);
    });
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
  //
  // Backed by a real TrustedDevice row rather than a self-contained signed
  // JWT (which is what this was until 2026-09-06) — a JWT only proves the
  // server once issued it, which is exactly what made it unrevocable: no
  // record existed anywhere to delete, so the only way to kill a leaked
  // cookie, or ANY of a user's trusted devices, was to wait out its full
  // 30 days or rotate internal.jwtSecret and break every other session and
  // TOTP flow in the app along with it. This is the same DB-row-as-the-
  // actual-credential shape RefreshToken already uses just below, for the
  // identical reason.
  async setTrustedDeviceCookie(
    response: Response,
    userId: string,
    deviceInfo?: DeviceInfo,
  ) {
    const { token } = await this.prisma.trustedDevice.create({
      data: {
        userId,
        expiresAt: moment().add(30, "days").toDate(),
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
      },
    });
    response.cookie(TRUSTED_DEVICE_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("general.secureCookies"),
      maxAge: TRUSTED_DEVICE_MAX_AGE_MS,
    });
  }

  // Clears the cookie on THIS response and, when a request is given (every
  // caller has one — optional only so a future caller that genuinely can't
  // provide one still compiles), deletes the row it pointed to. Without
  // that second half, "Ce n'est pas vous ?" would only ever hide the
  // account from the browser clicking it — a copy of the same cookie value
  // taken before that click (the exact leak scenario this whole rework
  // exists for) would keep working until its natural 30-day expiry,
  // unrevoked, regardless of anything the real owner clicked here.
  async clearTrustedDeviceCookie(response: Response, request?: Request) {
    const token = request?.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (token) {
      await this.prisma.trustedDevice.deleteMany({ where: { token } });
    }
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

    const device = await this.prisma.trustedDevice.findUnique({
      where: { token },
      include: { user: { select: { username: true, isActivated: true } } },
    });
    if (!device) return { recognized: false };

    // Expired rows are deleted on the read that finds them rather than by
    // a separate sweep — this endpoint is hit on every sign-in page load,
    // so a table that only ever grows through 30-day-old dead rows gets
    // trimmed by ordinary traffic without needing a cron job of its own.
    // deleteMany, not delete: two tabs open on the sign-in page can both
    // read this same not-yet-cleaned row before either delete runs: the
    // first delete succeeds, and a singular delete() on a row that's
    // already gone throws (Prisma P2025), turning a routine expiry into
    // an uncaught 500 on this public, unguarded endpoint. deleteMany
    // resolves to a 0-row no-op instead.
    if (device.expiresAt < new Date()) {
      await this.prisma.trustedDevice.deleteMany({ where: { token } });
      return { recognized: false };
    }
    if (!device.user.isActivated) return { recognized: false };

    return { recognized: true, username: device.user.username };
  }

  // The actual sign-in triggered by the "Welcome back" button — re-verifies
  // the cookie server-side (never trusts that the earlier read-only check
  // already ran) and hands off to the same generateToken() every other
  // sign-in path uses, passing skipTotp: true — this cookie is only ever
  // set after a real TOTP challenge already succeeded once on this exact
  // device (see setTrustedDeviceCookie's own comment), so re-solving TOTP
  // again here would just be asking a device that already proved itself
  // to prove itself a second time, not adding real protection against
  // anyone who doesn't already hold this specific httpOnly, 30-day,
  // individually-revocable cookie.
  async signInTrusted(request: Request) {
    const token = request.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (!token)
      throw new UnauthorizedException(
        this.i18n.t("auth.tokenInvalidOrExpired"),
      );

    // A tentative lookup purely to learn which user's lock to acquire —
    // re-read in full inside that lock below before anything is trusted,
    // exactly like signInWithPassword's own re-fetch. Without this, the
    // liveness check and generateToken (which, with skipTotp: true, mints
    // a RefreshToken directly, no TOTP step to hide behind) ran with no
    // lock at all: a password change's own trustedDevice.deleteMany could
    // delete this exact row a moment after this method already read it as
    // live, and the session minted from that stale read would never be
    // caught by a wipe that, by the time it ran, had nothing left to see.
    const tentative = await this.prisma.trustedDevice.findUnique({
      where: { token },
    });
    if (!tentative)
      throw new UnauthorizedException(
        this.i18n.t("auth.tokenInvalidOrExpired"),
      );

    const result = await withUserCredentialsLock(tentative.userId, async () => {
      const device = await this.prisma.trustedDevice.findUnique({
        where: { token },
        include: { user: true },
      });
      if (
        !device ||
        device.expiresAt < new Date() ||
        !device.user.isActivated
      ) {
        return null;
      }
      return this.generateToken(device.user, undefined, {
        skipTotp: true,
      });
    });

    if (!result)
      throw new UnauthorizedException(
        this.i18n.t("auth.tokenInvalidOrExpired"),
      );
    return result;
  }

  // Backs both the account page's own "your trusted devices" list and the
  // admin console's per-user one — same query either way, just a
  // different userId (the caller's own, or one an AdministratorGuard
  // route supplies). Never returns `token` (see the model's own comment).
  // Excludes already-expired rows: those are dead weight waiting on
  // getTrustedDeviceInfo's lazy cleanup, not something either audience is
  // asking "can I still revoke this?" about.
  async listTrustedDevices(userId: string) {
    return this.prisma.trustedDevice.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Revokes every currently-live trusted device for a user in one action
  // rather than one-at-a-time: the realistic reason anyone reaches for
  // this — a shared computer, a synced browser profile, a leaked cookie —
  // is "I no longer trust *any* device I didn't just check", not "let me
  // pick through a list." A device removed this way simply falls back to
  // a normal password(+TOTP) sign-in next time; nothing else about the
  // account changes.
  async revokeTrustedDevices(userId: string) {
    await this.prisma.trustedDevice.deleteMany({ where: { userId } });
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
