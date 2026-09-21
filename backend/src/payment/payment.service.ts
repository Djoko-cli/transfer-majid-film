import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { isPaidFor } from "src/share/paidAccess.util";
import { StripeService } from "./stripe.service";

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private stripe: StripeService,
    private readonly i18n: I18nService,
  ) {}

  async createSession(shareId: string, verifiedEmail: string | null) {
    if (!this.stripe.isConfigured())
      throw new BadRequestException(this.i18n.t("payment.notConfigured"));

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { payments: { select: { email: true, revokedAt: true } } },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));
    if (!share.priceCents)
      throw new BadRequestException(this.i18n.t("payment.notForSale"));

    // Si cette adresse a déjà payé, on ne la fait pas payer deux fois : on la
    // renvoie sur le transfert, déverrouillé. Ça ne couvre pas deux onglets
    // simultanés — celui-là se règle par un remboursement, et le reçu envoyé
    // à chaque paiement le rend visible.
    if (
      isPaidFor({
        priceCents: share.priceCents,
        verifiedEmail,
        payments: share.payments,
      })
    )
      throw new BadRequestException(this.i18n.t("payment.alreadyPaid"));

    const appUrl = this.config.get("general.appUrl");

    const session = await this.stripe.client().checkout.sessions.create({
      mode: "payment",
      // Stripe collecte l'adresse, et c'est elle qui portera le droit. On
      // pré-remplit si le visiteur en a déjà prouvé une, sans l'imposer.
      customer_email: verifiedEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: share.priceCents,
            // `??` ne rattrape que null/undefined : une chaîne vide passe au
            // travers, et Stripe refuse un nom de produit vide. Même idiome
            // que file.controller.ts pour nommer le zip.
            product_data: { name: share.name?.trim() || shareId },
          },
        },
      ],
      // Lu par le webhook comme par la page de retour : c'est ce qui rattache
      // le paiement au transfert sans faire confiance à l'URL de retour.
      metadata: { shareId },
      success_url: `${appUrl}/s/${shareId}?payment={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/s/${shareId}`,
    });

    // Les types de Stripe la donnent `string | null` : elle est absente sur
    // une session déjà terminée ou en mode différé. On promet `{ url:
    // string }" au client, qui ferait `window.location.href = null` sinon.
    if (!session.url)
      throw new InternalServerErrorException(
        "Stripe did not return a checkout URL",
      );

    return { url: session.url };
  }
}
