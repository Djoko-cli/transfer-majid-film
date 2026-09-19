import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createReadStream, ReadStream } from "fs";
import * as fs from "fs/promises";
import * as https from "node:https";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../prisma/prisma.service";
import { AVATAR_DIRECTORY, AVATAR_MAX_BYTES } from "../constants";
import { encodeAvatar } from "./avatarImage";
import {
  assertPublicUrl,
  guardedLookup,
  UnsafeAvatarUrlError,
} from "./avatarUrl.guard";
import { shouldIngest } from "./avatar.fetch";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5_000;

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

  // Appelée sans `await` depuis OAuthService : une photo n'a pas le droit de
  // ralentir une connexion, encore moins de la faire échouer. Elle ne rejette
  // donc jamais — tout échec est journalisé et la personne enverra sa photo à
  // la main.
  //
  // Tant que la colonne reste nulle, la tentative est rejouée à la connexion
  // suivante. C'est assumé : une requête sortante en arrière-plan par
  // connexion, bornée à cinq secondes, plutôt qu'une colonne de plus dont le
  // seul rôle serait de mémoriser un échec.
  async ingestFromOidc(
    user: { id: string; avatarUpdatedAt: Date | null },
    pictureUrl?: string,
  ): Promise<void> {
    if (!shouldIngest(user, pictureUrl)) return;
    try {
      // `shouldIngest` a déjà établi que l'URL est présente, mais TypeScript ne
      // rétrécit pas à travers un appel de fonction — et ce dépôt compile avec
      // `strictNullChecks: false`, donc l'erreur ne se verrait pas ici.
      const url = assertPublicUrl(pictureUrl as string);
      await this.store(user.id, await this.fetchBytes(url));
    } catch (error) {
      this.logger.warn(
        `Avatar OpenID non récupéré pour ${user.id} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private fetchBytes(url: URL, hop = 0): Promise<Buffer> {
    if (hop > MAX_REDIRECTS)
      return Promise.reject(new UnsafeAvatarUrlError("trop de redirections"));

    return new Promise<Buffer>((resolve, reject) => {
      const request = https.request(
        url,
        // `lookup` est ce qui ferme la reliaison DNS : la vérification se fait
        // à l'instant où la socket utilise l'adresse, pas sur une résolution
        // séparée faite plus tôt.
        { method: "GET", lookup: guardedLookup, timeout: FETCH_TIMEOUT_MS },
        (response) => {
          const { statusCode, headers } = response;

          if (
            statusCode &&
            [301, 302, 303, 307, 308].includes(statusCode) &&
            headers.location
          ) {
            response.resume();
            let next: URL;
            try {
              // Chaque saut repasse par les mêmes règles : une redirection est
              // une URL fournie par un tiers, exactement comme la première.
              next = assertPublicUrl(new URL(headers.location, url).toString());
            } catch (error) {
              return reject(error);
            }
            return resolve(this.fetchBytes(next, hop + 1));
          }

          if (statusCode !== 200) {
            response.resume();
            return reject(new Error(`statut ${statusCode}`));
          }

          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            // On ne fait pas confiance au Content-Length annoncé : c'est la
            // lecture réelle qu'on coupe.
            if (size > AVATAR_MAX_BYTES) {
              request.destroy();
              reject(new Error("image trop lourde"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => resolve(Buffer.concat(chunks)));
          response.on("error", reject);
        },
      );

      request.on("timeout", () => request.destroy(new Error("délai dépassé")));
      request.on("error", reject);
      request.end();
    });
  }
}
