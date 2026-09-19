# Les photos de profil — plan d'implémentation

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les
> étapes utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** qu'un compte ait un visage — récupéré de l'annuaire OpenID quand il y
en a un, envoyé à la main sinon — et que ce visage remplace le rond gris de la
navbar.

**Architecture :** une colonne `User.avatarUpdatedAt` dont la non-nullité veut
dire « ce compte a une photo » et dont l'horodatage sert de cache-buster. Un
seul point d'écriture, `AvatarService.store()`, par lequel passent les deux
sources ; il ré-encode systématiquement en WebP carré 512 px, ce qui est ce qui
prouve que le fichier est une image. Trois routes sur `/api/users/me/avatar`,
toutes sur soi-même. La récupération OpenID est une requête sortante en arrière-
plan, bordée par un validateur d'adresse qui refuse au moment de la connexion,
pas avant.

**Pile :** NestJS 10 + Prisma (SQLite) et `sharp` côté serveur, Next.js 14 Pages
Router + Mantine 6 côté client, tests système en collection Postman exécutée par
Newman, tests unitaires par le runner intégré de Node.

**Spec :** [`docs/photos-de-profil.md`](photos-de-profil.md). Le plan argumente
depuis elle ; lire les deux.

---

## Contraintes globales

Elles s'appliquent implicitement à **chaque** tâche.

- **Branche `chantier/photos-de-profil`**, créée depuis `main` au commit
  `7373564b`. Ne jamais commiter sur `main`.
- **Le chemin du dépôt contient un `:`** (`.../Dev/js:nodejs/...`), qui est le
  séparateur de `PATH`. `npx` et `npm run` échouent en « command not found ».
  Toujours appeler `./node_modules/.bin/<outil>` depuis le workspace concerné.
  Si un ajout au `PATH` est indispensable, il doit être **relatif**
  (`PATH="./node_modules/.bin:$PATH"`) : une entrée absolue contient le
  deux-points et se scinde en deux chemins morts.
- **ESLint s'invoque à l'inverse selon le workspace.** Dans `frontend/` :
  `ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint <fichiers>`. Dans
  `backend/` : **sans** cette variable.
- **Ne jamais lancer `npm run test:system` tel quel.** Son script commence par
  `prisma migrate reset -f`, ce qui détruit la base de développement de Majid.
  Toujours l'exécuter avec `DATABASE_URL=file:../data/system-test.db` et
  `BACKEND_PORT=8081` (voir la tâche 4 pour la ligne exacte).
- **`prisma migrate dev` échoue en non-interactif** dans ce dépôt. Fabriquer la
  migration avec `migrate diff` vers un dossier créé à la main, puis
  `migrate deploy` (tâche 1).
- **Un champ de DTO sans `@Expose()` disparaît silencieusement** de toutes les
  réponses : `UserDTO.from()` sérialise avec `excludeExtraneousValues: true`
  (`backend/src/user/dto/user.dto.ts:88`).
- **Jamais de `pkill` large.** Il a déjà coupé le serveur de développement de
  Majid. Cibler un PID précis.
- **Valeurs exactes, non négociables :** sortie **512 × 512**, WebP **qualité
  82**, entrée acceptée **5 × 1024 × 1024 octets**, `limitInputPixels`
  **50 000 000**, **3** redirections au maximum, **5 000 ms** de délai total.
- **La copie visible par l'utilisateur vouvoie.** `fr-FR.ts` et `en-US.ts` sont
  mis à jour **ensemble**, dans le même commit.
- **Le dépôt est sous `~/Documents`, synchronisé par iCloud**, qui fabrique des
  copies `<nom> 2.ts` dans `src/`. Elles sont compilées et lintées. Si un
  résultat de build ou de lint paraît inexplicable, lancer
  `find backend/src frontend/src -name "* [0-9].*"` **avant** de suspecter le
  code.
- **Signer chaque commit** avec la ligne d'attribution que tes propres
  instructions te donnent.

---

## Structure des fichiers

**Créés — back :**

| Fichier | Responsabilité |
|---|---|
| `backend/src/avatar/avatarUrl.guard.ts` | Pur, sans NestJS : valide une URL et refuse toute adresse non publique. C'est la pièce qui porte le risque. |
| `backend/src/avatar/avatarUrl.guard.spec.ts` | Ses tests, exécutés par `node --test`. |
| `backend/src/avatar/avatarImage.ts` | Pur, sans NestJS : `encodeAvatar(bytes) → Buffer` WebP 512 px. |
| `backend/src/avatar/avatarImage.spec.ts` | Ses tests. |
| `backend/src/avatar/avatar.service.ts` | Orchestration : disque, Prisma, récupération OpenID. |
| `backend/src/avatar/avatar.controller.ts` | Les trois routes. |
| `backend/src/avatar/avatar.module.ts` | Câblage ; exporte `AvatarService`. |
| `backend/src/i18n/fr-FR/avatar.json`, `backend/src/i18n/en-US/avatar.json` | Messages d'erreur. |
| `backend/prisma/migrations/<horodatage>_user_avatar/migration.sql` | La colonne. |

Les deux modules `avatarUrl.guard.ts` et `avatarImage.ts` sont **volontairement
dépourvus de toute dépendance NestJS** : c'est ce qui les rend exécutables tels
quels par le runner de Node, sans framework de test.

**Créés — front :**

| Fichier | Responsabilité |
|---|---|
| `frontend/src/components/account/AvatarCard.tsx` | Le bloc « photo de profil » de la page « mon compte ». |

**Modifiés :** `backend/prisma/schema.prisma`, `backend/src/constants.ts`,
`backend/src/main.ts`, `backend/src/app.module.ts`,
`backend/src/user/dto/user.dto.ts`, `backend/src/user/user.module.ts`,
`backend/src/user/user.service.ts`,
`backend/src/oauth/provider/genericOidc.provider.ts`,
`backend/src/oauth/dto/oauthSignIn.dto.ts`, `backend/src/oauth/oauth.service.ts`,
`backend/src/oauth/oauth.module.ts`, `backend/tsconfig.json`,
`backend/package.json`, `backend/test/newman-system-tests.json`,
`.github/workflows/backend-system-tests.yml`,
`frontend/src/types/user.type.ts`, `frontend/src/services/user.service.ts`,
`frontend/src/components/header/ActionAvatar.tsx`,
`frontend/src/pages/account/index.tsx`,
`frontend/src/i18n/translations/fr-FR.ts`,
`frontend/src/i18n/translations/en-US.ts`.

---

## Décision prise en écrivant ce plan

**La spec suppose des tests unitaires ; le dépôt n'en a aucun.** Pas de Jest,
pas de configuration, pas un seul `.spec.ts` — la seule suite est Newman
(`backend/package.json`, script `test:system`). Or la spec fait reposer la
sécurité du chantier sur un validateur d'URL testé en unitaire.

**Décision : le runner intégré de Node, sans aucune dépendance nouvelle.**
Vérifié sur cette machine (Node 24.15) : `node --test "src/**/*.spec.ts"`
exécute des fichiers TypeScript directement, sans transpilation ni
configuration. Le drapeau `--experimental-strip-types` est ajouté pour que la
même commande fonctionne sur le `node:22` de la CI, où le déshabillage des types
n'est pas actif par défaut ; sur Node 24 il est accepté sans effet.

