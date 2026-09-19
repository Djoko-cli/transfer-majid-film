// Extrait dans son propre module, sans NestJS, pour la même raison que les deux
// autres : pouvoir être exécuté tel quel par `node --test`. C'est ici que vit
// la règle « une fois, et l'envoi manuel gagne toujours ».
export function shouldIngest(
  user: { avatarUpdatedAt: Date | null },
  pictureUrl?: string,
): boolean {
  return !!pictureUrl && user.avatarUpdatedAt === null;
}
