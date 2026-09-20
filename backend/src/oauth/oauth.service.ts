import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { I18nService } from "nestjs-i18n";
import { nanoid } from "nanoid";
import { hasAnySignInMethod } from "../utils/signInMethod.util";
import { AuthService } from "../auth/auth.service";
import { AvatarService } from "../avatar/avatar.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { OAuthSignInDto } from "./dto/oauthSignIn.dto";
import { ErrorPageException } from "./exceptions/errorPage.exception";
import { OAuthProvider } from "./provider/oauthProvider.interface";

@Injectable()
export class OAuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject(forwardRef(() => AuthService)) private auth: AuthService,
    private avatar: AvatarService,
    @Inject("OAUTH_PLATFORMS") private platforms: string[],
    @Inject("OAUTH_PROVIDERS")
    private oAuthProviders: Record<string, OAuthProvider<unknown>>,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new Logger(OAuthService.name);

  available(): string[] {
    return this.platforms
      .map((platform) => [
        platform,
        this.config.get(`oauth.${platform}-enabled`),
      ])
      .filter(([_, enabled]) => enabled)
      .map(([platform, _]) => platform);
  }

  availableProviders(): Record<string, OAuthProvider<unknown>> {
    return Object.fromEntries(
      Object.entries(this.oAuthProviders)
        .map(([providerName, provider]) => [
          [providerName, provider],
          this.config.get(`oauth.${providerName}-enabled`),
        ])
        .filter(([_, enabled]) => enabled)
        .map(([provider, _]) => provider),
    );
  }

  async status(user: User) {
    const oauthUsers = await this.prisma.oAuthUser.findMany({
      select: {
        provider: true,
        providerUsername: true,
      },
      where: {
        userId: user.id,
      },
    });
    return Object.fromEntries(oauthUsers.map((u) => [u.provider, u]));
  }

  async signIn(user: OAuthSignInDto, ip: string) {
    const oauthUser = await this.prisma.oAuthUser.findFirst({
      where: {
        provider: user.provider,
        providerUserId: user.providerId,
      },
    });
    if (oauthUser) {
      await this.updateIsAdmin(oauthUser.userId, user.isAdmin);
      const updatedUser = await this.prisma.user.findFirst({
        where: {
          id: oauthUser.userId,
        },
      });
      this.logger.log(`Successful login for user ${user.email} from IP ${ip}`);
      return this.auth.generateToken(updatedUser, { idToken: user.idToken });
    }

    return this.signUp(user, ip);
  }

  async link(
    userId: string,
    provider: string,
    providerUserId: string,
    providerUsername: string,
    pictureUrl?: string,
  ) {
    const oauthUser = await this.prisma.oAuthUser.findFirst({
      where: {
        provider,
        providerUserId,
      },
    });
    if (oauthUser) {
      throw new ErrorPageException("already_linked", "/account", [
        `provider_${provider}`,
      ]);
    }

    await this.prisma.oAuthUser.create({
      data: {
        userId,
        provider,
        providerUsername,
        providerUserId,
      },
    });

    // Deuxième — et jusqu'ici seul — point d'accroche réel de la
    // récupération d'avatar, à côté de celui de `signUp` ci-dessous :
    // dissocier un annuaire puis s'y réassocier passe par ici, pas par
    // `signUp` ni par `signIn`. C'est même le chemin qu'on emprunte quand on
    // veut délibérément déclencher la récupération — l'oublier revient à ne
    // couvrir que l'inscription et pas la reprise volontaire. `shouldIngest`
    // continue de garder la règle : un envoi manuel gagne toujours, donc une
    // photo déjà présente n'est jamais remplacée par une réassociation.
    //
    // Relu en base plutôt que passé en paramètre : contrairement à `signUp`,
    // où le compte vient d'être créé et n'a par construction pas encore de
    // photo, ici le compte existe déjà et peut très bien en avoir une — la
    // seule façon de le savoir est de relire `avatarUpdatedAt`.
    //
    // Sans `await`, comme `signUp` : une photo n'a pas le droit de ralentir
    // une association, encore moins de la faire échouer.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUpdatedAt: true },
    });
    void this.avatar.ingestFromOidc(user, pictureUrl);
  }

  async unlink(user: User, provider: string) {
    const oauthUser = await this.prisma.oAuthUser.findFirst({
      where: {
        userId: user.id,
        provider,
      },
    });
    if (!oauthUser) {
      throw new ErrorPageException("not_linked", "/account", [provider]);
    }

    // Unlinking is the one action on the account page that can remove the
    // last way back into the account, and it looked exactly like the
    // reversible ones. An account with no password — every account created
    // through OAuth has `password: null` — that unlinks its only provider
    // has nothing left to sign in with, and no route to link a new one,
    // because linking starts from a session it can no longer obtain.
    //
    // The remaining links are read rather than inferred from the list the
    // page happens to show: a provider switched off instance-wide still
    // appears as linked there, and is not a way in.
    const remainingLinks = await this.prisma.oAuthUser.findMany({
      where: { userId: user.id, provider: { not: provider } },
      select: { provider: true },
    });

    const stillReachable = hasAnySignInMethod({
      hasPassword: !!user.password,
      isLdap: !!user.ldapDN,
      linkedProviders: remainingLinks.map((link) => link.provider),
      passwordDisabled: this.config.get("oauth.disablePassword"),
      enabledProviders: this.available(),
    });

    if (!stillReachable)
      throw new BadRequestException(
        this.i18n.t("oauth.cannotUnlinkLastSignInMethod"),
      );

    await this.prisma.oAuthUser.delete({
      where: {
        id: oauthUser.id,
      },
    });
  }

  private async getAvailableUsername(preferredUsername: string) {
    // Only keep letters, numbers, dots, and underscores. Truncate to 20 characters.
    let username = preferredUsername
      .replace(/[^a-zA-Z0-9._]/g, "")
      .substring(0, 20);
    while (true) {
      const user = await this.prisma.user.findFirst({
        where: {
          username: username,
        },
      });
      if (user) {
        username = username + "_" + nanoid(10).replaceAll("-", "");
      } else {
        return username;
      }
    }
  }

  private async signUp(user: OAuthSignInDto, ip: string) {
    // register
    if (!this.config.get("oauth.allowRegistration")) {
      throw new ErrorPageException("no_user", "/auth/signIn", [
        `provider_${user.provider}`,
      ]);
    }

    if (!user.email) {
      throw new ErrorPageException("no_email", "/auth/signIn", [
        `provider_${user.provider}`,
      ]);
    }

    const existingUser: User = await this.prisma.user.findFirst({
      where: {
        email: user.email,
      },
    });

    if (existingUser) {
      throw new ErrorPageException("email_already_exists", "/auth/signIn", [
        `provider_${user.provider}`,
      ]);
    }

    const result = await this.auth.signUp(
      {
        email: user.email,
        username: await this.getAvailableUsername(user.providerUsername),
        password: null,
      },
      ip,
      user.isAdmin,
      true,
    );

    await this.prisma.oAuthUser.create({
      data: {
        provider: user.provider,
        providerUserId: user.providerId.toString(),
        providerUsername: user.providerUsername,
        userId: result.user.id,
      },
    });

    // Un des deux points d'appel réels, avec `OAuthService.link` ci-dessus :
    // un retrait délibéré (`AvatarService.remove`) remet `avatarUpdatedAt` à
    // `null`, exactement comme un compte qui n'a jamais eu de photo —
    // rejouer cette récupération à chaque connexion aurait fait revenir une
    // photo qu'on vient de retirer. Ici, `avatarUpdatedAt` vaut `null` par
    // construction (le compte vient d'être créé), donc le déclencheur reste
    // correct sans avoir besoin de relire l'utilisateur — au contraire de
    // `link()`, où le compte existe déjà et doit être relu. Le coût : si la
    // récupération échoue à l'inscription (réseau, IdP hors service), elle
    // n'est plus rejouée à une connexion suivante — la personne enverra sa
    // photo à la main, ou se dissociera et se réassociera, ce qui repasse
    // par `link()`. En échange, la requête sortante par connexion que la
    // spec assumait « à contrecœur » disparaît complètement, et un retrait
    // tient enfin.
    // Sans `await` : l'inscription ne doit dépendre en rien de cette requête.
    void this.avatar.ingestFromOidc(
      { id: result.user.id, avatarUpdatedAt: null },
      user.pictureUrl,
    );

    return result;
  }

  private async updateIsAdmin(userId: string, isAdmin?: boolean) {
    if (!isAdmin) return;
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        isAdmin: isAdmin,
      },
    });
  }
}
