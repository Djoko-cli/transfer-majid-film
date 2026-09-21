export type PaymentOutcome = {
  kind: "paid";
  shareId: string;
  email: string;
  amountCents: number;
  currency: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
};

export type RefundOutcome = { kind: "refunded"; paymentIntentId: string };

// Une fonction pure : c'est ce qui rend le webhook éprouvable sans réseau, et
// ce qui permet de le rejouer deux fois dans un test pour prouver que la
// contrainte d'unicité fait son travail.
export function interpretStripeEvent(
  event: { type: string; data: { object: Record<string, unknown> } },
): PaymentOutcome | RefundOutcome | null {
  const objet = event.data.object as Record<string, never>;

  if (event.type === "checkout.session.completed") {
    if (objet.payment_status !== "paid") return null;

    const shareId = (objet.metadata as Record<string, string> | null)?.shareId;
    const email = (objet.customer_details as { email?: string } | null)?.email;
    if (!shareId || !email) return null;

    const paymentIntent = objet.payment_intent;

    return {
      kind: "paid",
      shareId,
      // Normalisée ici et nulle part ailleurs : c'est cette valeur que le
      // garde comparera, et isPaidFor normalise des deux côtés.
      email: String(email).trim().toLowerCase(),
      amountCents: Number(objet.amount_total),
      currency: String(objet.currency),
      checkoutSessionId: String(objet.id),
      paymentIntentId:
        typeof paymentIntent === "string" ? paymentIntent : null,
    };
  }

  if (event.type === "charge.refunded") {
    const paymentIntent = objet.payment_intent;
    if (typeof paymentIntent !== "string") return null;
    return { kind: "refunded", paymentIntentId: paymentIntent };
  }

  return null;
}
