import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createReadStream, ReadStream } from "fs";
import * as fs from "fs/promises";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../prisma/prisma.service";
import { AVATAR_DIRECTORY } from "../constants";
import { encodeAvatar } from "./avatarImage";
import { assertPublicUrl } from "./avatarUrl.guard";
import { fetchAvatarBytes, shouldIngest } from "./avatar.fetch";

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  private path(userId: string) {
    return `${AVATAR_DIRECTORY}/${userId}.webp`;
  }

  // Le seul point d'écriture d'un avatar dans tout le code. Les deux sources —
  // l'envoi manuel et la récupération OpenID — passent par ici, sans exception.
  //
  // Le fichier s'écrit avant la ligne en base — l'inverse de `remove()`
  // ci-dessous, qui efface le fichier puis la base, volontairement. Un arrêt
  // du process entre les deux étapes d'ici laisse au pire un fichier
  // orphelin sur disque : invisible (rien en base ne le référence), écrasé
  // sans incident au prochain envoi, et effacé avec le reste à la
  // suppression du compte. L'ordre inverse laisserait une ligne en base qui
  // pointe vers un fichier absent — un 404 sur sa propre photo, au lieu d'un
  // octet mort qu'on ne verra jamais.
  async store(userId: string, bytes: Buffer): Promise<Date> {
    const encoded = await encodeAvatar(bytes);
    await fs.mkdir(AVATAR_DIRECTORY, { recursive: true });
    await fs.writeFile(this.path(userId), encoded);
    const { avatarUpdatedAt } = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUpdatedAt: new Date() },
      select: { avatarUpdatedAt: true },
    });
    return avatarUpdatedAt;
  }

  async read(userId: string): Promise<ReadStream> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUpdatedAt: true },
    });
    if (!user?.avatarUpdatedAt)
      throw new NotFoundException(this.i18n.t("avatar.notFound"));

    const path = this.path(userId);
    try {
      await fs.access(path);
    } catch {
      // `remove` efface le fichier puis la base : un arrêt du process entre
      // les deux laisse la base annoncer une photo dont le fichier n'existe
      // plus. Sans ce contrôle, `createReadStream` sur un chemin absent lève
      // son erreur en événement, que le gestionnaire par défaut de
      // `StreamableFile` traduit en 400 avec le chemin absolu du serveur
      // dans le message (`ENOENT: … open '/…/data/avatars/<id>.webp'`). Même
      // réponse que « pas de photo » dans les deux cas, sans fuite de chemin.
      this.logger.warn(
        `Avatar manquant sur disque pour ${userId} alors que la base l'annonce (${path})`,
      );
      throw new NotFoundException(this.i18n.t("avatar.notFound"));
    }
    return createReadStream(path);
  }

  // Idempotente des deux côtés : un compte sans photo se supprime sans erreur,
  // et un fichier déjà absent ne fait pas échouer l'appel. C'est ce qui permet
  // à UserService.delete de l'appeler sans se demander s'il y avait une photo.
  async remove(userId: string): Promise<void> {
    await fs.rm(this.path(userId), { force: true });
    await this.prisma.user.updateMany({
      where: { id: userId, avatarUpdatedAt: { not: null } },
      data: { avatarUpdatedAt: null },
    });
  }

  // Appelée sans `await`, uniquement depuis `OAuthService.signUp` — plus
  // depuis `signIn` : une photo n'a pas le droit de ralentir une inscription,
  // encore moins de la faire échouer. Elle ne rejette donc jamais — tout
  // échec est journalisé et la personne enverra sa photo à la main.
  //
  // N'est plus rejouée à la connexion. `remove()` remet `avatarUpdatedAt` à
  // `null` — la même colonne que « jamais encore récupérée » — donc rejouer
  // ici à chaque connexion aurait fait revenir une photo qu'on vient de
  // retirer délibérément : un retrait est une décision manuelle au même titre
  // qu'un envoi, et la spec dit qu'un envoi manuel gagne toujours sur
  // l'annuaire. Le prix : un échec réseau à l'inscription n'est plus
  // rattrapé plus tard, la personne enverra sa photo à la main.
  async ingestFromOidc(
    user: { id: string; avatarUpdatedAt: Date | null } | null,
    pictureUrl?: string,
  ): Promise<void> {
    try {
      // La garde vit à l'intérieur du `try`, pas avant : `shouldIngest`
      // accepte `user: null` et y répond `false` plutôt que de déréférencer
      // `user.avatarUpdatedAt`. Le seul appelant restant (`OAuthService.signUp`)
      // ne passe jamais `null` — il construit un littéral
      // `{ id, avatarUpdatedAt: null }` — mais le type le permet toujours, en
      // défense en profondeur pour un futur appelant qui relirait l'utilisateur
      // via Prisma (`findFirst`/`findUnique` rendent `User | null`, dans un
      // dépôt qui compile en `strictNullChecks: false`, donc rien ne le
      // signale à la compilation). Un rejet ici doit de toute façon être
      // attrapé comme n'importe quel autre échec — pas fuiter en promesse
      // non gérée depuis l'appel en `void` d'OAuthService.
      if (!shouldIngest(user, pictureUrl)) return;
      // `shouldIngest` a déjà établi que `user` et l'URL sont présents, mais
      // TypeScript ne rétrécit pas à travers un appel de fonction — et ce
      // dépôt compile avec `strictNullChecks: false`, donc l'erreur ne se
      // verrait pas ici.
      const url = assertPublicUrl(pictureUrl as string);
      await this.store(user!.id, await fetchAvatarBytes(url));
    } catch (error) {
      this.logger.warn(
        `Avatar OpenID non récupéré pour ${user?.id ?? "inconnu"} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
