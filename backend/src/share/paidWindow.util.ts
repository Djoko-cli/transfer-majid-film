/**
 * La fin de la fenêtre d'accès garantie par un paiement.
 *
 * Payer achète un accès, pas un instant : si le transfert devait mourir avant,
 * il recule. Sans ça, un client qui paie le dernier jour a payé pour rien.
 */
export function computeAccessUntil(paidAt: Date, windowSeconds: number): Date {
  return new Date(paidAt.getTime() + windowSeconds * 1000);
}

/**
 * La nouvelle expiration du transfert, ou `null` s'il n'y a rien à changer.
 *
 * `null` plutôt que l'ancienne valeur pour que l'appelant sache s'il doit
 * écrire : une écriture inutile dans la transaction de paiement, c'est un
 * verrou SQLite pris pour rien.
 */
export function nextExpiration(
  current: Date,
  accessUntil: Date,
): Date | null {
  // L'epoch = « n'expire jamais » (convention du dépôt). Rien à reculer.
  if (current.getTime() === 0) return null;
  if (current.getTime() >= accessUntil.getTime()) return null;
  return accessUntil;
}
