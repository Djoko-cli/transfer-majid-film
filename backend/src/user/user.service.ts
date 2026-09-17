import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as moment from "moment";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as argon from "argon2";
import * as crypto from "crypto";
import { Entry } from "ldapts";
import { I18nService } from "nestjs-i18n";
import { AuthSignInDTO } from "src/auth/dto/authSignIn.dto";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";
import { withUserCredentialsLock } from "src/utils/asyncLock.util";
import { inspect } from "util";
import { ConfigService } from "../config/config.service";
import { FileService } from "../file/file.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";

// Long enough to go and fetch a code from another mailbox without rushing,
// short enough that an abandoned request does not sit claimable for days.
const EMAIL_CHANGE_CODE_TTL_MINUTES = 30;

@Injectable()
export class UserSevice {
  private readonly logger = new Logger(UserSevice.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private fileService: FileService,
    private configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async list() {
    return await this.prisma.user.findMany();
  }

  async get(id: string) {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  async create(dto: CreateUserDTO) {
    let hash: string;
    let randomPassword;

    // The password can be undefined if the user is invited by an admin
    if (!dto.password) {
      randomPassword = crypto.randomUUID();
      hash = await argon.hash(randomPassword);
    } else {
      hash = await argon.hash(dto.password);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            ...dto,
            password: hash,
          },
        });

        if (randomPassword) {
          await this.emailService.sendInviteEmail(dto.email, randomPassword);
        }

        return user;
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            this.i18n.t("auth.userAlreadyExists", {
              args: { field: duplicatedField },
            }),
          );
        }
      }
    }
  }

  async update(id: string, user: UpdateUserDto) {
    try {
      // "in", not truthiness: `password` is a real, valid state on this
      // model (an OAuth-only account has one — see oauth.service.ts), so
      // an explicit `password: null` — converting an account to
      // passwordless — is a real credential change too, not "no password
      // field in this request". Plain truthiness treated the two the
      // same and let an explicit null slip past the wipe below entirely
      // (confirmed: every trusted-device grant on that account stayed
      // live, skipping straight past the very password field the account
      // had just lost).
      const passwordProvided = "password" in user;
      const hash = passwordProvided
        ? user.password
          ? await argon.hash(user.password)
          : null
        : undefined;

      const applyUpdate = () =>
        this.prisma.user.update({
          where: { id },
          data: { ...user, password: hash },
        });

      // An admin setting a new password here is the same "the account may
      // be compromised, cut standing access" moment AuthService's own
      // resetPassword/updatePassword already treat this way — this path
      // just reaches it from the admin console instead of the account
      // owner acting themselves, often precisely because they no longer
      // can (this is, in fact, the more important of the two: an admin
      // reaches this path specifically when self-service is unavailable).
      // Scoped to only when a password is actually part of this update:
      // every other field this method touches (quota, admin status,
      // username...) isn't a credential change and has no business
      // revoking anything, or paying for the lock below.
      //
      // The whole commit-then-wipe sequence runs inside one lock, shared
      // with AuthService's signIn/resetPassword/updatePassword (see
      // withUserCredentialsLock's call in signIn for the full race this
      // closes) — without it, a sign-in already mid-verify against the
      // still-live old password could finish and mint a session or
      // trusted-device row after these deletes had already run and found
      // nothing to sweep.
      const updatedUser = passwordProvided
        ? await withUserCredentialsLock(id, async () => {
            const updated = await applyUpdate();
            await this.prisma.refreshToken.deleteMany({
              where: { userId: id },
            });
            await this.prisma.trustedDevice.deleteMany({
              where: { userId: id },
            });
            // Also closes off any TOTP sign-in still mid-flight — see
            // AuthService.resetPassword's identical delete for the full
            // reasoning.
            await this.prisma.loginToken.deleteMany({
              where: { userId: id },
            });
            return updated;
          })
        : await applyUpdate();

      return updatedUser;
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            this.i18n.t("auth.userAlreadyExists", {
              args: { field: duplicatedField },
            }),
          );
        }
      }
    }
  }

  // A self-service email change is not applied when it is asked for. The
  // new address is held aside and the account keeps its current one until a
  // code sent to the new address comes back. A typo therefore costs
  // nothing: the code goes nowhere and the row never moves.
  //
  // The obvious cheaper design — write the new address, mark the account
  // unactivated, make them confirm — fails on exactly that typo, by locking
  // the owner out of the account they were only editing.
  //
  // Self-service only. An admin changing someone else's address from the
  // console goes through update() as before: that is a deliberate act by
  // someone who already has authority over the row, and making it wait on a
  // code sent to the account's owner would defeat its purpose.
  async requestEmailChange(userId: string, requestedEmail: string) {
    const newEmail = requestedEmail.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException(this.i18n.t("auth.userNotFound"));

    // Asking for the address you already have is not an error, it is a
    // no-op — and answering it with a code to confirm what is already true
    // would be absurd.
    if (user.email === newEmail) return user;

    const taken = await this.prisma.user.findFirst({
      where: { email: newEmail },
    });
    if (taken)
      throw new BadRequestException(
        this.i18n.t("auth.userAlreadyExists", { args: { field: "email" } }),
      );

    const expiresAt = moment()
      .add(EMAIL_CHANGE_CODE_TTL_MINUTES, "minutes")
      .toDate();

    // Six digits is 900,000 values, so two pending changes can collide on
    // the column's unique constraint. Retried once with a fresh code rather
    // than surfacing a baffling "already exists" — same reasoning, and the
    // same shape, as AuthService.signUp's own activation code.
    for (let attempt = 0; attempt < 2; attempt++) {
      const code = crypto.randomInt(100000, 1000000).toString();
      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: {
            pendingEmail: newEmail,
            pendingEmailToken: code,
            pendingEmailTokenExpiresAt: expiresAt,
          },
        });

        await this.emailService.sendEmailChangeCode(
          newEmail,
          code,
          moment
            .duration(EMAIL_CHANGE_CODE_TTL_MINUTES, "minutes")
            .locale(this.i18n.translate("email.locale"))
            .humanize(),
        );
        // To the address being left, and never awaited into failure: a
        // warning that cannot be delivered must not undo a change request
        // that succeeded.
        this.emailService
          .sendEmailChangeNotice(user.email, newEmail)
          .catch((e) => this.logger.error(e));

        return updated;
      } catch (e) {
        if (
          e instanceof PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          attempt === 0
        )
          continue;
        throw e;
      }
    }
  }

  async confirmEmailChange(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pendingEmail || user.pendingEmailToken !== code)
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));

    if (
      !user.pendingEmailTokenExpiresAt ||
      user.pendingEmailTokenExpiresAt < new Date()
    )
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));

    // Re-checked at the moment of applying, not only when it was asked for:
    // someone else may have taken the address in between.
    const taken = await this.prisma.user.findFirst({
      where: { email: user.pendingEmail },
    });
    if (taken)
      throw new BadRequestException(
        this.i18n.t("auth.userAlreadyExists", { args: { field: "email" } }),
      );

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        email: user.pendingEmail,
        pendingEmail: null,
        pendingEmailToken: null,
        pendingEmailTokenExpiresAt: null,
      },
    });
  }

  async cancelEmailChange(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: null,
        pendingEmailToken: null,
        pendingEmailTokenExpiresAt: null,
      },
    });
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { shares: true },
    });
    if (!user) throw new BadRequestException(this.i18n.t("auth.userNotFound"));

    if (user.isAdmin) {
      const userCount = await this.prisma.user.count({
        where: { isAdmin: true },
      });

      if (userCount === 1) {
        throw new BadRequestException(
          this.i18n.t("auth.cannotDeleteLastAdmin"),
        );
      }
    }

    await Promise.all(
      user.shares.map((share) => this.fileService.deleteAllFiles(share.id)),
    );

    return await this.prisma.user.delete({ where: { id } });
  }

  async findOrCreateFromLDAP(
    providedCredentials: AuthSignInDTO,
    ldapEntry: Entry,
  ) {
    const fieldNameMemberOf = this.configService.get("ldap.fieldNameMemberOf");
    const fieldNameEmail = this.configService.get("ldap.fieldNameEmail");

    let isAdmin = false;
    if (fieldNameMemberOf in ldapEntry) {
      const adminGroup = this.configService.get("ldap.adminGroups");
      const entryGroups = Array.isArray(ldapEntry[fieldNameMemberOf])
        ? ldapEntry[fieldNameMemberOf]
        : [ldapEntry[fieldNameMemberOf]];
      isAdmin = entryGroups.includes(adminGroup) ?? false;
    } else {
      this.logger.warn(
        `Trying to create/update a ldap user but the member field ${fieldNameMemberOf} is not present.`,
      );
    }

    let userEmail: string | null = null;
    if (fieldNameEmail in ldapEntry) {
      const value = Array.isArray(ldapEntry[fieldNameEmail])
        ? ldapEntry[fieldNameEmail][0]
        : ldapEntry[fieldNameEmail];
      if (value) {
        userEmail = value.toString();
      }
    } else {
      this.logger.warn(
        `Trying to create/update a ldap user but the email field ${fieldNameEmail} is not present.`,
      );
    }

    if (providedCredentials.email) {
      /* if LDAP does not provides an users email address, take the user provided email address instead */
      userEmail = providedCredentials.email;
    }

    const randomId = crypto.randomUUID();
    const placeholderUsername = `ldap_user_${randomId}`;
    const placeholderEMail = `${randomId}@ldap.local`;

    try {
      const user = await this.prisma.user.upsert({
        create: {
          username: providedCredentials.username ?? placeholderUsername,
          email: userEmail ?? placeholderEMail,
          password: await argon.hash(crypto.randomUUID()),

          isAdmin,
          ldapDN: ldapEntry.dn,
        },
        update: {
          isAdmin,
          ldapDN: ldapEntry.dn,
        },
        where: {
          ldapDN: ldapEntry.dn,
        },
      });

      if (user.username === placeholderUsername) {
        /* Give the user a human readable name if the user has been created with a placeholder username */
        await this.prisma.user
          .update({
            where: {
              id: user.id,
            },
            data: {
              username: `user_${user.id}`,
            },
          })
          .then((newUser) => {
            user.username = newUser.username;
          })
          .catch((error) => {
            this.logger.warn(
              `Failed to update users ${user.id} placeholder username: ${inspect(error)}`,
            );
          });
      }

      if (userEmail && userEmail !== user.email) {
        /* Sync users email if it has changed */
        await this.prisma.user
          .update({
            where: {
              id: user.id,
            },
            data: {
              email: userEmail,
            },
          })
          .then((newUser) => {
            this.logger.log(
              `Updated users ${user.id} email from ldap from ${user.email} to ${userEmail}.`,
            );
            user.email = newUser.email;
          })
          .catch((error) => {
            this.logger.error(
              `Failed to update users ${user.id} email to ${userEmail}: ${inspect(error)}`,
            );
          });
      }

      return user;
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            this.i18n.t("auth.userAlreadyExists", {
              args: { field: duplicatedField },
            }),
          );
        }
      }
    }
  }
}
