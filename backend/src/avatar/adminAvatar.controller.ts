import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { AvatarService } from "./avatar.service";

// Pourquoi un fichier séparé de `avatar.controller.ts`, et pas des routes
// `:id` en plus dans celui-là : `avatar.controller.ts` est
// `@Controller("users/me/avatar")` et son invariant se lit à l'œil — aucune
// de ses méthodes ne lit de paramètre de route, l'identifiant vient toujours
// du jeton. Y ajouter des routes `:id` ferait disparaître cette propriété de
// la lecture. Deux fichiers, donc : un où l'identifiant vient du jeton, un
// où il vient du chemin et où `AdministratorGuard` est la contrepartie de ce
// pouvoir élargi.
//
// Un administrateur peut voir et retirer la photo d'un autre compte, jamais
// en poser une : de quoi modérer une image inappropriée sur une instance
// ouverte à d'autres comptes, sans lui donner le pouvoir de choisir le
// visage de quelqu'un d'autre. Voir §1 de docs/photos-de-profil.md.
//
// `AdministratorGuard` rend `false` dès que `request.user` est absent
// (isAdmin.guard.ts), donc le cas où `JwtGuard` échoue ouvert — la requête
// passe sans utilisateur quand `share.allowUnauthenticatedShares` est activé,
// ce qu'il a fallu border explicitement sur les routes `me`
// (`AvatarController.requireUser`) — est déjà couvert ici sans rien écrire
// de plus : un `user` absent ne peut jamais être admin.
@Controller("users/:id/avatar")
@UseGuards(JwtGuard, AdministratorGuard)
export class AdminAvatarController {
  constructor(private avatar: AvatarService) {}

  @Get()
  async read(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const stream = await this.avatar.read(id);
    response.set({
      "Content-Type": "image/webp",
      // Mêmes en-têtes que la route `me` (avatar.controller.ts), pour la
      // même raison : correct uniquement parce que l'appelant — ici la
      // console d'admin, frontend/src/pages/admin/users.tsx — appelle
      // toujours cette URL avec `?v=<avatarUpdatedAt en ms>`.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    return new StreamableFile(stream);
  }

  @Delete()
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.avatar.remove(id);
  }
}
