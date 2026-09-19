import * as https from "node:https";
import type { LookupFunction } from "node:net";
import { AVATAR_MAX_BYTES } from "../constants.ts";
import {
  assertPublicUrl,
  guardedLookup,
  UnsafeAvatarUrlError,
} from "./avatarUrl.guard.ts";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5_000;

// Extrait dans son propre module, sans NestJS, pour la même raison que les deux
// autres : pouvoir être exécuté tel quel par `node --test`. C'est ici que vit
// la règle « une fois, et l'envoi manuel gagne toujours ».
export function shouldIngest(
  user: { avatarUpdatedAt: Date | null } | null,
  pictureUrl?: string,
): boolean {
  // `user` peut être `null` : `OAuthService.signIn` le relit via
  // `prisma.user.findFirst`, qui rend `User | null`, dans un dépôt qui
  // compile en `strictNullChecks: false` — rien ne le signale à la
  // compilation. Le vérifier ici, plutôt que dans `AvatarService`, le rend
  // exécutable tel quel par `node --test` : c'est le seul endroit d'où ce
  // cas peut être couvert par un vrai test de régression, et non par un
  // script à usage unique.
  //
  // Un IdP hostile peut aussi poser un claim `picture` qui n'est pas une
  // chaîne (un tableau, par exemple) : le décodage du jeton n'est pas validé
  // au runtime, seul TypeScript croit que `picture` est une `string`. Sans ce
  // contrôle, `!!pictureUrl` serait vrai pour un tableau non vide, et
  // `new URL(tableau)` plus loin parserait sa coercition en chaîne — aucun
  // contournement des deux barrières en aval, mais une frontière qui ne
  // devrait pas être sûre par accident.
  return (
    !!user &&
    typeof pictureUrl === "string" &&
    pictureUrl !== "" &&
    user.avatarUpdatedAt === null
  );
}

export type AvatarFetcher = (url: URL) => Promise<Buffer>;

// Fabriqué plutôt qu'écrit en dur, sur le modèle de `makeGuardedLookup`
// (tâche 2) : c'est ce morceau qui porte toute la surface de sécurité réseau
// de cette tâche — la reliaison DNS mise à part, déjà couverte par
// avatarUrl.guard.spec.ts — et il ne peut pas être la seule pièce non
// couverte du module.
export function makeAvatarFetcher(deps?: {
  request?: typeof import("node:https").request;
  lookup?: LookupFunction;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}): AvatarFetcher {
  const requestFn = deps?.request ?? https.request;
  const lookup = deps?.lookup ?? guardedLookup;
  const maxBytes = deps?.maxBytes ?? AVATAR_MAX_BYTES;
  const maxRedirects = deps?.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = deps?.timeoutMs ?? FETCH_TIMEOUT_MS;

  function fetchOnce(url: URL, deadline: number, hop: number): Promise<Buffer> {
    if (hop > maxRedirects)
      return Promise.reject(new UnsafeAvatarUrlError("trop de redirections"));

    return new Promise<Buffer>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadlineTimer);
        fn();
      };

      const req = requestFn(
        url,
        // `lookup` est ce qui ferme la reliaison DNS : la vérification se
        // fait à l'instant où la socket utilise l'adresse, pas sur une
        // résolution séparée faite plus tôt.
        // `agent: false` : pas de réutilisation d'une socket keep-alive
        // qu'un autre appelant, non gardé, aurait mise au pot — l'agent
        // global ne tient pas compte de `lookup` dans la clé de son pool.
        { method: "GET", lookup, agent: false, timeout: timeoutMs },
        (response) => {
          const { statusCode, headers } = response;

          if (
            statusCode &&
            [301, 302, 303, 307, 308].includes(statusCode) &&
            headers.location
          ) {
            // On ne lira pas ce corps : pas de drainage illimité pour un
            // tiers qui accompagnerait sa redirection de plusieurs
            // gigaoctets. Pas de réutilisation keep-alive voulue non plus.
            req.destroy();
            let next: URL;
            try {
              // Chaque saut repasse par les mêmes règles : une redirection
              // est une URL fournie par un tiers, exactement comme la
              // première.
              next = assertPublicUrl(
                new URL(headers.location, url).toString(),
              );
            } catch (error) {
              return finish(() => reject(error as Error));
            }
            return finish(() => resolve(fetchOnce(next, deadline, hop + 1)));
          }

          if (statusCode !== 200) {
            req.destroy();
            return finish(() => reject(new Error(`statut ${statusCode}`)));
          }

          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            // On ne fait pas confiance au Content-Length annoncé : c'est la
            // lecture réelle qu'on coupe.
            if (size > maxBytes) {
              req.destroy();
              finish(() => reject(new Error("image trop lourde")));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => finish(() => resolve(Buffer.concat(chunks))));
          response.on("error", (error) => finish(() => reject(error)));
        },
      );

      // Une échéance réelle, fixée une fois pour tout l'appel (voir le
      // `return` de `makeAvatarFetcher` ci-dessous) et transmise telle
      // quelle à chaque saut de redirection — pas un délai d'inactivité.
      // L'option `timeout` ci-dessus est un `socket.setTimeout` : il se
      // réarme à chaque octet reçu, donc un pair qui envoie un octet toutes
      // les 4 999 ms — ou une chaîne de redirections dont chaque saut reste
      // sous ce délai — ne le déclenche jamais. C'est cette échéance-ci, et
      // elle seule, qui tient la promesse des 5 secondes.
      const deadlineTimer = setTimeout(
        () =>
          finish(() => {
            req.destroy();
            reject(new Error("délai dépassé"));
          }),
        Math.max(0, deadline - Date.now()),
      );

      req.on("timeout", () =>
        finish(() => req.destroy(new Error("délai dépassé"))),
      );
      req.on("error", (error) => finish(() => reject(error)));
      req.end();
    });
  }

  return (url: URL) => fetchOnce(url, Date.now() + timeoutMs, 0);
}

// L'usage réel : la fabrique par défaut, câblée sur `https.request` et
// `guardedLookup`. `AvatarService.ingestFromOidc` s'en sert telle quelle ;
// les tests passent leurs propres dépendances à `makeAvatarFetcher`, sans
// aucune connexion réseau.
export const fetchAvatarBytes: AvatarFetcher = makeAvatarFetcher();
