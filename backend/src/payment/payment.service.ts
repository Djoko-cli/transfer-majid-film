import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { isPaidFor } from "src/share/paidAccess.util";
import { computeAccessUntil, nextExpiration } from "src/share/paidWindow.util";
import { PaymentOutcome, interpretStripeEvent } from "./stripeEvent.util";
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

  // Un upsert sur stripeCheckoutSessionId : le webhook et la page de retour
  // font le même travail, et Stripe réessaie. Celui qui arrive second ne doit
  // rien créer et rien casser.
  async recordPayment(outcome: PaymentOutcome) {
    // `Timespan` vaut { value, unit } (date.util.ts:19-25). Le dépôt le
    // consomme partout en `moment().add(value, unit)` — voir
    // share.service.ts:717 pour maxExpiration. On le convertit en secondes
    // ici pour que computeAccessUntil reste une fonction pure et testable.
    const fenetre = this.config.get("share.paidAccessWindow");
    const paidAt = new Date();
    const accessUntil = computeAccessUntil(
      paidAt,
      moment.duration(fenetre.value, fenetre.unit).asSeconds(),
    );

    return this.prisma.$transaction(async (tx) => {
      const share = await tx.share.findUnique({
        where: { id: outcome.shareId },
        select: { id: true, name: true, expiration: true, creatorId: true },
      });
      if (!share) return null;

      const paiement = await tx.sharePayment.upsert({
        where: { stripeCheckoutSessionId: outcome.checkoutSessionId },
        update: {},
        create: {
          shareId: share.id,
          shareName: share.name,
          email: outcome.email,
          scope: "EMAIL",
          sellerId: share.creatorId,
          amountCents: outcome.amountCents,
          currency: outcome.currency,
          stripeCheckoutSessionId: outcome.checkoutSessionId,
          stripePaymentIntentId: outcome.paymentIntentId,
          paidAt,
          accessUntil,
        },
      });

      // `paiement.accessUntil` est la valeur EN BASE, pas la variable locale
      // calculée ci-dessus : sur un upsert qui rejoue, `update: {}` ne change
      // rien à la ligne existante, donc `paiement` reste celui du PREMIER
      // appel. Reculer l'expiration à partir de la variable locale aurait
      // recalculé un `paidAt` plus tardif à chaque rejeu et repoussé le
      // transfert au-delà de ce que la ligne de paiement promet réellement.
      // En partant de la valeur en base, rejouer l'événement devient
      // exactement une opération nulle — dans la MÊME transaction : un
      // redémarrage entre les deux laisserait un droit payé sur un transfert
      // qui expire demain.
      const nouvelle = nextExpiration(share.expiration, paiement.accessUntil);
      if (nouvelle)
        await tx.share.update({
          where: { id: share.id },
          data: { expiration: nouvelle },
        });

      return paiement;
    });
  }

  async revokePayment(paymentIntentId: string) {
    await this.prisma.sharePayment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Laisse remonter l'erreur de Stripe telle quelle : une signature invalide
  // doit répondre 400, jamais 200. Répondre 200 à un événement non vérifié,
  // c'est accepter qu'un inconnu déclare des paiements.
  verifyWebhook(rawBody: Buffer | undefined, signature: string | string[]) {
    if (!rawBody)
      throw new BadRequestException("missing raw body for webhook");

    return this.stripe.client().webhooks.constructEvent(
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
      this.config.get("stripe.webhookSigningSecret"),
    );
  }

  async applyEvent(event: { type: string; data: { object: object } }) {
    const outcome = interpretStripeEvent(event as never);
    if (!outcome) return;
    if (outcome.kind === "paid") await this.recordPayment(outcome);
    else await this.revokePayment(outcome.paymentIntentId);
  }

  // Le même travail que le webhook, depuis l'autre bout. Sans lui, un client
  // qui revient avant que Stripe ait appelé regarde un écran verrouillé alors
  // que son argent est parti. L'upsert fait que le second arrivé ne casse rien.
  async confirmSession(shareId: string, sessionId: string) {
    const session = await this.stripe
      .client()
      .checkout.sessions.retrieve(sessionId);

    // On ne fait PAS confiance au shareId de l'URL : c'est celui que Stripe a
    // enregistré à la création qui fait foi.
    if ((session.metadata as Record<string, string>)?.shareId !== shareId)
      throw new BadRequestException(this.i18n.t("payment.sessionMismatch"));

    await this.applyEvent({
      type: "checkout.session.completed",
      data: { object: session as unknown as object },
    });
  }
}
