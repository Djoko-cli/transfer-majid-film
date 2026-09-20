import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import { I18nService } from "nestjs-i18n";
import { Throttle } from "@nestjs/throttler";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { AVATAR_MAX_BYTES } from "../constants";
import { UserDTO } from "../user/dto/user.dto";
import { AvatarService } from "./avatar.service";
import { UndecodableAvatarError } from "./avatarImage";

// Toutes les routes sont sur soi-même : l'identifiant vient du jeton, jamais
// d'un paramètre. Il n'existe donc aucun chemin qui serve l'avatar d'un autre
// compte, ce qui est la forme la plus simple de la règle « visible par son seul
// propriétaire ».
@Controller("users/me/avatar")
export class AvatarController {
  constructor(
    private avatar: AvatarService,
    private i18n: I18nService,
  ) {}

  // `JwtGuard` échoue ouvert : si `share.allowUnauthenticatedShares` est activé
  // (réglage d'administration, faux par défaut), une requête anonyme passe le
  // garde et `@GetUser()` rend `undefined` au lieu de faire échouer la requête
  // plus tôt — `user.controller.ts` (`getCurrentUser`) connaît déjà ce piège.
  // Sans ce contrôle, `user.id` plus bas plante en 500 non intentionnel au
  // lieu d'un refus explicite.
  private requireUser(user?: User): User {
    if (!user)
      throw new ForbiddenException(this.i18n.t("avatar.signInRequired"));
    return user;
  }

  // Le `ThrottlerGuard` global (100 requêtes/60 s/IP, `app.module.ts`) est
  // calibré pour des chunks de partage, pas pour du décodage d'image :
  // `limitInputPixels: 50_000_000` autorise une image de quelques centaines
  // de kilo-octets à se déplier en ~200 Mo de raster pendant le décodage, et
  // 100 décodages/minute sur les 4 fils du pool libuv, c'est ~800 Mo de pic
  // et quatre cœurs saturés — accessible à tout compte authentifié sans ce
  // frein propre à la route. Cinq changements de photo par minute reste
  // large pour une action qu'on fait trois fois dans une vie.
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 1000 } })
  @UseGuards(JwtGuard)
  async upload(
    @GetUser() user: User | undefined,
    @Req() request: Request,
  ) {
    const authedUser = this.requireUser(user);
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0)
      throw new BadRequestException(this.i18n.t("avatar.empty"));

    // Le parseur d'en-tête `image/*` borné à `AVATAR_MAX_BYTES` ne protège
    // que les appelants qui annoncent honnêtement leur type. Le parseur
    // global de `main.ts`, non borné à un chemin et calé sur
    // `share.chunkSize` (un réglage d'administration, potentiellement bien
    // au-dessus de 5 Mio), reste enregistré avant le nôtre : un envoi en
    // `application/octet-stream` lui échappe et arrive ici avec la limite de
    // l'admin, pas la nôtre. Ce contrôle est donc indépendant du parseur qui
    // a produit `bytes` — il tient même si celui qui a lu la requête n'est
    // pas le nôtre.
    if (bytes.length > AVATAR_MAX_BYTES)
      throw new PayloadTooLargeException(this.i18n.t("avatar.tooLarge"));

    try {
      const avatarUpdatedAt = await this.avatar.store(authedUser.id, bytes);
      return new UserDTO().from({ ...authedUser, avatarUpdatedAt });
    } catch (error) {
      if (error instanceof UndecodableAvatarError)
        throw new BadRequestException(this.i18n.t("avatar.undecodable"));
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtGuard)
  async read(
    @GetUser() user: User | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authedUser = this.requireUser(user);
    const stream = await this.avatar.read(authedUser.id);
    response.set({
      "Content-Type": "image/webp",
      // Un an et `immutable` ne sont corrects que parce que le front demande
      // toujours l'URL avec `?v=<avatarUpdatedAt en ms>` : changer de photo
      // change `v`, donc change l'URL, donc contourne ce cache. `private`
      // parce que l'image appartient à un compte et n'a rien à faire dans un
      // cache partagé.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    return new StreamableFile(stream);
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async remove(@GetUser() user: User | undefined) {
    const authedUser = this.requireUser(user);
    await this.avatar.remove(authedUser.id);
  }
}
