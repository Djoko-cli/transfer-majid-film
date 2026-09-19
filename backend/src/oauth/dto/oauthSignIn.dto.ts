export interface OAuthSignInDto {
  provider: "github" | "google" | "microsoft" | "discord" | "oidc";
  providerId: string;
  providerUsername: string;
  email: string;
  isAdmin?: boolean;
  idToken?: string;
  // Renseigné par les seuls fournisseurs qui passent par un jeton OpenID :
  // l'OIDC générique, Google et Microsoft, qui étendent tous les trois
  // GenericOidcProvider. GitHub et Discord implémentent l'interface
  // directement et exposent leur avatar par leur propre API — hors périmètre.
  pictureUrl?: string;
}
