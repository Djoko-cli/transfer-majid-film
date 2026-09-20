import { SetMetadata } from "@nestjs/common";

export const REQUIRES_PAYMENT_KEY = "requiresPayment";

/**
 * Marque une route comme servant des OCTETS, donc soumise au paiement.
 *
 * Posée sur deux routes seulement : le zip et le fichier. Les métadonnées et
 * les miniatures restent ouvertes — la phase 0 a décidé qu'un destinataire
 * voit ce qu'il y a avant de payer.
 *
 * Un décorateur plutôt qu'un garde qui devine d'après l'URL : le garde résout
 * déjà deux noms de paramètre différents, une seconde règle implicite le
 * rendrait illisible. Ici, celui qui ajoutera une sixième route verra la
 * marque — ou son absence.
 */
export const RequiresPayment = () => SetMetadata(REQUIRES_PAYMENT_KEY, true);