**Ce que ça coûte :** les fichiers de test doivent importer avec l'extension
(`from "./avatarUrl.guard.ts"`), ce que `tsc` refuse sans
`allowImportingTsExtensions` — d'où l'exclusion des `*.spec.ts` du `tsconfig`
(tâche 2). Les fichiers de test ne sont donc pas typés-vérifiés. C'est le prix,
il est payé sciemment, et il reste inférieur à celui d'ajouter Jest à un dépôt
qui n'en a jamais voulu.

**L'alternative écartée :** ajouter Jest, `ts-jest` et `@types/jest`. Plus de
confort, trois dépendances de développement et une configuration de plus, pour
un chantier que Majid a explicitement appelé un side quest.

---

## Tâche 1 : le socle — colonne, constantes, migration, DTO

**Fichiers :**
- Modifier : `backend/prisma/schema.prisma` (modèle `User`)
- Créer : `backend/prisma/migrations/<horodatage>_user_avatar/migration.sql`
- Modifier : `backend/src/constants.ts`
- Modifier : `backend/src/user/dto/user.dto.ts`
- Modifier : `frontend/src/types/user.type.ts`

**Interfaces :**
- Produit : la colonne `User.avatarUpdatedAt` (`DateTime?`), les constantes
  `AVATAR_DIRECTORY` et `AVATAR_MAX_BYTES`, et le champ `avatarUpdatedAt` exposé
  par `UserDTO` et déclaré côté front.

- [ ] **Étape 1 : ajouter la colonne au schéma**

Dans `backend/prisma/schema.prisma`, modèle `User`, juste après
`canCreatePermanentShares` :

```prisma
  // Non-nulle veut dire « ce compte a une photo » ; le chemin du fichier s'en
  // déduit (AVATAR_DIRECTORY/<id>.webp), il n'a pas à être stocké. L'horodatage
  // sert aussi de cache-buster : la navbar demande l'image avec `?v=<ms>`, donc
  // changer de photo change l'URL et contourne un cache posé à un an.
  avatarUpdatedAt DateTime?
```

- [ ] **Étape 2 : fabriquer la migration à la main**

`prisma migrate dev` échoue en non-interactif dans ce dépôt. Depuis `backend/` :

```bash
mkdir -p "prisma/migrations/$(date +%Y%m%d%H%M%S)_user_avatar"
```

puis, dans le dossier ainsi créé, écrire `migration.sql` avec la sortie de :

```bash
cd backend && ./node_modules/.bin/prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

- [ ] **Étape 3 : appliquer et régénérer**

```bash
cd backend && ./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/prisma generate
```

Attendu : `1 migration found`, appliquée, puis `Generated Prisma Client`.

- [ ] **Étape 4 : ajouter les constantes**

Dans `backend/src/constants.ts`, juste après `BRAND_IMAGE_DIRECTORY` (ligne 62) :

```ts
// Un fichier par compte, nommé par son identifiant : AVATAR_DIRECTORY/<id>.webp.
// Même volume que SHARE_DIRECTORY, donc rien de plus à monter en production.
export const AVATAR_DIRECTORY = `${DATA_DIRECTORY}/avatars`;
// Ce qu'on accepte en entrée, avant ré-encodage. En dur et pas dans la table de
// configuration : ce n'est pas un réglage d'exploitation, personne ne le
// tournera, et un réglage que personne ne tourne est une case de plus à lire
// dans la console d'administration pour rien.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
```

- [ ] **Étape 5 : exposer le champ dans le DTO**

Dans `backend/src/user/dto/user.dto.ts`, après `totpVerified` :

```ts
  // `@Expose()` n'est pas décoratif : `from()` sérialise avec
  // `excludeExtraneousValues: true`, donc un champ sans lui disparaît de toutes
  // les réponses sans la moindre erreur.
  @Expose()
  avatarUpdatedAt?: Date;
```

- [ ] **Étape 6 : déclarer le champ côté front**

Dans `frontend/src/types/user.type.ts`, dans `type User`, après
`notifyOnSentShares` :

```ts
  // Sérialisé en ISO 8601 par le DTO. Non-nul = ce compte a une photo.
  avatarUpdatedAt?: string;
```

- [ ] **Étape 7 : vérifier**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit
```

Attendu : aucune sortie.

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit
```

Attendu : aucune sortie.

Puis, serveur de développement lancé, avec une session ouverte :

```bash
curl -s -b "<cookie de session>" http://localhost:8080/api/users/me | python3 -m json.tool | grep avatarUpdatedAt
```

Attendu : `"avatarUpdatedAt": null`. **Si la ligne est absente, le `@Expose()`
manque** — c'est exactement le mode d'échec que l'étape 5 prévient.

- [ ] **Étape 8 : commiter**

```bash
git add backend/prisma frontend/src/types/user.type.ts backend/src/constants.ts backend/src/user/dto/user.dto.ts
git commit
```

Message : ce que la colonne veut dire et pourquoi elle porte un horodatage
plutôt qu'un booléen.

---

## Tâche 2 : le validateur d'adresse, et le harnais qui le teste

C'est la pièce dangereuse du chantier : elle décide si le serveur accepte
d'aller chercher une URL fournie par un annuaire tiers, derrière lequel il y a
le réseau privé du NAS. Elle est écrite en premier et testée en premier.

**Fichiers :**
- Créer : `backend/src/avatar/avatarUrl.guard.ts`
- Créer : `backend/src/avatar/avatarUrl.guard.spec.ts`
- Modifier : `backend/tsconfig.json`
- Modifier : `backend/package.json`
- Modifier : `.github/workflows/backend-system-tests.yml`

**Interfaces :**
- Produit :
  - `class UnsafeAvatarUrlError extends Error`
  - `isPublicAddress(address: string): boolean`
  - `assertPublicUrl(raw: string): URL` — lève `UnsafeAvatarUrlError`
  - `makeGuardedLookup(resolve?): lookup` — fabrique, le paramètre n'existe que
    pour les tests
  - `guardedLookup` — `makeGuardedLookup()`, à passer tel quel dans les options
    de `https.request`

- [ ] **Étape 1 : ouvrir la porte aux fichiers de test**

Dans `backend/tsconfig.json`, ajouter au premier niveau (frère de
`compilerOptions`) :

```json
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
```

Sans ça, `tsc --noEmit` refuse l'import à extension `.ts` des fichiers de test.

**Ne pas toucher `tsconfig.build.json`** : il étend `tsconfig.json` mais
**écrase** `exclude`, et le sien contient déjà `**/*spec.ts`. C'est précisément
pourquoi les fichiers de test de ce chantier s'appellent `*.spec.ts` et non
`*.test.ts` — le suffixe que la configuration de build de ce dépôt exclut
déjà. `nest build` les ignore donc sans qu'on ait à le lui dire.

Dans `backend/package.json`, ajouter aux `scripts` :

```json
    "test:unit": "node --experimental-strip-types --test \"src/**/*.spec.ts\"",
