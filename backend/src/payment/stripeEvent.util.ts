export type PaymentOutcome = {
  kind: "paid";
  shareId: string;
  email: string;
  amountCents: number;
  currency: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
};

export type RefundOutcome = {
  kind: "refunded";
  paymentIntentId: string;
  /**
   * L'instant où Stripe a créé l'événement, pas celui où il nous parvient.
   * Il reste identique d'un réessai à l'autre : c'est ce qui permet de savoir
   * depuis combien de temps un remboursement cherche son paiement.
   */
  eventCreatedAt: Date;
};

// Une fonction pure : c'est ce qui rend le webhook éprouvable sans réseau, et
// ce qui permet de le rejouer deux fois dans un test pour prouver que la
// contrainte d'unicité fait son travail.
export function interpretStripeEvent(event: {
  type: string;
  created?: number;
  data: { object: Record<string, unknown> };
}): PaymentOutcome | RefundOutcome | null {
  const objet = event.data.object as Record<string, never>;

  if (event.type === "checkout.session.completed") {
    if (objet.payment_status !== "paid") return null;

    const shareId = (objet.metadata as Record<string, string> | null)?.shareId;
    const email = (objet.customer_details as { email?: string } | null)?.email;
    if (!shareId || !email) return null;

    // Un montant qui n'est pas un entier de centimes n'a rien à faire en base.
    // `Number(undefined)` vaut NaN et `Number(null)` vaut 0 : sans ce garde,
    // le premier ferait échouer l'INSERT et Stripe rapporterait l'événement en
    // boucle, et le second enregistrerait tranquillement un paiement de zéro
    // centime donnant un accès complet.
    const amountCents = Number(objet.amount_total);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null;

    const paymentIntent = objet.payment_intent;

    return {
      kind: "paid",
      shareId,
      // Normalisée ici et nulle part ailleurs : c'est cette valeur que le
      // garde comparera, et isPaidFor normalise des deux côtés.
      email: String(email).trim().toLowerCase(),
      amountCents,
      currency: String(objet.currency),
      checkoutSessionId: String(objet.id),
      paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : null,
    };
  }

  if (event.type === "charge.refunded") {
    const paymentIntent = objet.payment_intent;
    if (typeof paymentIntent !== "string") return null;

    // `created` est en secondes chez Stripe. Absent (charge utile forgée à la
    // main dans un test), on prend maintenant : le remboursement est alors
    // traité comme frais, ce qui est le choix prudent.
    const cree = Number(event.created);

    return {
      kind: "refunded",
      paymentIntentId: paymentIntent,
      eventCreatedAt: Number.isFinite(cree)
        ? new Date(cree * 1000)
        : new Date(),
    };
  }

  return null;
}
