export type PaidAccessInput = {
  /** `Share.priceCents`. Null ou zéro = rien à payer. */
  priceCents: number | null;
  /** L'adresse prouvée par le flux de code à usage unique, ou null. */
  verifiedEmail: string | null;
  /** Les paiements de CE transfert, tels quels. */
  payments: { email: string; revokedAt: Date | null }[];
};

// Une fonction pure plutôt qu'une méthode du garde : c'est la seule façon de
// l'éprouver sans monter un contexte d'exécution Nest, et c'est le moule que
// le dépôt suit déjà (voir utils/signInMethod.util.ts).
export function isPaidFor({
  priceCents,
  verifiedEmail,
  payments,
}: PaidAccessInput): boolean {
  if (!priceCents) return true;
  if (!verifiedEmail) return false;

  const cherchee = verifiedEmail.trim().toLowerCase();

  return payments.some(
    (paiement) =>
      !paiement.revokedAt && paiement.email.trim().toLowerCase() === cherchee,
  );
}