```

Le motif est **entre guillemets** : c'est Node qui l'étend, pas le shell. Le
drapeau sert au `node:22` de la CI, où le déshabillage des types n'est pas actif
par défaut ; sur le Node 24 de l'image Docker il est accepté sans effet.

- [ ] **Étape 2 : écrire les tests qui échouent**

Créer `backend/src/avatar/avatarUrl.guard.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicUrl,
  isPublicAddress,
  makeGuardedLookup,
  UnsafeAvatarUrlError,
} from "./avatarUrl.guard.ts";

test("accepte les adresses publiques", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"])
    assert.equal(isPublicAddress(ip), true, ip);
});

test("refuse toute adresse non publique", () => {
  const refusees = [
    "0.0.0.0",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.169.254", // metadonnees cloud : la cible classique
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1", // la meme, en forme hexadecimale
  ];
  for (const ip of refusees) assert.equal(isPublicAddress(ip), false, ip);
});

test("refuse ce qui n'est pas une adresse", () => {
  for (const s of ["", "localhost", "pas-une-ip"])
    assert.equal(isPublicAddress(s), false, s);
});

test("n'accepte que https", () => {
  assert.throws(() => assertPublicUrl("http://example.com/a.png"), UnsafeAvatarUrlError);
  assert.throws(() => assertPublicUrl("file:///etc/passwd"), UnsafeAvatarUrlError);
  assert.throws(() => assertPublicUrl("data:image/png;base64,AAAA"), UnsafeAvatarUrlError);
  assert.doesNotThrow(() => assertPublicUrl("https://example.com/a.png"));
});

test("refuse les identifiants dans l'URL", () => {
  assert.throws(
    () => assertPublicUrl("https://user:motdepasse@example.com/a.png"),
    UnsafeAvatarUrlError,
  );
});

test("refuse une URL malformee", () => {
  assert.throws(() => assertPublicUrl("pas une url"), UnsafeAvatarUrlError);
});

test("le resolveur refuse un nom qui pointe vers une adresse privee", (_, done) => {
  // La reliaison DNS est exactement ce cas : le nom est irreprochable, la
  // reponse ne l'est pas. Le refus doit venir du resolveur, pas de l'URL.
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) =>
    cb(null, "127.0.0.1", 4)) as any);
  lookup("rebind.example.com", {}, (err: Error | null) => {
    assert.ok(err instanceof UnsafeAvatarUrlError, "devrait refuser");
    done();
  });
});

test("le resolveur refuse si UNE SEULE des adresses rendues est privee", (_, done) => {
  // Avec `all: true`, dns.lookup rend un tableau. En accepter un seul element
  // sans verifier les autres serait le trou evident.
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) =>
    cb(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ])) as any);
  lookup("mixte.example.com", { all: true }, (err: Error | null) => {
    assert.ok(err instanceof UnsafeAvatarUrlError, "devrait refuser");
    done();
  });
});

test("le resolveur laisse passer une adresse publique", (_, done) => {
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) =>
    cb(null, "93.184.216.34", 4)) as any);
  lookup("example.com", {}, (err: Error | null, address?: string) => {
    assert.equal(err, null);
    assert.equal(address, "93.184.216.34");
    done();
  });
});

test("refuse une adresse litterale non publique dans l'URL", () => {
  assert.throws(() => assertPublicUrl("https://127.0.0.1/a.png"), UnsafeAvatarUrlError);
  assert.throws(() => assertPublicUrl("https://[::1]/a.png"), UnsafeAvatarUrlError);
  assert.throws(
    () => assertPublicUrl("https://169.254.169.254/latest/meta-data"),
    UnsafeAvatarUrlError,
  );
});
```

- [ ] **Étape 3 : les faire échouer**

```bash
cd backend && npm run test:unit
```

Attendu : `Cannot find module './avatarUrl.guard.ts'`.

- [ ] **Étape 4 : écrire le validateur**

Créer `backend/src/avatar/avatarUrl.guard.ts` :

```ts
import { lookup as dnsLookup, LookupAddress } from "node:dns";
import { isIP } from "node:net";

// Sans dépendance NestJS, volontairement : c'est ce qui rend ce module
// exécutable tel quel par `node --test`, sans framework ni transpilation.
export class UnsafeAvatarUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// Tout ce qui n'a rien à faire au bout d'une requête sortante déclenchée par un
// tiers. 169.254/16 mérite une mention : c'est là que vivent les métadonnées
// d'instance chez tous les hébergeurs, et c'est la cible canonique d'un SSRF.
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    const value = ipv4ToInt(address);
    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }

  if (family === 6) {
    const normalised = address.toLowerCase();

    // Une IPv4 déguisée reste une IPv4 : ::ffff:127.0.0.1 et ::ffff:7f00:1
    // désignent la même boucle locale, et seule la première forme se repère à
    // l'œil. Les deux sont ramenées à leur adresse v4.
    const dotted = normalised.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPublicAddress(dotted[1]);
    const hex = normalised.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPublicAddress(
        [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
      );
    }

    if (normalised === "::" || normalised === "::1") return false;

    const head = parseInt(normalised.split(":")[0] || "0", 16);
    if ((head & 0xfe00) === 0xfc00) return false; // fc00::/7  unique local
    if ((head & 0xffc0) === 0xfe80) return false; // fe80::/10 lien local
    if ((head & 0xff00) === 0xff00) return false; // ff00::/8  multicast
    return true;
  }

  return false;
}

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeAvatarUrlError("URL malformée");
  }
  if (url.protocol !== "https:")
    throw new UnsafeAvatarUrlError(`protocole refusé : ${url.protocol}`);
  if (url.username || url.password)
    throw new UnsafeAvatarUrlError("identifiants dans l'URL");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host))
    throw new UnsafeAvatarUrlError(`adresse non publique : ${host}`);

  return url;
}

// Passé dans les options de `https.request`, ce résolveur fait la vérification
// à l'instant où la socket utilise l'adresse. C'est ce qui ferme la reliaison
// DNS : un contrôle fait sur un `lookup` séparé, puis suivi d'un `connect`,
// laisse une fenêtre où le nom résout vers une adresse publique pendant le test
// et vers 127.0.0.1 pendant la connexion.
// Fabriqué plutôt qu'écrit en dur pour que le résolveur soit remplaçable dans
// les tests : c'est ce morceau-là qui ferme la reliaison DNS, il ne peut pas
// être la seule pièce non couverte du module.
export function makeGuardedLookup(resolve: typeof dnsLookup = dnsLookup) {
  return ((
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address?: any, family?: number) => void,
) => {
  resolve(hostname, options, (err: any, address: any, family?: number) => {
    if (err) return callback(err);
    const resolved: LookupAddress[] = Array.isArray(address)
      ? address
      : [{ address, family } as LookupAddress];
    for (const entry of resolved) {
      if (!isPublicAddress(entry.address))
        return callback(
          new UnsafeAvatarUrlError(
            `${hostname} résout vers une adresse non publique : ${entry.address}`,
          ) as NodeJS.ErrnoException,
        );
    }
    callback(null, address, family);
  });
}) as any;
}

export const guardedLookup = makeGuardedLookup();
```

- [ ] **Étape 5 : les faire passer**

```bash
cd backend && npm run test:unit
```

Attendu : `pass 10`, `fail 0`.

- [ ] **Étape 6 : vérifier que rien d'autre n'a cassé**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src/avatar
```

