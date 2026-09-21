import { Module } from "@nestjs/common";
import { EmailModule } from "src/email/email.module";
import { ShareModule } from "src/share/share.module";
import { VerificationModule } from "src/verification/verification.module";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { StripeService } from "./stripe.service";
import { StripeWebhookController } from "./stripeWebhook.controller";

@Module({
  // ShareModule fournit ShareService, dont dépend ShareSecurityGuard posé sur
  // la route ; VerificationModule fournit VerificationService, injecté dans
  // PaymentController et dont ShareSecurityGuard dépend aussi. Ni l'un ni
  // l'autre n'est un provider direct de ce module : Nest les résout via cet
  // injecteur au démarrage. PrismaModule et ConfigModule sont @Global(),
  // donc absents d'ici. EmailModule n'est pas global non plus : sans cet
  // import, l'injection d'EmailService dans PaymentService échoue au
  // démarrage, pas à l'exécution (même remarque que ReverseShareModule).
  imports: [ShareModule, VerificationModule, EmailModule],
  // StripeWebhookController n'a besoin d'aucun des deux imports ci-dessus :
  // pas de garde, pas de shareId dans l'URL. Il est déclaré ici quand même,
  // à côté du contrôleur qu'il complète.
  controllers: [PaymentController, StripeWebhookController],
  providers: [StripeService, PaymentService],
  exports: [StripeService],
})
export class PaymentModule {}
