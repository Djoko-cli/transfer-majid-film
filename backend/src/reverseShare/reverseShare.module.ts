import { forwardRef, Module } from "@nestjs/common";
import { EmailModule } from "src/email/email.module";
import { FileModule } from "src/file/file.module";
import { ReverseShareController } from "./reverseShare.controller";
import { ReverseShareService } from "./reverseShare.service";

@Module({
  // EmailModule n'est pas global : sans cet import, l'injection d'EmailService
  // dans le service échoue au démarrage, pas à l'exécution.
  imports: [forwardRef(() => FileModule), EmailModule],
  controllers: [ReverseShareController],
  providers: [ReverseShareService],
  exports: [ReverseShareService],
})
export class ReverseShareModule {}