Attendu : aucune sortie. **Ne pas** poser `ESLINT_USE_FLAT_CONFIG` ici : c'est
le workspace `backend/`, qui a sa propre configuration plate.

- [ ] **Étape 7 : brancher la CI**

Dans `.github/workflows/backend-system-tests.yml`, insérer une étape **avant**
`Run Server and Test with Newman` :

```yaml
      - name: Run unit tests
        working-directory: ./backend
        run: npm run test:unit
```

- [ ] **Étape 8 : commiter**

```bash
git add backend/src/avatar backend/tsconfig.json backend/package.json .github/workflows/backend-system-tests.yml
git commit
```

Message : dire que le dépôt n'avait aucun test unitaire, que celui-ci arrive
sans dépendance, et pourquoi c'est ce module-là qui en méritait un.

---

## Tâche 3 : le pipeline d'image

**Fichiers :**
- Créer : `backend/src/avatar/avatarImage.ts`
- Créer : `backend/src/avatar/avatarImage.spec.ts`

**Interfaces :**
- Consomme : rien des tâches précédentes.
- Produit : `encodeAvatar(bytes: Buffer): Promise<Buffer>` et
  `class UndecodableAvatarError extends Error`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `backend/src/avatar/avatarImage.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { encodeAvatar, UndecodableAvatarError } from "./avatarImage.ts";

async function sourceJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 90, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

test("sort un WebP carre de 512 px, quelle que soit la source", async () => {
  for (const [w, h] of [
    [3000, 2000],
    [800, 2400],
    [512, 512],
    [64, 64], // plus petite que la cible : agrandie, jamais laissee telle quelle
  ] as Array<[number, number]>) {
    const out = await encodeAvatar(await sourceJpeg(w, h));
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "webp", `${w}x${h}`);
    assert.equal(meta.width, 512, `${w}x${h}`);
    assert.equal(meta.height, 512, `${w}x${h}`);
  }
});

test("ne garde aucune metadonnee de la source", async () => {
  const withExif = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .withExif({ IFD0: { Copyright: "Majid", Software: "test" } })
    .jpeg()
    .toBuffer();

  const meta = await sharp(await encodeAvatar(withExif)).metadata();
  assert.equal(meta.exif, undefined);
});

test("refuse un SVG", async () => {
  // sharp sait lire le SVG, et c'est precisement le probleme : un SVG est un
  // document a parseur, pas une image. Voir le commentaire dans avatarImage.ts.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
    "utf8",
  );
  await assert.rejects(() => encodeAvatar(svg), UndecodableAvatarError);
});

test("refuse ce qui n'est pas une image", async () => {
  await assert.rejects(
    () => encodeAvatar(Buffer.from("ceci n'est pas une image", "utf8")),
    UndecodableAvatarError,
  );
  await assert.rejects(() => encodeAvatar(Buffer.alloc(0)), UndecodableAvatarError);
});

test("refuse une bombe a decompression", async () => {
  // 9000 x 9000 = 81 Mpx, au-dela de limitInputPixels (50 Mpx), et quelques
  // dizaines de Ko seulement sur un aplat.
  const bombe = await sharp({
    create: { width: 9000, height: 9000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await assert.rejects(() => encodeAvatar(bombe), UndecodableAvatarError);
});
```

- [ ] **Étape 2 : les faire échouer**

```bash
cd backend && npm run test:unit
```

Attendu : `Cannot find module './avatarImage.ts'`.

- [ ] **Étape 3 : écrire le pipeline**

Créer `backend/src/avatar/avatarImage.ts` :

```ts
import sharp from "sharp";

// Sans dépendance NestJS, comme avatarUrl.guard.ts et pour la même raison.
export class UndecodableAvatarError extends Error {}

// Ce que la sortie fait, et pourquoi il n'existe pas de chemin « stocker tel
// quel » :
//  - le type est prouvé par le décodage, jamais cru sur parole d'un en-tête que
//    l'appelant contrôle ;
//  - ce qui sort est une image que sharp a écrite, donc un fichier piégé ne
//    survit pas au passage ;
//  - toutes les métadonnées sautent, coordonnées GPS comprises, ce qui est le
//    comportement voulu pour une image qu'un compte expose de lui-même ;
//  - `limitInputPixels` borne la bombe à décompression : une image de 100 Ko
//    qui se déplie en 81 Mpx est refusée avant d'être allouée.
const SIDE = 512;
const QUALITY = 82;
const MAX_INPUT_PIXELS = 50_000_000;

// sharp sait lire le SVG, et on ne veut pas de cette porte. Un SVG n'est pas
// une image, c'est un document XML rendu par un moteur complet : il peut
// reference des ressources externes, ce qui rouvre par la bande le SSRF que le
// validateur d'URL ferme a l'autre bout, et il pese sur un parseur bien plus
// large que celui d'un PNG. Aucune photo de profil n'a besoin d'etre
// vectorielle. Le format est lu avant tout traitement, donc avant tout
// rendu.
const REFUSED_FORMATS = new Set(["svg"]);

export async function encodeAvatar(bytes: Buffer): Promise<Buffer> {
  try {
    const { format } = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    if (!format || REFUSED_FORMATS.has(format))
      throw new UndecodableAvatarError(`format refusé : ${format ?? "inconnu"}`);

    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      // Sans argument : applique l'orientation EXIF puis la jette. Sans lui,
      // une photo prise au téléphone en portrait arrive couchée.
      .rotate()
      // `attention` laisse sharp choisir la région saillante plutôt que le
      // centre géométrique : gratuit, et ça rattrape les portraits décentrés.
      .resize(SIDE, SIDE, { fit: "cover", position: "attention" })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch (error) {
    if (error instanceof UndecodableAvatarError) throw error;
    throw new UndecodableAvatarError(
      error instanceof Error ? error.message : String(error),
    );
  }
}
```

- [ ] **Étape 4 : les faire passer**

```bash
cd backend && npm run test:unit
```

Attendu : `fail 0`, et le compte de tests monté de 4 par rapport à la tâche 2.

- [ ] **Étape 5 : prouver que sharp fonctionne dans l'image Docker**

`sharp` est déclaré dans `backend/package.json:66` **et n'est importé nulle
part** dans le dépôt actuel — les miniatures passent par ffmpeg. Rien ne l'a
donc jamais exercé en production. Une dépendance déclarée n'est pas une
dépendance qui fonctionne.

```bash
docker build -t transfer-sharp-check . \
  && docker run --rm --entrypoint node transfer-sharp-check \
     -e 'const s=require("/opt/app/backend/node_modules/sharp"); s({create:{width:8,height:8,channels:3,background:{r:1,g:2,b:3}}}).webp().toBuffer().then(b=>console.log("sharp OK dans l_image,", b.length, "octets"))'
```

Attendu : `sharp OK dans l_image, <n> octets`.

**Si cette étape échoue**, c'est que le binaire musl n'est pas installé :
s'arrêter et remonter le problème plutôt que contourner. Le lockfile contient
bien `@img/sharp-linuxmusl-x64`, l'image de base est `node:24-alpine`
(`Dockerfile:15`) et la cible est `linux/amd64`
(`docker-build-push.yml:70`) — la vérification devrait passer, mais elle n'a
jamais été faite.

