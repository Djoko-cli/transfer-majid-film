import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as moment from "moment";
import { Response } from "express";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";
import { isPaidFor } from "src/share/paidAccess.util";
import { computeAccessUntil, nextExpiration } from "src/share/paidWindow.util";
import { PaymentOutcome, interpretStripeEvent } from "./stripeEvent.util";
import { VerificationService } from "src/verification/verification.service";
import { StripeService } from "./stripe.service";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private stripe: StripeService,
    private readonly i18n: I18nService,
    private emailService: EmailService,
    private verification: VerificationService,
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
      // La MÊME marque, mais sur le PaymentIntent. Un `charge.refunded` ne
      // porte pas les métadonnées de la session — seulement son
      // `payment_intent`. Sans cette estampille, un remboursement qui ne
      // correspond à aucun paiement connu serait indiscernable d'un
      // remboursement étranger à cette application sur le même compte Stripe,
      // et revokePayment ne pourrait pas décider s'il faut insister.
      payment_intent_data: { metadata: { shareId } },
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

  // Le webhook et la page de retour font le même travail, et Stripe réessaie.
  // Celui qui arrive second ne doit rien créer, rien casser, et rien renvoyer
  // à personne : c'est le drapeau `cree` qui décide des courriels plus bas.
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

    const { paiement, cree, creator, transfertInconnu } =
      await this.prisma.$transaction(async (tx) => {
        const share = await tx.share.findUnique({
          where: { id: outcome.shareId },
          select: {
            id: true,
            name: true,
            expiration: true,
            creatorId: true,
            creator: { select: { email: true, username: true } },
          },
        });

        // Prisma compile un upsert en un SELECT suivi d'un INSERT — ce n'est
        // pas une instruction atomique. Ce qui rend P2002 impossible entre
        // deux webhooks concurrents, c'est le BEGIN IMMEDIATE que $transaction
        // émet, qui prend le verrou d'écriture d'entrée. Sortir ces deux
        // requêtes de la transaction rouvrirait la course sans que rien ne le
        // montre : les deux lignes ci-dessous ne vivent que grâce à elle.
        const existant = await tx.sharePayment.findUnique({
          where: { stripeCheckoutSessionId: outcome.checkoutSessionId },
        });

        const paiement = existant
          ? existant.stripePaymentIntentId || !outcome.paymentIntentId
            ? existant
            : // Complète ce qui manquait, sans jamais rien effacer : une ligne
              // écrite par la page de retour avant que Stripe ait attribué son
              // payment_intent resterait sinon sans identifiant à vie, donc
              // hors d'atteinte de tout charge.refunded — un remboursement
              // qu'on ne pourrait plus honorer.
              await tx.sharePayment.update({
                where: { id: existant.id },
                data: { stripePaymentIntentId: outcome.paymentIntentId },
              })
          : await tx.sharePayment.create({
              data: {
                // Nul quand le transfert n'existe plus. La colonne est
                // facultative exprès (schema.prisma) : la trace de l'argent
                // doit survivre à la disparition du transfert. Ne rien écrire
                // du tout et répondre 200, comme on le faisait, laissait un
                // encaissement sans la moindre trace — et Stripe, ayant reçu
                // son 200, ne réessayait jamais.
                shareId: share?.id ?? null,
                shareName: share?.name ?? null,
                email: outcome.email,
                scope: "EMAIL",
                sellerId: share?.creatorId ?? null,
                amountCents: outcome.amountCents,
                currency: outcome.currency,
                stripeCheckoutSessionId: outcome.checkoutSessionId,
                stripePaymentIntentId: outcome.paymentIntentId,
                paidAt,
                accessUntil,
              },
            });

        // `paiement.accessUntil` est la valeur EN BASE, pas la variable locale
        // calculée ci-dessus : au rejeu, `paiement` est la ligne du PREMIER
        // appel. Reculer l'expiration depuis la variable locale recalculerait
        // un `paidAt` plus tardif à chaque rejeu et repousserait le transfert
        // au-delà de ce que la ligne de paiement promet. En partant de la
        // base, rejouer devient exactement une opération nulle — et dans la
        // MÊME transaction : un redémarrage entre les deux laisserait un droit
        // payé sur un transfert qui expire demain.
        if (share) {
          const nouvelle = nextExpiration(
            share.expiration,
            paiement.accessUntil,
          );
          if (nouvelle)
            await tx.share.update({
              where: { id: share.id },
              data: { expiration: nouvelle },
            });
        }

        return {
          paiement,
          cree: !existant,
          creator: share?.creator ?? null,
          transfertInconnu: !share,
        };
      });

    // Un rejeu ne renvoie pas un second reçu : un acheteur qui en reçoit deux
    // se demande s'il a payé deux fois, et c'est nous qui aurions à le
    // rassurer. Le journal non plus ne se répète pas — `/confirm` est une
    // route ouverte, et une erreur réémise à chaque appel inonderait le
    // journal depuis l'extérieur.
    if (!cree) return paiement;

    if (transfertInconnu) {
      this.logger.error(
        `Recorded payment ${paiement.id} with no transfer attached: share ${outcome.shareId} no longer exists. ` +
          `${paiement.email} paid ${paiement.amountCents} ${paiement.currency} for something that cannot be delivered — refund them.`,
      );
      // Pas de reçu. Il dirait « vous pouvez télécharger vos fichiers ici »
      // en pointant un lien mort, à la seule personne qu'il faut prévenir du
      // contraire. L'erreur ci-dessus est l'alerte ; le remboursement se fait
      // à la main.
      return paiement;
    }

    // Après la transaction, jamais dedans : un serveur de messagerie lent
    // ou en panne ne doit pas annuler un paiement correctement enregistré.
    // Les deux envois sont indépendants — chacun dans son propre try/catch,
    // chacun journalisé s'il échoue — comme le fait ReverseShareService.create
    // pour ses invitations.
    try {
      await this.emailService.sendPaymentReceipt(
        paiement.email,
        outcome.shareId,
        paiement.shareName ?? undefined,
        paiement.amountCents,
        paiement.currency,
        // La référence, c'est la ligne SharePayment elle-même — retrouvable
        // en base si le client la cite. Aucun identifiant Stripe ne part
        // dans un courriel.
        paiement.id,
        paiement.paidAt,
      );
    } catch (e) {
      this.logger.error(
        `Could not send a payment receipt to ${paiement.email} for share ${outcome.shareId}`,
        e,
      );
    }

    // Sauté quand le transfert n'a pas de créateur (transfert anonyme) ou
    // que celui-ci n'a pas d'adresse : rien à notifier.
    if (creator?.email) {
      try {
        await this.emailService.sendPaymentNotificationToSeller(
          creator.email,
          outcome.shareId,
          paiement.shareName ?? undefined,
          paiement.amountCents,
          paiement.currency,
          paiement.email,
        );
      } catch (e) {
        this.logger.error(
          `Could not notify seller ${creator.email} of a payment for share ${outcome.shareId}`,
          e,
        );
      }
    }

    return paiement;
  }

  // Au-delà de ce délai, un remboursement qui n'a toujours pas trouvé son
  // paiement ne le trouvera plus : on cesse d'insister. Six heures laissent
  // très largement le temps à un `checkout.session.completed` retardé
  // d'arriver, et restent loin des jours d'échecs continus après lesquels
  // Stripe désactive un point de terminaison.
  private static readonly DELAI_REMBOURSEMENT_ORPHELIN_MS = 6 * 60 * 60 * 1000;

  // Stripe ne garantit pas l'ordre de livraison de ses événements. Un
  // remboursement peut donc arriver AVANT le paiement qu'il annule : point de
  // terminaison indisponible au moment du paiement, Stripe qui réessaie
  // pendant trois jours, et un remboursement émis entre-temps. Ne rien
  // trouver ne veut alors pas dire « rien à faire » mais « pas encore » — et
  // répondre 200 perdrait le remboursement pour de bon, laissant l'accès
  // ouvert à quelqu'un qu'on vient de rembourser. On refuse la livraison :
  // Stripe rapporte l'événement jusqu'à ce qu'il trouve son paiement.
  //
  // Mais on ne s'obstine pas indéfiniment. Rien ne distingue ici un
  // remboursement à nous d'une vente étrangère à cette application sur le
  // même compte Stripe, et insister sur celui-là coûterait bien plus cher que
  // l'événement perdu : après des échecs continus, Stripe prévient puis
  // DÉSACTIVE le point de terminaison — et ce sont alors TOUS les paiements
  // suivants qui disparaissent. L'âge de l'événement, qui ne change pas d'un
  // réessai à l'autre, borne l'entêtement.
  async revokePayment(paymentIntentId: string, eventCreatedAt: Date) {
    const { count } = await this.prisma.sharePayment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count > 0) return;

    // Déjà révoqué : là, c'est vraiment une opération nulle, et rejouer
    // l'événement ne doit rien déclencher.
    const connu = await this.prisma.sharePayment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true },
    });
    if (connu) return;

    const age = Date.now() - eventCreatedAt.getTime();

    if (age > PaymentService.DELAI_REMBOURSEMENT_ORPHELIN_MS) {
      this.logger.log(
        `Giving up on a refund for ${paymentIntentId}: no payment of ours matched it in ${Math.round(age / 3600000)}h.`,
      );
      return;
    }

    this.logger.warn(
      `Refund for ${paymentIntentId} matched no payment yet; asking Stripe to deliver it again.`,
    );
    throw new InternalServerErrorException(
      "no payment to revoke for this refund yet",
    );
  }

  // Laisse remonter l'erreur de Stripe telle quelle : une signature invalide
  // doit répondre 400, jamais 200. Répondre 200 à un événement non vérifié,
  // c'est accepter qu'un inconnu déclare des paiements.
  verifyWebhook(rawBody: Buffer | undefined, signature: string | string[]) {
    if (!rawBody) throw new BadRequestException("missing raw body for webhook");

    // Construits HORS du try, et c'est le sujet : `client()` lève quand la
    // clé secrète manque. Attrapée ici, cette panne de configuration serveur
    // ressortirait en 400 — une faute imputée à l'appelant — en lui tendant au
    // passage le nom d'un réglage interne. Seule la vérification de signature
    // appartient à ce try.
    const client = this.stripe.client();
    const secret = this.config.get("stripe.webhookSigningSecret");

    try {
      return client.webhooks.constructEvent(
        rawBody,
        Array.isArray(signature) ? signature[0] : signature,
        secret,
      );
    } catch (e) {
      // 400 plutôt que 500. Stripe réessaie dans les deux cas, donc rien ne
      // change pour lui — ce qui change, c'est la vue de l'exploitant : un
      // secret mal recopié produirait sinon un flot d'erreurs serveur
      // indistinguable d'une vraie panne. La raison exacte va au journal et
      // non à l'appelant : Stripe la formule parfois en décrivant notre
      // configuration (« It should start with whsec_ »), ce qu'un inconnu
      // n'a pas à apprendre d'un point de terminaison ouvert.
      this.logger.warn(`Rejected a webhook delivery: ${e.message}`);
      throw new BadRequestException("invalid webhook signature");
    }
  }

  // Rend `true` quand l'événement a été retenu, `false` quand il ne nous
  // concernait pas — une session abandonnée, un type d'événement étranger.
  // C'est ce verdict que la page de retour affiche.
  async applyEvent(event: {
    type: string;
    data: { object: object };
  }): Promise<boolean> {
    const outcome = interpretStripeEvent(event as never);
    if (!outcome) return false;

    if (outcome.kind === "paid") await this.recordPayment(outcome);
    else
      await this.revokePayment(outcome.paymentIntentId, outcome.eventCreatedAt);

    return true;
  }

  // Un identifiant que Stripe ne connaît pas ressortait tel quel — « No such
  // checkout.session: cs_… », avec le code HTTP de Stripe. Deux torts : ça
  // raconte à un inconnu qu'on est allé interroger Stripe, et surtout ça
  // donnait à la page de retour un code qu'elle ne savait pas distinguer d'un
  // vrai incident, si bien qu'un `?payment=` fabriqué de toutes pièces lui
  // faisait afficher « votre paiement est bien parti » à quelqu'un qui n'avait
  // rien payé. Session inconnue, session d'un autre compte, session d'un autre
  // transfert : une seule et même réponse, impossible à distinguer.
  private async retrieveSession(sessionId: string) {
    try {
      return await this.stripe.client().checkout.sessions.retrieve(sessionId);
    } catch (e) {
      this.logger.warn(`Rejected a payment confirmation: ${e.message}`);
      throw new BadRequestException(this.i18n.t("payment.sessionMismatch"));
    }
  }

  // Le même travail que le webhook, depuis l'autre bout. Sans lui, un client
  // qui revient avant que Stripe ait appelé regarde un écran verrouillé alors
  // que son argent est parti. L'upsert fait que le second arrivé ne casse rien.
  async confirmSession(shareId: string, sessionId: string, response: Response) {
    // Deux refus qui ne coûtent rien, AVANT de toucher au réseau. Cette route
    // n'a pas de garde de transfert — c'est voulu, voir le contrôleur — donc
    // elle accepte un identifiant de session de n'importe qui : sans ces deux
    // lignes, un inconnu déclencherait un appel sortant vers Stripe par
    // requête, et mangerait le quota d'API qui sert à ouvrir les vraies
    // sessions de paiement.
    if (!this.stripe.isConfigured())
      throw new BadRequestException(this.i18n.t("payment.notConfigured"));

    const transfert = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { id: true },
    });
    if (!transfert) throw new NotFoundException(this.i18n.t("share.notFound"));

    const session = await this.retrieveSession(sessionId);

    // On ne fait PAS confiance au shareId de l'URL : c'est celui que Stripe a
    // enregistré à la création qui fait foi.
    if ((session.metadata as Record<string, string>)?.shareId !== shareId)
      throw new BadRequestException(this.i18n.t("payment.sessionMismatch"));

    // Rend un verdict plutôt qu'un 201 au corps vide. Sans lui, la page de
    // retour ne pourrait pas distinguer « payé, c'est déverrouillé » de « tu
    // as annulé » et devrait le deviner en re-sondant le transfert. Une
    // session abandonnée, expirée ou à zéro euro ressort ici en `false` :
    // interpretStripeEvent refuse tout `payment_status` autre que "paid".
    const paid = await this.applyEvent({
      type: "checkout.session.completed",
      data: { object: session as unknown as object },
    });

    // Le pont qui manquait, et sans lequel tout le reste ne sert à rien.
    //
    // Le droit payé est attaché à une ADRESSE, et la porte ne reconnaît une
    // adresse que par le cookie du flux de code à usage unique. Or payer ne
    // pose aucun cookie : le webhook parle de serveur à serveur, et Stripe ne
    // connaît pas le navigateur. Sans cette ligne, l'acheteur revient de
    // Stripe, son argent est parti, son droit existe en base — et il relit
    // « Débloquer pour 300 € », sans que rien ne lui dise qu'il doit encore
    // prouver son adresse.
    //
    // Ce qui l'autorise : l'identifiant de session, que Stripe ne met que
    // dans l'URL de retour de celui qui vient de payer, et que la
    // vérification de `metadata.shareId` ci-dessus rattache à CE transfert.
    // C'est une preuve de possession, du même ordre que le code reçu par
    // courriel — et l'adresse posée dans le jeton est celle que STRIPE
    // rapporte, jamais une que l'appelant aurait choisie.
    const email = session.customer_details?.email;

    if (paid && email)
      this.verification.setVerificationCookie(
        response,
        this.verification.issueTokenFor(email.trim().toLowerCase()),
      );

    return { paid };
  }
}
