import { Module } from "@nestjs/common";
import { ShareModule } from "src/share/share.module";
import { VerificationModule } from "src/verification/verification.module";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { StripeService } from "./stripe.service";

@Module({
  // ShareModule fournit ShareService, dont dépend ShareSecurityGuard posé sur
  // la route ; VerificationModule fournit VerificationService, injecté dans
  // PaymentController et dont ShareSecurityGuard dépend aussi. Ni l'un ni
  // l'autre n'est un provider direct de ce module : Nest les résout via cet
  // injecteur au démarrage. PrismaModule et ConfigModule sont @Global(),
  // donc absents d'ici.
  imports: [ShareModule, VerificationModule],
  controllers: [PaymentController],
  providers: [StripeService, PaymentService],
  exports: [StripeService],
})
export class PaymentModule {}
