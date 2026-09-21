import { Controller, HttpCode, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { PaymentService } from "./payment.service";

// Hors de `shares/:shareId/payment` : un webhook n'appartient à aucun
// transfert, c'est Stripe qui dit lequel via `metadata`. Le mettre sous un
// `:shareId` obligerait à inventer une valeur pour le satisfaire — et à faire
// confiance à l'URL plutôt qu'à l'événement signé. Sous `payments` et non
// `shares` pour la même raison, un cran plus loin : cette route ne décrit
// même pas une action sur un transfert, c'est Stripe qui parle.
@Controller("payments")
export class StripeWebhookController {
  constructor(private paymentService: PaymentService) {}

  @Post("webhook")
  @HttpCode(200)
  async webhook(@Req() request: Request & { rawBody?: Buffer }) {
    const event = this.paymentService.verifyWebhook(
      request.rawBody,
      request.headers["stripe-signature"] as string,
    );
    await this.paymentService.applyEvent(event);
  }
}