- [ ] **Étape 6 : commiter**

```bash
git add backend/src/avatar
git commit
```

---

## Tâche 4 : le service, les trois routes, et le parseur borné

**Fichiers :**
- Créer : `backend/src/avatar/avatar.service.ts`
- Créer : `backend/src/avatar/avatar.controller.ts`
- Créer : `backend/src/avatar/avatar.module.ts`
- Créer : `backend/src/i18n/fr-FR/avatar.json`, `backend/src/i18n/en-US/avatar.json`
- Modifier : `backend/src/main.ts` (après la ligne 53)
- Modifier : `backend/src/app.module.ts`
- Modifier : `backend/src/user/user.module.ts`
- Modifier : `backend/src/user/user.service.ts` (méthode `delete`, ligne 341)
- Modifier : `backend/test/newman-system-tests.json`

**Interfaces :**
- Consomme : `AVATAR_DIRECTORY`, `AVATAR_MAX_BYTES` (tâche 1),
  `encodeAvatar`, `UndecodableAvatarError` (tâche 3).
- Produit :
  - `AvatarService.store(userId: string, bytes: Buffer): Promise<Date>`
  - `AvatarService.read(userId: string): Promise<ReadStream>` — lève `NotFoundException`
  - `AvatarService.remove(userId: string): Promise<void>` — idempotente
  - `AvatarModule`, qui **exporte** `AvatarService`

- [ ] **Étape 1 : les messages i18n**

`backend/src/i18n/fr-FR/avatar.json` :

```json
{
  "empty": "Aucune image reçue.",
  "undecodable": "Ce fichier n'est pas une image que nous savons lire.",
  "notFound": "Ce compte n'a pas de photo de profil."
}
```

`backend/src/i18n/en-US/avatar.json` :

```json
{
  "empty": "No image received.",
  "undecodable": "This file is not an image we can read.",
  "notFound": "This account has no profile picture."
}
```

Aucune configuration à toucher : `nest-cli.json` copie déjà `i18n/**/*` avec
`watchAssets: true`.

- [ ] **Étape 2 : écrire le service**

Créer `backend/src/avatar/avatar.service.ts` :

```ts
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createReadStream, ReadStream } from "fs";
import * as fs from "fs/promises";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../prisma/prisma.service";
import { AVATAR_DIRECTORY } from "../constants";
import { encodeAvatar } from "./avatarImage";

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  private path(userId: string) {
    return `${AVATAR_DIRECTORY}/${userId}.webp`;
  }

  // Le seul point d'écriture d'un avatar dans tout le code. Les deux sources —
  // l'envoi manuel et la récupération OpenID — passent par ici, sans exception.
  async store(userId: string, bytes: Buffer): Promise<Date> {
    const encoded = await encodeAvatar(bytes);
    await fs.mkdir(AVATAR_DIRECTORY, { recursive: true });
    await fs.writeFile(this.path(userId), encoded);
    const { avatarUpdatedAt } = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUpdatedAt: new Date() },
      select: { avatarUpdatedAt: true },
    });
    return avatarUpdatedAt;
  }

  async read(userId: string): Promise<ReadStream> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUpdatedAt: true },
    });
    if (!user?.avatarUpdatedAt)
      throw new NotFoundException(this.i18n.t("avatar.notFound"));
    return createReadStream(this.path(userId));
  }

  // Idempotente des deux côtés : un compte sans photo se supprime sans erreur,
  // et un fichier déjà absent ne fait pas échouer l'appel. C'est ce qui permet
  // à UserService.delete de l'appeler sans se demander s'il y avait une photo.
  async remove(userId: string): Promise<void> {
    await fs.rm(this.path(userId), { force: true });
    await this.prisma.user.updateMany({
      where: { id: userId, avatarUpdatedAt: { not: null } },
      data: { avatarUpdatedAt: null },
    });
  }
}
```

- [ ] **Étape 3 : écrire le contrôleur**

Créer `backend/src/avatar/avatar.controller.ts` :

```ts
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import { I18nService } from "nestjs-i18n";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { UserDTO } from "../user/dto/user.dto";
import { AvatarService } from "./avatar.service";
import { UndecodableAvatarError } from "./avatarImage";

// Toutes les routes sont sur soi-même : l'identifiant vient du jeton, jamais
// d'un paramètre. Il n'existe donc aucun chemin qui serve l'avatar d'un autre
// compte, ce qui est la forme la plus simple de la règle « visible par son seul
// propriétaire ».
@Controller("users/me/avatar")
export class AvatarController {
  constructor(
    private avatar: AvatarService,
    private i18n: I18nService,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  async upload(@GetUser() user: User, @Req() request: Request) {
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0)
      throw new BadRequestException(this.i18n.t("avatar.empty"));

    try {
      const avatarUpdatedAt = await this.avatar.store(user.id, bytes);
      return new UserDTO().from({ ...user, avatarUpdatedAt });
    } catch (error) {
      if (error instanceof UndecodableAvatarError)
        throw new BadRequestException(this.i18n.t("avatar.undecodable"));
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtGuard)
  async read(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    const stream = await this.avatar.read(user.id);
    response.set({
      "Content-Type": "image/webp",
      // Un an et `immutable` ne sont corrects que parce que le front demande
      // toujours l'URL avec `?v=<avatarUpdatedAt en ms>` : changer de photo
      // change `v`, donc change l'URL, donc contourne ce cache. `private`
      // parce que l'image appartient à un compte et n'a rien à faire dans un
      // cache partagé.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    return new StreamableFile(stream);
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async remove(@GetUser() user: User) {
    await this.avatar.remove(user.id);
  }
}
```

- [ ] **Étape 4 : écrire le module et le câbler**

Créer `backend/src/avatar/avatar.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AvatarController } from "./avatar.controller";
import { AvatarService } from "./avatar.service";

@Module({
  controllers: [AvatarController],
  providers: [AvatarService],
  // Exporté parce que deux autres modules en dépendent : UserModule, pour
  // effacer le fichier à la suppression d'un compte, et OAuthModule, pour la
  // récupération OpenID (tâche 5).
  exports: [AvatarService],
})
export class AvatarModule {}
```

Dans `backend/src/app.module.ts`, ajouter `AvatarModule` à la liste des
`imports` (à côté de `UserModule`, ligne 46) et son `import` en tête de fichier.

Dans `backend/src/user/user.module.ts`, ajouter `AvatarModule` aux `imports`.

- [ ] **Étape 5 : le parseur borné au chemin**

Dans `backend/src/main.ts`, juste après le `app.use` existant (qui se termine
ligne 53) :

```ts
  // Le parseur ci-dessus ne traite que `application/octet-stream` et se cale sur
  // `share.chunkSize`. S'en servir pour les avatars coupleraient deux limites
  // sans rapport : un admin qui baisse la taille de chunk casserait l'envoi de
  // photos sans jamais faire le lien. Celui-ci est borné au seul chemin
  // concerné, et porte sa propre limite.
  //
  // Le chemin contient `/api` parce que `setGlobalPrefix("api")` est appelé
  // plus bas : Express filtre sur l'URL réellement reçue, pas sur la route Nest.
  app.use(
    "/api/users/me/avatar",
    bodyParser.raw({ type: "image/*", limit: AVATAR_MAX_BYTES }),
  );
```

