import { Module } from "@nestjs/common";
import { AdminAvatarController } from "./adminAvatar.controller";
import { AvatarController } from "./avatar.controller";
import { AvatarService } from "./avatar.service";

@Module({
  // L'ordre compte : Nest teste les routes d'un module dans l'ordre où leurs
  // contrôleurs sont déclarés ici, et `users/:id/avatar`
  // (AdminAvatarController) capture aussi bien `users/me/avatar` — "me" est
  // une valeur de `:id` comme une autre pour le routeur. `AvatarController`
  // doit donc rester déclaré en premier, sans quoi une requête sur la route
  // `me` serait interceptée par le contrôleur `:id` (avec `id === "me"`) au
  // lieu du sien — sans erreur visible, juste le mauvais garde et le mauvais
  // comportement.
  controllers: [AvatarController, AdminAvatarController],
  providers: [AvatarService],
  // Exporté parce que deux autres modules en dépendent : UserModule, pour
  // effacer le fichier à la suppression d'un compte, et OAuthModule, pour la
  // récupération OpenID.
  exports: [AvatarService],
})
export class AvatarModule {}
