import { Module } from "@nestjs/common";
import { AvatarController } from "./avatar.controller";
import { AvatarService } from "./avatar.service";

@Module({
  controllers: [AvatarController],
  providers: [AvatarService],
  // Exporté parce que deux autres modules en dépendent : UserModule, pour
  // effacer le fichier à la suppression d'un compte, et OAuthModule, pour la
  // récupération OpenID (tâche 5).
  exports: [AvatarService],
})
export class AvatarModule {}