Ajouter `AVATAR_MAX_BYTES` à l'import existant depuis `./constants`.

- [ ] **Étape 6 : effacer le fichier à la suppression d'un compte**

Dans `backend/src/user/user.service.ts`, méthode `delete` : injecter
`AvatarService` dans le constructeur, puis, juste avant
`return await this.prisma.user.delete(...)` (ligne 364) :

```ts
    // Prisma n'a pas de hook pour ça, et un avatar orphelin ne se retrouve
    // jamais tout seul : son nom est l'identifiant d'un compte qui n'existe
    // plus. `remove` est idempotente, donc pas de test préalable à écrire.
    await this.avatar.remove(id);
```

- [ ] **Étape 7 : les tests système**

Ajouter un dossier `[Avatar]` à `backend/test/newman-system-tests.json`, après
le dossier `[Auth]`. Sept requêtes, dans cet ordre — elles s'appuient sur la
session ouverte par `_setup` :

| Nom | Méthode / URL | Corps | Assertions |
|---|---|---|---|
| `Upload avatar` | `POST {{API_URL}}/users/me/avatar` | fichier PNG de test, `Content-Type: image/png` | statut `200` ; `pm.response.json().avatarUpdatedAt` n'est pas nul |
| `Get avatar` | `GET {{API_URL}}/users/me/avatar` | — | statut `200` ; en-tête `Content-Type` vaut `image/webp` ; `pm.response.responseSize > 0` |
| `Upload avatar - not an image` | `POST {{API_URL}}/users/me/avatar` | `Content-Type: image/png`, octets `"pas une image"` | statut `400` |
| `Get avatar - anonymous` | `GET {{API_URL_ANON}}/users/me/avatar` | — | statut `401` |
| `Delete avatar` | `DELETE {{API_URL}}/users/me/avatar` | — | statut `204` |
| `Get avatar - after delete` | `GET {{API_URL}}/users/me/avatar` | — | statut `404` |
| `Delete avatar - already absent` | `DELETE {{API_URL}}/users/me/avatar` | — | statut `204` (idempotence) |

**La requête anonyme a deux conditions, pas une.** Le pot à cookies de Newman
est indexé par hôte : `localhost` rejoue les cookies, `127.0.0.1` non. Il faut
donc **à la fois** viser `{{API_URL_ANON}}` **et** retirer l'en-tête à la main,
en pré-requête :

```js
pm.request.headers.remove((h) => h.key.toLowerCase() === "cookie");
```

**Le corps binaire passe par un fichier, pas par une pré-requête.** Postman ne
sait pas composer un corps binaire depuis un script, et un PNG n'est pas de
l'UTF-8 valide, donc le mode `raw` ne convient pas. Le SVG, qui aurait été
l'astuce texte évidente, est explicitement refusé par le pipeline (tâche 3).

Créer le fixture — 94 octets, généré, pas copié d'ailleurs :

```bash
cd backend && mkdir -p test/fixtures && node -e '
const sharp = require("sharp");
sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 100, b: 40 } } })
  .png().toFile("test/fixtures/avatar.png").then(() => console.log("fixture écrit"));'
```

Dans la collection, les deux requêtes d'envoi portent :

```json
"body": { "mode": "file", "file": { "src": "test/fixtures/avatar.png" } }
```

pour `Upload avatar`, et pour `Upload avatar - not an image` :

```json
"body": { "mode": "raw", "raw": "ceci n'est pas une image" }
```

avec, dans les deux cas, un en-tête `Content-Type: image/png` — c'est lui qui
fait retenir la requête par le parseur borné à cette route, et le serveur ne le
croit pas sur parole pour autant.

Newman résout `src` depuis son répertoire de travail : l'invocation de l'étape 8
porte donc `--working-dir .` depuis `backend/`.

- [ ] **Étape 8 : vérifier**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src
```

Attendu : aucune sortie.

**Lancer la suite système sur une base jetable**, jamais celle de
développement :

```bash
cd backend && DATABASE_URL=file:../data/system-test.db BACKEND_PORT=8081 \
  PATH="./node_modules/.bin:$PATH" ./node_modules/.bin/prisma migrate deploy \
  && DATABASE_URL=file:../data/system-test.db BACKEND_PORT=8081 \
  PATH="./node_modules/.bin:$PATH" ./node_modules/.bin/nest start &
```

puis, le serveur répondant sur 8081 :

```bash
cd backend && ./node_modules/.bin/newman run ./test/newman-system-tests.json \
  --working-dir . \
  --env-var API_URL=http://localhost:8081/api \
  --env-var API_URL_ANON=http://127.0.0.1:8081/api
```

Les deux variables existent déjà dans la collection, pointées sur le port 8080 ;
une variable d'environnement passée en ligne de commande les surclasse. C'est ce
qui permet de viser le serveur jetable du port 8081 sans toucher au fichier.

Attendu : `failures: 0`, et le total d'assertions monté de 9 par rapport à
l'état d'avant la tâche. **Reporter ce compte dans le rapport de tâche** — un
compte que personne n'a produit n'est pas un résultat.

Arrêter le serveur par son PID précis. **Jamais de `pkill` large.**

- [ ] **Étape 9 : commiter**

```bash
git add backend/src backend/test
git commit
```

---

## Tâche 5 : la récupération OpenID

**Fichiers :**
- Modifier : `backend/src/oauth/provider/genericOidc.provider.ts` (interface
  `OidcIdToken` ligne 508, méthode `getUserInfo` ligne 159)
- Modifier : `backend/src/oauth/dto/oauthSignIn.dto.ts`
- Modifier : `backend/src/oauth/oauth.service.ts` (lignes 67 et 186)
- Modifier : `backend/src/oauth/oauth.module.ts`
- Modifier : `backend/src/avatar/avatar.service.ts`
- Créer : `backend/src/avatar/avatar.fetch.ts`
- Créer : `backend/src/avatar/avatar.fetch.spec.ts`

**Interfaces :**
- Consomme : `assertPublicUrl`, `guardedLookup`, `UnsafeAvatarUrlError`
  (tâche 2) ; `AvatarService.store` (tâche 4).
- Produit : `AvatarService.ingestFromOidc(user: { id: string;
  avatarUpdatedAt: Date | null }, pictureUrl?: string): Promise<void>` — ne
  rejette jamais.

- [ ] **Étape 1 : déclarer le claim**

Dans `backend/src/oauth/provider/genericOidc.provider.ts`, interface
`OidcIdToken` (ligne 508), ajouter après `preferred_username` :

```ts
  // Claim standard OpenID Connect. Il arrivait déjà dans le jeton décodé ; il
  // n'était simplement lu par personne.
  picture?: string;
```

Dans `getUserInfo` (ligne 159), ajouter `pictureUrl: idTokenData.picture` à
l'objet retourné.

Dans `backend/src/oauth/dto/oauthSignIn.dto.ts` :

```ts
  // Renseigné par les seuls fournisseurs qui passent par un jeton OpenID :
  // l'OIDC générique, Google et Microsoft, qui étendent tous les trois
  // GenericOidcProvider. GitHub et Discord implémentent l'interface
  // directement et exposent leur avatar par leur propre API — hors périmètre.
  pictureUrl?: string;
```

- [ ] **Étape 2 : écrire les tests qui échouent**

Créer `backend/src/avatar/avatar.fetch.spec.ts`. Ces tests couvrent la décision
de récupérer ou non ; la récupération réseau elle-même est couverte par les
tests d'`avatarUrl.guard.ts`, qui portent le risque.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldIngest } from "./avatar.fetch.ts";

test("ne recupere que si le compte n'a pas deja une photo", () => {
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, "https://x/a.png"), true);
  assert.equal(shouldIngest({ avatarUpdatedAt: new Date() }, "https://x/a.png"), false);
});

test("ne recupere pas sans URL", () => {
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, undefined), false);
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, ""), false);
});
```

- [ ] **Étape 3 : écrire la décision, puis la récupération**

Créer `backend/src/avatar/avatar.fetch.ts` :

```ts
// Extrait dans son propre module, sans NestJS, pour la même raison que les deux
// autres : pouvoir être exécuté tel quel par `node --test`. C'est ici que vit
// la règle « une fois, et l'envoi manuel gagne toujours ».
export function shouldIngest(
  user: { avatarUpdatedAt: Date | null },
  pictureUrl?: string,
): boolean {
  return !!pictureUrl && user.avatarUpdatedAt === null;
}
```

Puis ajouter à `backend/src/avatar/avatar.service.ts` :

```ts
import * as https from "node:https";
import { AVATAR_MAX_BYTES } from "../constants";
import {
  assertPublicUrl,
  guardedLookup,
  UnsafeAvatarUrlError,
} from "./avatarUrl.guard";
import { shouldIngest } from "./avatar.fetch";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5_000;
```

et, dans la classe :

```ts
  // Appelée sans `await` depuis OAuthService : une photo n'a pas le droit de
  // ralentir une connexion, encore moins de la faire échouer. Elle ne rejette
  // donc jamais — tout échec est journalisé et la personne enverra sa photo à
  // la main.
  //
  // Tant que la colonne reste nulle, la tentative est rejouée à la connexion
  // suivante. C'est assumé : une requête sortante en arrière-plan par
  // connexion, bornée à cinq secondes, plutôt qu'une colonne de plus dont le
  // seul rôle serait de mémoriser un échec.
  async ingestFromOidc(
    user: { id: string; avatarUpdatedAt: Date | null },
    pictureUrl?: string,
  ): Promise<void> {
    if (!shouldIngest(user, pictureUrl)) return;
    try {
      // `shouldIngest` a déjà établi que l'URL est présente, mais TypeScript ne
      // rétrécit pas à travers un appel de fonction — et ce dépôt compile avec
      // `strictNullChecks: false`, donc l'erreur ne se verrait pas ici.
      const url = assertPublicUrl(pictureUrl as string);
      await this.store(user.id, await this.fetchBytes(url));
    } catch (error) {
      this.logger.warn(
        `Avatar OpenID non récupéré pour ${user.id} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private fetchBytes(url: URL, hop = 0): Promise<Buffer> {
    if (hop > MAX_REDIRECTS)
      return Promise.reject(new UnsafeAvatarUrlError("trop de redirections"));

    return new Promise<Buffer>((resolve, reject) => {
      const request = https.request(
        url,
        // `lookup` est ce qui ferme la reliaison DNS : la vérification se fait
        // à l'instant où la socket utilise l'adresse, pas sur une résolution
        // séparée faite plus tôt.
        { method: "GET", lookup: guardedLookup, timeout: FETCH_TIMEOUT_MS },
        (response) => {
          const { statusCode, headers } = response;

          if (
            statusCode &&
            [301, 302, 303, 307, 308].includes(statusCode) &&
            headers.location
          ) {
            response.resume();
            let next: URL;
            try {
              // Chaque saut repasse par les mêmes règles : une redirection est
              // une URL fournie par un tiers, exactement comme la première.
              next = assertPublicUrl(new URL(headers.location, url).toString());
            } catch (error) {
              return reject(error);
            }
            return resolve(this.fetchBytes(next, hop + 1));
          }

          if (statusCode !== 200) {
            response.resume();
            return reject(new Error(`statut ${statusCode}`));
          }

          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            // On ne fait pas confiance au Content-Length annoncé : c'est la
            // lecture réelle qu'on coupe.
            if (size > AVATAR_MAX_BYTES) {
              request.destroy();
              reject(new Error("image trop lourde"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => resolve(Buffer.concat(chunks)));
          response.on("error", reject);
        },
      );

      request.on("timeout", () => request.destroy(new Error("délai dépassé")));
      request.on("error", reject);
      request.end();
    });
  }
```

- [ ] **Étape 4 : brancher les deux points d'accroche**

Dans `backend/src/oauth/oauth.module.ts`, ajouter `AvatarModule` aux `imports`.

Dans `backend/src/oauth/oauth.service.ts`, injecter `AvatarService`, puis :

— dans `signIn`, après que `updatedUser` soit relu (ligne 67-72), avant le
`return` :

```ts
      // Sans `await` : la connexion ne doit dépendre en rien de cette requête.
      void this.avatar.ingestFromOidc(updatedUser, user.pictureUrl);
```

— dans `signUp`, après la création de l'`oAuthUser` (ligne 181-188), avant
`return result` :

```ts
      void this.avatar.ingestFromOidc(
        { id: result.user.id, avatarUpdatedAt: null },
        user.pictureUrl,
      );
```

- [ ] **Étape 5 : vérifier**

```bash
cd backend && npm run test:unit && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src
```

Attendu : `fail 0`, puis aucune sortie.

**Vérification manuelle de la récupération réelle**, avec un serveur local
servant une image sur `https://` — ou, plus simple et suffisant, en appelant
directement le service depuis un script à usage unique dans le répertoire de
brouillon, sur trois URL : une image publique réelle, `https://127.0.0.1/a.png`,
et `https://169.254.169.254/latest/meta-data`. Attendu : la première stocke, les
deux autres sont refusées **avant toute connexion** et journalisées en `warn`.

- [ ] **Étape 6 : commiter**

```bash
git add backend/src
git commit
```

---

## Tâche 6 : le front

**Fichiers :**
- Créer : `frontend/src/components/account/AvatarCard.tsx`
- Modifier : `frontend/src/services/user.service.ts`
- Modifier : `frontend/src/components/header/ActionAvatar.tsx` (ligne 21)
- Modifier : `frontend/src/pages/account/index.tsx` (avant le `<Paper p="xl">`
  de la ligne 189)
- Modifier : `frontend/src/i18n/translations/fr-FR.ts`,
  `frontend/src/i18n/translations/en-US.ts`

**Interfaces :**
- Consomme : `avatarUpdatedAt` sur `User` (tâche 1) et les trois routes
  (tâche 4).
- Produit : `userService.uploadAvatar(file: File): Promise<void>`,
  `userService.deleteAvatar(): Promise<void>`, et le composant `<AvatarCard />`.

- [ ] **Étape 1 : le service**

Dans `frontend/src/services/user.service.ts`, après `cancelEmailChange` :

```ts
// Le `File` part tel quel, avec son propre type : le serveur ne le croit pas
// sur parole — il le passe à sharp, qui décode ou refuse — mais c'est ce type
// qui fait retenir la requête par le parseur borné à cette route.
const uploadAvatar = async (file: File) => {
  await api.post("/users/me/avatar", file, {
    headers: { "Content-Type": file.type },
  });
};

const deleteAvatar = async () => {
  await api.delete("/users/me/avatar");
};
```

Les ajouter à l'export par défaut du module.

- [ ] **Étape 2 : la navbar**

Dans `frontend/src/components/header/ActionAvatar.tsx`, remplacer la ligne 21
(`<Avatar size={28} />`) par `<Avatar size={28} radius="xl" src={avatarSrc} />`,
et ajouter au-dessus du `return` :

```tsx
  // `radius="xl"` est le cercle : Mantine 6 rend un carré arrondi par défaut.
  // Sans photo, `src` vaut `undefined` et Mantine retombe sur son propre
  // placeholder — c'est-à-dire exactement l'affichage d'avant ce chantier.
  // `?v=` est ce qui rend correct le cache d'un an posé par la route.
  const avatarSrc = user?.avatarUpdatedAt
    ? `/api/users/me/avatar?v=${new Date(user.avatarUpdatedAt).getTime()}`
    : undefined;
```

- [ ] **Étape 3 : le bloc de la page « mon compte »**

Créer `frontend/src/components/account/AvatarCard.tsx` :

```tsx
import { Avatar, Button, FileButton, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import userService from "../../services/user.service";
import toast from "../../utils/toast.util";

// Doit rester identique à AVATAR_MAX_BYTES côté serveur. Vérifier ici évite de
// téléverser 40 Mo pour se les faire refuser à l'arrivée — ce qui, sur une
// connexion montante ordinaire, est une minute perdue pour rien.
const MAX_BYTES = 5 * 1024 * 1024;

const AvatarCard = () => {
  const { user, refreshUser } = useUser();
  const t = useTranslate();
  const [busy, setBusy] = useState(false);

  const src = user?.avatarUpdatedAt
    ? `/api/users/me/avatar?v=${new Date(user.avatarUpdatedAt).getTime()}`
    : undefined;

  const upload = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("account.card.avatar.too-large"));
      return;
    }
    setBusy(true);
    try {
      await userService.uploadAvatar(file);
      await refreshUser();
      toast.success(t("account.card.avatar.saved"));
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await userService.deleteAvatar();
      await refreshUser();
      toast.success(t("account.card.avatar.removed"));
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper p="xl">
      <Title order={5} mb="xs">
        <FormattedMessage id="account.card.avatar.title" />
      </Title>
      <Group align="center" spacing="xl">
        <Avatar size={96} radius="xl" src={src} />
        <Stack spacing="xs">
          <Text size="sm" color="dimmed">
            <FormattedMessage id="account.card.avatar.description" />
          </Text>
          <Group spacing="xs">
            <FileButton
              onChange={upload}
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            >
              {(props) => (
                <Button {...props} loading={busy} variant="light">
                  <FormattedMessage id="account.card.avatar.change" />
                </Button>
              )}
            </FileButton>
            {src && (
              <Button color="red" variant="subtle" loading={busy} onClick={remove}>
                <FormattedMessage id="account.card.avatar.remove" />
              </Button>
            )}
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
};

export default AvatarCard;
```

Dans `frontend/src/pages/account/index.tsx`, l'insérer **avant** le
`<Paper p="xl">` de la ligne 189, à l'intérieur du `<Container size="sm">` et
sous le `<Title order={3}>` :

```tsx
          <AvatarCard />
```

puis ajouter un `mt="lg"` au `<Paper p="xl">` qui le suit, pour conserver
l'espacement entre blocs déjà en vigueur plus bas dans la page.

- [ ] **Étape 4 : les traductions**

Dans `frontend/src/i18n/translations/fr-FR.ts`, à côté du bloc
`account.card.info.*` (ligne 116) :

```ts
  "account.card.avatar.title": "Photo de profil",
  "account.card.avatar.description":
    "Elle remplace l'icône de votre compte. Elle n'est visible que par vous. 5 Mo au maximum.",
  "account.card.avatar.change": "Choisir une photo",
  "account.card.avatar.remove": "Retirer",
  "account.card.avatar.saved": "Photo de profil enregistrée.",
  "account.card.avatar.removed": "Photo de profil retirée.",
  "account.card.avatar.too-large": "Cette image dépasse 5 Mo.",
```

Dans `frontend/src/i18n/translations/en-US.ts`, au même endroit :

```ts
  "account.card.avatar.title": "Profile picture",
  "account.card.avatar.description":
    "It replaces your account icon. Only you can see it. 5 MB maximum.",
  "account.card.avatar.change": "Choose a picture",
  "account.card.avatar.remove": "Remove",
  "account.card.avatar.saved": "Profile picture saved.",
  "account.card.avatar.removed": "Profile picture removed.",
  "account.card.avatar.too-large": "That image is over 5 MB.",
```

- [ ] **Étape 5 : vérifier**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit \
  && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint src/components/account/AvatarCard.tsx src/components/header/ActionAvatar.tsx src/pages/account/index.tsx src/services/user.service.ts
```

Attendu : aucune sortie.

**Puis en navigateur**, connecté sur `http://localhost:3333/account` avec
`testadmin@example.com` / `TestPassword123!` — le champ de connexion de l'API
s'appelle `email`, pas `emailOrUsername` :

1. envoyer une photo rectangulaire ; vérifier qu'elle apparaît **ronde** dans le
   bloc **et** dans la navbar, **sans rechargement de page** ;
2. mesurer que l'image servie fait bien 512 × 512 :
   `document.querySelector('.mantine-Avatar-image').naturalWidth` ;
3. la retirer ; vérifier que les deux emplacements retombent sur le rond gris ;
4. tenter un fichier de plus de 5 Mo ; vérifier que le toast apparaît et
   qu'**aucune requête** ne part (onglet réseau) ;
5. refaire l'étape 1 à 375 px de large.

**Joindre une capture avant/après** au rapport de tâche.

- [ ] **Étape 6 : commiter**

```bash
git add frontend/src
git commit
```

---

## Vérification finale, avant d'ouvrir la PR

- [ ] `cd backend && npm run test:unit` — `fail 0`
- [ ] `cd backend && ./node_modules/.bin/tsc --noEmit` — aucune sortie
- [ ] `cd backend && ./node_modules/.bin/eslint src` — aucune sortie
- [ ] `cd frontend && ./node_modules/.bin/tsc --noEmit` — aucune sortie
- [ ] `cd frontend && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint src` — aucune sortie
- [ ] Suite Newman sur la base jetable — `failures: 0`, **avec le compte
      d'assertions reporté**
- [ ] `find backend/src frontend/src -name "* [0-9].*"` — aucune sortie (les
      doublons iCloud sont compilés et lintés comme les autres)
- [ ] La vérification Docker de la tâche 3, étape 5, repassée sur l'image finale
- [ ] `git log --oneline main..HEAD` — chaque commit porte sa ligne
      d'attribution
