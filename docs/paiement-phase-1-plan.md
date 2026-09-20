# Transfert payant — plan d'implémentation

> **Pour les exécutants agentiques :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** qu'un transfert puisse porter un prix, qu'un destinataire paie par
Stripe pour en télécharger les octets, et que le droit acquis appartienne à
l'adresse qui a payé plutôt qu'à son navigateur.

**Architecture :** le prix est une colonne sur `Share` ; le paiement est une
ligne `SharePayment` qui survit au transfert. `ShareSecurityGuard`, porte unique
depuis la phase 0, reçoit une question de plus, posée uniquement sur les deux
routes d'octets via un décorateur explicite. Stripe Checkout est hébergé : aucune
donnée de carte ne traverse l'instance.

**Pile :** NestJS, Prisma sur SQLite, Next.js 14, Mantine 6, Stripe Checkout.

**Spec :** [`docs/paiement-phase-1.md`](./paiement-phase-1.md) — à lire avant ce
plan, il en est l'argumentaire.

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées dans chacune.

- Le chemin du dépôt contient un deux-points (`js:nodejs`). `npx` et `npm run`
  y cassent leur résolution de PATH : appeler `./node_modules/.bin/<outil>`
  directement. Tout ajout au `PATH` doit être **relatif**.
- ESLint est inversé selon l'espace de travail : `frontend/` exige
  `ESLINT_USE_FLAT_CONFIG=false`, `backend/` ne doit **pas** l'avoir.
- **Ne jamais lancer `npm run test:system`** : il réinitialise la base de
  développement vivante. Les tests système tournent en CI.
- Les tests unitaires du backend sont des fichiers `*.spec.ts` exécutés par
  `node --experimental-strip-types --test`. Ils **importent avec l'extension
  `.ts`** (voir `backend/src/utils/signInMethod.spec.ts`).
- `tsconfig.build.json` **remplace** `exclude` au lieu de le fusionner et porte
  `**/*spec.ts` : c'est pourquoi les tests s'appellent `*.spec.ts` et pas
  autrement.
- Pas d'`esModuleInterop` dans ce dépôt : `import x from "cjs-pkg"` produit
  `undefined`. Importer en `import * as x` ou passer par un shim, comme le fait
  `backend/src/avatar/avatarImage.ts` pour `sharp`.
- Prisma sur **SQLite** : pas d'`enum`. Une colonne à valeurs fermées est une
  `String` documentée, comme `Share.storageProvider` (`schema.prisma:211`).
- Une nouvelle clé de `config.seed.ts` renvoie 404 en local tant que
  `./node_modules/.bin/ts-node prisma/seed/config.seed.ts` n'a pas été lancé.
  La production le fait au déploiement.
- **Tout réglage `obscured: true` porte aussi `secret: true`.** C'est ce qui
  tient la route publique `GET /api/configs` (spec §7).
- Les montants sont en **centimes entiers**. Aucun flottant ne touche de
  l'argent, nulle part.
- Messages de commit en anglais ; l'interface et la documentation en français.

---

# Partie A — le correctif des secrets

**Livrable indépendant.** Il ferme une fuite qui existe aujourd'hui, ne dépend
d'aucune ligne de Stripe, et peut partir seul. Spec §7.

---

### Tâche 1 : le panneau ne renvoie plus la valeur d'un secret

**Fichiers :**
- Créer : `backend/src/config/obscuredValue.util.ts`
- Créer : `backend/src/config/obscuredValue.spec.ts`
- Modifier : `backend/src/config/config.service.ts:522-531` (`getByCategory`)

**Interfaces :**
- Produit : `redactObscured<T extends { obscured: boolean; value: string | null; defaultValue: string }>(variable: T): T & { value: string | null; isSet: boolean }`

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `backend/src/config/obscuredValue.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { redactObscured } from "./obscuredValue.util.ts";

test("un réglage ordinaire garde sa valeur", () => {
  const out = redactObscured({
    obscured: false,
    value: "smtp.example.com",
    defaultValue: "",
  });
  assert.equal(out.value, "smtp.example.com");
  assert.equal(out.isSet, true);
});

test("un réglage ordinaire vide retombe sur son défaut", () => {
  const out = redactObscured({ obscured: false, value: null, defaultValue: "25" });
  assert.equal(out.value, "25");
});

test("un secret posé ne sort jamais, mais se déclare posé", () => {
  const out = redactObscured({
    obscured: true,
    value: "sk_live_tres_secret",
    defaultValue: "",
  });
  assert.equal(out.value, null);
  assert.equal(out.isSet, true);
});

test("un secret non posé se déclare non posé", () => {
  const out = redactObscured({ obscured: true, value: null, defaultValue: "" });
  assert.equal(out.value, null);
  assert.equal(out.isSet, false);
});

test("un secret dont la valeur est une chaîne vide est non posé", () => {
  // `update()` écrit null pour "", mais une base héritée peut porter "".
  const out = redactObscured({ obscured: true, value: "", defaultValue: "" });
  assert.equal(out.isSet, false);
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
cd backend && node --experimental-strip-types --test "src/config/obscuredValue.spec.ts"
```

Attendu : ÉCHEC, `Cannot find module './obscuredValue.util.ts'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

Créer `backend/src/config/obscuredValue.util.ts` :

```ts
// Un réglage `obscured` sort du service sans sa valeur, jamais avec.
//
// Le panneau d'administration en avait besoin pour remplir son champ ; il n'en
// a pas besoin pour permettre de le remplacer. La différence compte parce
// qu'une clé de paiement survit à l'application : la relire, c'est pouvoir
// débiter et rembourser depuis ailleurs. L'écraser ne prend rien à personne,
// ça casse les paiements — une panne, pas un vol.
//
// `isSet` est ce qui remplace la valeur à l'écran : sans lui, un champ vide
// veut dire « non posé » autant que « posé mais masqué », et l'administrateur
// ressaisit un secret qui était déjà là.
export function redactObscured<
  T extends { obscured: boolean; value: string | null; defaultValue: string },
>(variable: T): T & { value: string | null; isSet: boolean } {
  const effective = variable.value ?? variable.defaultValue;

  if (!variable.obscured) {
    return { ...variable, value: effective, isSet: !!effective };
  }

  return { ...variable, value: null, isSet: !!variable.value };
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
cd backend && node --experimental-strip-types --test "src/config/obscuredValue.spec.ts"
```

Attendu : 5 tests, 5 succès.

- [ ] **Étape 5 : brancher sur `getByCategory`**

Dans `backend/src/config/config.service.ts`, remplacer le corps du `.map()` de
`getByCategory` (`:527-531`) pour passer par la fonction. La ligne à supprimer
est exactement :

```ts
        value: variable.value ?? variable.defaultValue,
```

et le `return {` qui la précède devient :

```ts
      return {
        ...redactObscured(variable),
        key: `${variable.category}.${variable.name}`,
```

Ajouter l'import en tête de fichier :

```ts
import { redactObscured } from "./obscuredValue.util";
```

**Ne pas toucher à `list()` (`:567`).** Elle filtre sur `secret`, sert
`GET /api/configs` sans garde, et ne renvoie déjà aucun `obscured` — la tâche 2
pose le test qui verrouille cet invariant.

- [ ] **Étape 6 : vérifier en direct que le secret ne sort plus**

Le backend de développement tourne en watch. Se connecter et lire la catégorie
SMTP :

```bash
curl -s -c /tmp/cj -H 'Content-Type: application/json' -d '{"email":"testadmin@example.com","password":"TestPassword123!"}' http://localhost:8080/api/auth/signIn -o /dev/null && curl -s -b /tmp/cj http://localhost:8080/api/configs/admin/smtp | python3 -c "
import json,sys
for c in json.load(sys.stdin):
    if c.get('obscured'):
        print(c['key'], 'value=', repr(c['value']), 'isSet=', c.get('isSet'))"
```

Attendu : `value= None` pour chaque ligne, et `isSet` à `True` ou `False` selon
qu'un secret est posé.

- [ ] **Étape 7 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/tsc -p tsconfig.spec.json --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/src/config/obscuredValue.util.ts backend/src/config/obscuredValue.spec.ts backend/src/config/config.service.ts
git commit -m "Stop handing the admin panel the value of a secret"
```

---

### Tâche 2 : le panneau dit « défini », et l'invariant est verrouillé

**Fichiers :**
- Modifier : `frontend/src/types/config.type.ts:23`
- Modifier : `frontend/src/components/admin/configuration/AdminConfigInput.tsx:77-86`
- Modifier : `frontend/src/i18n/translations/fr-FR.ts`, `en-US.ts`
- Créer : `backend/prisma/seed/config.seed.spec.ts`

**Interfaces :**
- Consomme : `isSet: boolean` sur chaque réglage renvoyé par
  `GET /api/configs/admin/:category` (tâche 1).

- [ ] **Étape 1 : écrire le test d'invariant qui échoue**

Créer `backend/prisma/seed/config.seed.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { configVariables } from "./config.seed.ts";

test("tout réglage obscured est aussi secret", () => {
  // `list()` sert GET /api/configs SANS aucun garde et filtre sur `secret`,
  // pas sur `obscured` (config.service.ts:567, config.controller.ts:35-37).
  // Les onze réglages obscured d'aujourd'hui portent tous secret: true, donc
  // rien ne sort. C'est un couplage, pas une garantie : ce test est ce qui le
  // rend garanti.
  const fautifs: string[] = [];

  for (const [categorie, variables] of Object.entries(configVariables)) {
    for (const [nom, variable] of Object.entries(variables as object)) {
      const v = variable as { obscured?: boolean; secret?: boolean };
      if (v.obscured && !v.secret) fautifs.push(`${categorie}.${nom}`);
    }
  }

  assert.deepEqual(fautifs, []);
});
```

- [ ] **Étape 2 : lancer le test**

```bash
cd backend && node --experimental-strip-types --test "prisma/seed/config.seed.spec.ts"
```

Il échouera si `config.seed.ts` n'exporte pas `configVariables`. Dans ce cas,
ajouter l'export nommé sur l'objet déjà présent dans le fichier — **sans**
changer sa structure ni son contenu — puis relancer. Attendu ensuite : succès,
liste vide.

- [ ] **Étape 3 : ajouter `isSet` au type du front**

Dans `frontend/src/types/config.type.ts`, à côté de `obscured: boolean;` (`:23`) :

```ts
  // Renvoyé à la place de la valeur pour un réglage obscured : le panneau ne
  // reçoit plus le secret, seulement le fait qu'il y en ait un.
  isSet?: boolean;
```

- [ ] **Étape 4 : afficher l'état dans le champ**

Dans `AdminConfigInput.tsx`, la branche `configVariable.obscured` (`:77-86`)
reçoit un `placeholder` et une `description` :

```tsx
          <PasswordInput
            autoComplete="new-password"
            style={{
              width: "100%",
            }}
            // Le champ est vide par construction : le serveur ne renvoie plus
            // la valeur d'un secret. Sans ces deux lignes, « vide » se lit
            // « non posé » et l'administrateur ressaisit ce qui est déjà là.
            placeholder={
              configVariable.isSet
                ? t("admin.config.secret.set")
                : t("admin.config.secret.unset")
            }
            description={
              configVariable.isSet
                ? t("admin.config.secret.replace")
                : undefined
            }
            disabled={!configVariable.allowEdit}
            {...form.getInputProps("stringValue")}
            onChange={(e) => onValueChange(configVariable, e.target.value)}
          />
```

`t` vient de `useTranslate()` ; l'ajouter en tête du composant s'il n'y est pas
déjà.

- [ ] **Étape 5 : les traductions**

Dans `frontend/src/i18n/translations/fr-FR.ts` :

```ts
  "admin.config.secret.set": "•••••••• défini",
  "admin.config.secret.unset": "Non défini",
  "admin.config.secret.replace":
    "Laissez vide pour conserver la valeur actuelle. Saisissez pour la remplacer, effacez pour la supprimer.",
```

Dans `en-US.ts` :

```ts
  "admin.config.secret.set": "•••••••• set",
  "admin.config.secret.unset": "Not set",
  "admin.config.secret.replace":
    "Leave empty to keep the current value. Type to replace it, clear it to remove it.",
```

- [ ] **Étape 6 : vérifier en direct**

Ouvrir `http://localhost:3333/admin/config/smtp`. Attendu : le champ de mot de
passe est vide, son placeholder dit « •••••••• défini » si un mot de passe SMTP
est posé, et la description explique les trois gestes. Enregistrer **sans rien
toucher**, puis recharger : le placeholder dit toujours « défini » — la valeur
n'a pas été effacée.

- [ ] **Étape 7 : typecheck, lint, commit**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint 'src/**/*.ts' 'src/**/*.tsx'
cd ../backend && node --experimental-strip-types --test "prisma/seed/config.seed.spec.ts"
```

```bash
git add frontend/src/types/config.type.ts frontend/src/components/admin/configuration/AdminConfigInput.tsx frontend/src/i18n/translations/fr-FR.ts frontend/src/i18n/translations/en-US.ts backend/prisma/seed/config.seed.spec.ts backend/prisma/seed/config.seed.ts
git commit -m "Say that a secret is set instead of showing it"
```

**Fin de la partie A.** Elle est livrable en l'état : plus aucun secret ne sort
du panneau, et l'invariant qui protège la route publique est tenu par un test.

---

# Partie B — le modèle

---

### Tâche 3 : le prix et le paiement en base

**Fichiers :**
- Modifier : `backend/prisma/schema.prisma` (modèles `Share`, `User`)
- Créer : `backend/prisma/migrations/<horodatage>_paid_shares/migration.sql` (généré)

**Interfaces :**
- Produit : `Share.priceCents: number | null`, le modèle `SharePayment` tel
  qu'écrit ci-dessous, et la relation `User.sharePaymentsSold`.

- [ ] **Étape 1 : ajouter la colonne de prix sur `Share`**

Dans `backend/prisma/schema.prisma`, modèle `Share`, sous `removedReason`
(`:166`) :

```prisma
  // Null = gratuit, ce qui laisse tous les transferts existants intacts sans
  // migration de données. En centimes entiers : aucun flottant ne touche de
  // l'argent. Pas de colonne de devise ici — en v1 elle ne varie pas, et
  // c'est sur le paiement qu'elle a une valeur comptable.
  priceCents Int?
```

- [ ] **Étape 2 : ajouter le modèle `SharePayment`**

À la fin de `schema.prisma` :

```prisma
model SharePayment {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  // Nullable et SetNull : un transfert supprimé ne doit pas effacer la trace
  // de l'argent, sinon la facture numérotée du chantier futur n'aura plus rien
  // à facturer. `shareName` est dénormalisé pour que la ligne reste lisible
  // une fois la relation coupée.
  shareId   String?
  share     Share?  @relation("SharePayments", fields: [shareId], references: [id], onDelete: SetNull)
  shareName String?

  // L'adresse qui a payé : c'est elle, la portée EMAIL.
  email String

  // "EMAIL" en v1. "TRANSFER" et "SESSION" restent des valeurs admises par la
  // phase 0 pour la vente publique. Une String et non une enum : SQLite ne
  // laisse pas Prisma en déclarer — même convention que Share.storageProvider.
  scope String @default("EMAIL")

  // Le vendeur explicite voulu par la phase 0. Toujours l'administrateur en
  // v1, mais le modèle ne le suppose pas.
  sellerId String?
  seller   User?   @relation("SharePaymentSeller", fields: [sellerId], references: [id], onDelete: SetNull)

  // Ce qui a été réellement débité, pas ce qui était affiché.
  amountCents Int
  currency    String

  // La clé d'idempotence : Stripe réessaie ses webhooks et la page de retour
  // fait le même travail. L'unicité est ce qui fait que deux livraisons du
  // même événement ne créent qu'un droit.
  stripeCheckoutSessionId String  @unique
  stripePaymentIntentId   String?

  paidAt      DateTime
  accessUntil DateTime

  // Posé par le webhook charge.refunded. Un droit révoqué n'ouvre plus rien.
  revokedAt DateTime?

  @@index([shareId, email])
}
```

- [ ] **Étape 3 : déclarer les deux relations inverses**

Dans le modèle `Share`, à côté de `downloads ShareDownload[]` (`:210`) :

```prisma
  payments SharePayment[] @relation("SharePayments")
```

Dans le modèle `User`, à côté des autres relations :

```prisma
  sharePaymentsSold SharePayment[] @relation("SharePaymentSeller")
```

- [ ] **Étape 4 : générer la migration**

```bash
cd backend && ./node_modules/.bin/prisma migrate dev --name paid_shares
```

**Ne pas utiliser `prisma migrate diff --from-schema-datasource`** : il lit la
base de développement vivante, qui peut porter la migration d'une autre branche.

- [ ] **Étape 5 : vérifier que rien n'a bougé pour l'existant**

```bash
cd backend && sqlite3 data/transfer.db "SELECT COUNT(*) AS transferts, COUNT(priceCents) AS avec_prix FROM Share;"
```

Attendu : `avec_prix` vaut 0 — tous les transferts existants sont restés
gratuits.

- [ ] **Étape 6 : typecheck et commit**

```bash
cd backend && ./node_modules/.bin/prisma generate && ./node_modules/.bin/tsc --noEmit
```

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Carry a price on a transfer and a payment that outlives it"
```

---

# Partie C — la porte et la fenêtre

Éprouvées avec des lignes `SharePayment` posées à la main. Aucun Stripe encore.

---

### Tâche 4 : la porte demande si c'est payé

**Fichiers :**
- Créer : `backend/src/share/paidAccess.util.ts`
- Créer : `backend/src/share/paidAccess.spec.ts`
- Créer : `backend/src/share/decorator/requiresPayment.decorator.ts`
- Modifier : `backend/src/share/guard/shareSecurity.guard.ts`
- Modifier : `backend/src/file/file.controller.ts:119`, `:149`

**Interfaces :**
- Produit : `isPaidFor(input: PaidAccessInput): boolean`, le décorateur
  `@RequiresPayment()` et sa clé `REQUIRES_PAYMENT_KEY`.

```ts
export type PaidAccessInput = {
  priceCents: number | null;
  verifiedEmail: string | null;
  payments: { email: string; revokedAt: Date | null }[];
};
```

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `backend/src/share/paidAccess.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPaidFor } from "./paidAccess.util.ts";

const gratuit = { priceCents: null, verifiedEmail: null, payments: [] };

test("un transfert sans prix est toujours ouvert", () => {
  assert.equal(isPaidFor(gratuit), true);
});

test("un transfert avec prix est fermé sans adresse prouvée", () => {
  assert.equal(
    isPaidFor({ priceCents: 30000, verifiedEmail: null, payments: [] }),
    false,
  );
});

test("un transfert avec prix est fermé si personne n'a payé", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "client@example.com",
      payments: [],
    }),
    false,
  );
});

test("l'adresse qui a payé entre", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "client@example.com",
      payments: [{ email: "client@example.com", revokedAt: null }],
    }),
    true,
  );
});

test("une autre adresse n'entre pas", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "curieux@example.com",
      payments: [{ email: "client@example.com", revokedAt: null }],
    }),
    false,
  );
});

test("la casse et les espaces ne décident de rien", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "  Client@Example.COM ",
      payments: [{ email: "client@example.com", revokedAt: null }],
    }),
    true,
  );
});

test("un paiement remboursé n'ouvre plus", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "client@example.com",
      payments: [{ email: "client@example.com", revokedAt: new Date() }],
    }),
    false,
  );
});

test("un prix de zéro est un prix, pas une absence de prix", () => {
  // Convention explicite : 0 veut dire « gratuit mais commandé ». On le traite
  // comme gratuit pour ne pas exiger un paiement de zéro euro que Stripe
  // refuserait de toute façon.
  assert.equal(
    isPaidFor({ priceCents: 0, verifiedEmail: null, payments: [] }),
    true,
  );
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
cd backend && node --experimental-strip-types --test "src/share/paidAccess.spec.ts"
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : écrire l'implémentation**

Créer `backend/src/share/paidAccess.util.ts` :

```ts
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
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
cd backend && node --experimental-strip-types --test "src/share/paidAccess.spec.ts"
```

Attendu : 8 tests, 8 succès.

- [ ] **Étape 5 : créer le décorateur**

Créer `backend/src/share/decorator/requiresPayment.decorator.ts` :

```ts
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
```

- [ ] **Étape 6 : brancher le garde**

Dans `backend/src/share/guard/shareSecurity.guard.ts` :

1. Injecter `Reflector` dans le constructeur (`import { Reflector } from "@nestjs/core";`).
2. Élargir la requête Prisma de `canActivate` (`:76-84`) pour inclure les
   paiements :

```ts
      include: {
        security: true,
        userRecipients: { select: { userId: true } },
        recipients: { select: { email: true } },
        payments: { select: { email: true, revokedAt: true } },
      },
```

3. Juste avant le `return true` final de la méthode, ajouter :

```ts
    // Posée en dernier, après mot de passe et restriction : payer ne dispense
    // de rien d'autre. Les deux dérogations plus haut — administrateur et
    // créateur — sont volontairement AU-DESSUS : le vendeur doit pouvoir
    // télécharger son propre transfert payant sans payer.
    const exigePaiement = this.reflector.get<boolean>(
      REQUIRES_PAYMENT_KEY,
      context.getHandler(),
    );

    if (
      exigePaiement &&
      !isPaidFor({
        priceCents: share.priceCents,
        verifiedEmail: this.verificationService.getVerifiedEmail(request),
        payments: share.payments,
      })
    ) {
      throw new ForbiddenException(
        this.i18n.t("share.paymentRequired"),
        "share_payment_required",
      );
    }
```

`VerificationService` s'injecte comme les autres dépendances du garde ;
`ShareModule` doit importer `VerificationModule` s'il ne le fait pas déjà.

- [ ] **Étape 7 : marquer les deux routes**

Dans `backend/src/file/file.controller.ts`, ajouter `@RequiresPayment()` sous
le `@UseGuards(...)` de `@Get("zip")` (`:119`) et de `@Get(":fileId")` (`:149`).
**Ne pas la poser** sur `@Get(":fileId/thumbnail")` (`:237`).

- [ ] **Étape 8 : les messages**

Dans `backend/src/i18n/fr-FR/share.json` et `en-US/share.json`, à côté des
messages existants :

```json
  "paymentRequired": "Ce transfert doit être payé avant d'être téléchargé"
```

```json
  "paymentRequired": "This transfer has to be paid for before it can be downloaded"
```

- [ ] **Étape 9 : vérifier en direct, avec un paiement posé à la main**

```bash
cd backend
SHARE=$(sqlite3 data/transfer.db "SELECT id FROM Share WHERE isCollection=0 LIMIT 1;")
sqlite3 data/transfer.db "UPDATE Share SET priceCents=30000 WHERE id='$SHARE';"
```

Ouvrir la page du transfert dans le navigateur : les métadonnées et les
miniatures s'affichent, le téléchargement renvoie `403 share_payment_required`.
Puis :

```bash
sqlite3 data/transfer.db "INSERT INTO SharePayment (id, createdAt, shareId, email, scope, amountCents, currency, stripeCheckoutSessionId, paidAt, accessUntil) VALUES ('test-1', datetime('now'), '$SHARE', 'client@example.com', 'EMAIL', 30000, 'eur', 'cs_test_manuel', datetime('now'), datetime('now','+30 days'));"
```

Prouver l'adresse `client@example.com` par le flux de code (Mailpit sur
`http://localhost:8025`), puis retélécharger : `200`.

Remettre en état :

```bash
sqlite3 data/transfer.db "DELETE FROM SharePayment WHERE id='test-1'; UPDATE Share SET priceCents=NULL WHERE id='$SHARE';"
```

- [ ] **Étape 10 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/tsc -p tsconfig.spec.json --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/src/share backend/src/file/file.controller.ts backend/src/i18n
git commit -m "Ask at the single door whether the bytes have been paid for"
```

---

### Tâche 5 : la fenêtre garantie

**Fichiers :**
- Créer : `backend/src/share/paidWindow.util.ts`
- Créer : `backend/src/share/paidWindow.spec.ts`
- Modifier : `backend/prisma/seed/config.seed.ts` (catégorie `share`)
- Modifier : `backend/src/share/share.service.ts:516` (`remove`)

**Interfaces :**
- Consomme : `SharePayment.accessUntil` (tâche 3).
- Produit : `computeAccessUntil(paidAt: Date, windowSeconds: number): Date` et
  `nextExpiration(current: Date, accessUntil: Date): Date | null`.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `backend/src/share/paidWindow.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccessUntil, nextExpiration } from "./paidWindow.util.ts";

const JOUR = 86400;

test("la fenêtre part du paiement", () => {
  const paidAt = new Date("2026-01-01T12:00:00Z");
  const out = computeAccessUntil(paidAt, 30 * JOUR);
  assert.equal(out.toISOString(), "2026-01-31T12:00:00.000Z");
});

test("une expiration plus lointaine que la fenêtre ne bouge pas", () => {
  const expiration = new Date("2026-06-01T00:00:00Z");
  const accessUntil = new Date("2026-01-31T00:00:00Z");
  assert.equal(nextExpiration(expiration, accessUntil), null);
});

test("une expiration plus proche recule jusqu'à la fenêtre", () => {
  const expiration = new Date("2026-01-03T00:00:00Z");
  const accessUntil = new Date("2026-01-31T00:00:00Z");
  assert.equal(
    nextExpiration(expiration, accessUntil)?.toISOString(),
    "2026-01-31T00:00:00.000Z",
  );
});

test("un transfert permanent ne recule pas", () => {
  // L'epoch est la convention du dépôt pour « n'expire jamais » — voir
  // generateShareToken, qui compare avec moment(expiration).isSame(0).
  const permanent = new Date(0);
  const accessUntil = new Date("2026-01-31T00:00:00Z");
  assert.equal(nextExpiration(permanent, accessUntil), null);
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
cd backend && node --experimental-strip-types --test "src/share/paidWindow.spec.ts"
```

- [ ] **Étape 3 : écrire l'implémentation**

Créer `backend/src/share/paidWindow.util.ts` :

```ts
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
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
cd backend && node --experimental-strip-types --test "src/share/paidWindow.spec.ts"
```

Attendu : 4 tests, 4 succès.

- [ ] **Étape 5 : déclarer le réglage de durée**

Dans `backend/prisma/seed/config.seed.ts`, catégorie `share`, à côté de
`maxExpiration` :

```ts
    paidAccessWindow: {
      type: "timespan",
      defaultValue: "30 days",
      secret: false,
    },
```

Puis, en local uniquement :

```bash
cd backend && ./node_modules/.bin/ts-node prisma/seed/config.seed.ts
```

- [ ] **Étape 6 : refuser la suppression d'un transfert payé**

Dans `backend/src/share/share.service.ts`, au début de `remove` (`:516`),
ajouter un troisième paramètre `force = false` et, avant toute suppression :

```ts
    // Un transfert payé ne s'efface pas sous les pieds de celui qui a payé.
    // `force` est la confirmation explicite que la console demande, en
    // affichant combien de personnes ont payé et jusqu'à quand.
    if (!force) {
      const enCours = await this.prisma.sharePayment.count({
        where: {
          shareId,
          revokedAt: null,
          accessUntil: { gt: new Date() },
        },
      });

      if (enCours > 0)
        throw new BadRequestException(
          this.i18n.t("share.paidAccessStillRunning", {
            args: { count: enCours },
          }),
        );
    }
```

Messages, dans `backend/src/i18n/fr-FR/share.json` puis `en-US/share.json` :

```json
  "paidAccessStillRunning": "{count} personne(s) ont payé ce transfert et y ont encore accès. Supprimez-le explicitement si c'est bien ce que vous voulez."
```

```json
  "paidAccessStillRunning": "{count} person(s) paid for this transfer and still have access. Delete it explicitly if that is what you want."
```

- [ ] **Étape 7 : vérifier en direct**

Reposer un prix et un paiement comme à la tâche 4, puis tenter la suppression
depuis la console : refus avec le message et le compte. Supprimer le paiement,
retenter : la suppression passe.

- [ ] **Étape 8 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/tsc -p tsconfig.spec.json --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/src/share backend/src/i18n backend/prisma/seed/config.seed.ts
git commit -m "Let paying buy a window, not an instant"
```

---

# Partie D — Stripe

---

### Tâche 6 : les réglages et le client Stripe

**Fichiers :**
- Modifier : `backend/package.json` (dépendance `stripe`)
- Modifier : `backend/prisma/seed/config.seed.ts` (catégorie `stripe`)
- Créer : `backend/src/payment/stripe.service.ts`
- Créer : `backend/src/payment/payment.module.ts`

**Interfaces :**
- Produit : `StripeService.client(): Stripe`, `StripeService.isConfigured(): boolean`.

- [ ] **Étape 1 : installer la dépendance**

```bash
cd backend && ./node_modules/.bin/npm i stripe --save 2>/dev/null || npm i stripe --save
```

- [ ] **Étape 2 : déclarer les réglages**

Dans `backend/prisma/seed/config.seed.ts`, une catégorie `stripe` :

```ts
  stripe: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    secretKey: {
      type: "string",
      defaultValue: "",
      // Les DEUX drapeaux : `obscured` masque la valeur au panneau (tâche 1),
      // `secret` l'exclut de GET /api/configs, qui n'a aucun garde. L'un sans
      // l'autre laisserait la clé partir à des visiteurs anonymes.
      obscured: true,
      secret: true,
    },
    webhookSigningSecret: {
      type: "string",
      defaultValue: "",
      obscured: true,
      secret: true,
    },
  },
```

Le test d'invariant de la tâche 2 doit continuer à passer :

```bash
cd backend && node --experimental-strip-types --test "prisma/seed/config.seed.spec.ts"
```

- [ ] **Étape 3 : écrire le service**

Créer `backend/src/payment/stripe.service.ts` :

```ts
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import * as StripeNamespace from "stripe";
import { ConfigService } from "src/config/config.service";

// Pas d'esModuleInterop dans ce dépôt : `import Stripe from "stripe"` donne
// undefined à l'exécution. Même shim que backend/src/avatar/avatarImage.ts
// pour sharp — et le même piège, qui s'y était déguisé en « ce fichier n'est
// pas une image ».
const Stripe: typeof import("stripe").default =
  (StripeNamespace as unknown as { default?: typeof import("stripe").default })
    .default ?? (StripeNamespace as unknown as typeof import("stripe").default);

@Injectable()
export class StripeService {
  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return (
      this.config.get("stripe.enabled") && !!this.config.get("stripe.secretKey")
    );
  }

  // Construit à la demande plutôt que mis en cache : la clé peut changer
  // depuis la console, et un client gardé en mémoire continuerait d'utiliser
  // l'ancienne jusqu'au redémarrage.
  client(): import("stripe").default {
    const key = this.config.get("stripe.secretKey");
    if (!key)
      throw new InternalServerErrorException("stripe.secretKey is not set");
    return new Stripe(key);
  }
}
```

Créer `backend/src/payment/payment.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { StripeService } from "./stripe.service";

@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentModule {}
```

Déclarer `PaymentModule` dans les `imports` de `backend/src/app.module.ts`.

- [ ] **Étape 4 : vérifier que le shim tient**

```bash
cd backend && node --experimental-strip-types -e "
import * as ns from 'stripe';
const S = ns.default ?? ns;
console.log('constructeur:', typeof S);
console.log('instanciable:', typeof new S('sk_test_x') === 'object');
"
```

Attendu : `constructeur: function` et `instanciable: true`. Si `typeof` vaut
`object`, le shim est faux et **il faut le corriger ici**, pas plus tard : le
même défaut sur `sharp` a livré une panne silencieuse en production.

- [ ] **Étape 5 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/package.json backend/package-lock.json backend/prisma/seed/config.seed.ts backend/src/payment backend/src/app.module.ts
git commit -m "Add a Stripe client that reads its key from the console"
```

---

### Tâche 7 : ouvrir une session de paiement

**Fichiers :**
- Créer : `backend/src/payment/payment.controller.ts`
- Créer : `backend/src/payment/payment.service.ts`
- Modifier : `backend/src/payment/payment.module.ts`

**Interfaces :**
- Consomme : `StripeService` (tâche 6), `isPaidFor` (tâche 4).
- Produit : `POST /api/shares/:shareId/payment/session` → `{ url: string }`.

- [ ] **Étape 1 : écrire le service**

Créer `backend/src/payment/payment.service.ts` :

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { isPaidFor } from "src/share/paidAccess.util";
import { StripeService } from "./stripe.service";

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private stripe: StripeService,
    private readonly i18n: I18nService,
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
            product_data: { name: share.name ?? shareId },
          },
        },
      ],
      // Lu par le webhook comme par la page de retour : c'est ce qui rattache
      // le paiement au transfert sans faire confiance à l'URL de retour.
      metadata: { shareId },
      success_url: `${appUrl}/s/${shareId}?payment={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/s/${shareId}`,
    });

    return { url: session.url };
  }
}
```

- [ ] **Étape 2 : écrire le contrôleur**

Créer `backend/src/payment/payment.controller.ts` :

```ts
import { Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ShareIdValidationGuard } from "src/share/guard/shareIdValidation.guard";
import { VerificationService } from "src/verification/verification.service";
import { PaymentService } from "./payment.service";

@Controller("shares/:shareId/payment")
export class PaymentController {
  constructor(
    private paymentService: PaymentService,
    private verification: VerificationService,
  ) {}

  @Post("session")
  @UseGuards(ShareIdValidationGuard)
  async createSession(
    @Param("shareId") shareId: string,
    @Req() request: Request,
  ) {
    return this.paymentService.createSession(
      shareId,
      this.verification.getVerifiedEmail(request),
    );
  }
}
```

Déclarer `PaymentController` et `PaymentService` dans `payment.module.ts`, et
importer `VerificationModule`, `PrismaModule` et `ShareModule` selon ce que
l'injecteur réclame au démarrage.

- [ ] **Étape 3 : les messages**

`backend/src/i18n/fr-FR/payment.json` :

```json
{
  "notConfigured": "Le paiement n'est pas configuré sur cette instance",
  "notForSale": "Ce transfert n'a pas de prix",
  "alreadyPaid": "Ce transfert est déjà payé pour cette adresse"
}
```

`backend/src/i18n/en-US/payment.json` :

```json
{
  "notConfigured": "Payment is not configured on this instance",
  "notForSale": "This transfer has no price",
  "alreadyPaid": "This transfer is already paid for with this address"
}
```

- [ ] **Étape 4 : vérifier en direct, en mode test**

Poser les clés de test dans la console (`/admin/config/stripe`), mettre un prix
sur un transfert, puis :

```bash
curl -s -X POST "http://localhost:8080/api/shares/<ID>/payment/session" | python3 -m json.tool
```

Attendu : un objet portant une `url` en `https://checkout.stripe.com/...`.
L'ouvrir, payer avec `4242 4242 4242 4242`, date future, CVC quelconque.

- [ ] **Étape 5 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/src/payment backend/src/i18n
git commit -m "Open a Stripe Checkout session for a priced transfer"
```

---

### Tâche 8 : le webhook et la page de retour, idempotents

**Fichiers :**
- Créer : `backend/src/payment/stripeEvent.util.ts`
- Créer : `backend/src/payment/stripeEvent.spec.ts`
- Modifier : `backend/src/payment/payment.service.ts`
- Modifier : `backend/src/payment/payment.controller.ts`
- Modifier : `backend/src/main.ts` (corps brut sur la route du webhook)

**Interfaces :**
- Consomme : `computeAccessUntil`, `nextExpiration` (tâche 5).
- Produit : `interpretStripeEvent(event): PaymentOutcome | RefundOutcome | null`
  et `PaymentService.recordPayment(outcome)`.

```ts
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
```

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `backend/src/payment/stripeEvent.spec.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretStripeEvent } from "./stripeEvent.util.ts";

test("une session complétée et payée devient un paiement", () => {
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: 30000,
        currency: "eur",
        customer_details: { email: "Client@Example.com" },
        payment_intent: "pi_1",
        metadata: { shareId: "abc" },
      },
    },
  } as never);

  assert.deepEqual(out, {
    kind: "paid",
    shareId: "abc",
    email: "client@example.com",
    amountCents: 30000,
    currency: "eur",
    checkoutSessionId: "cs_test_1",
    paymentIntentId: "pi_1",
  });
});

test("une session complétée mais impayée ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_2",
        payment_status: "unpaid",
        metadata: { shareId: "abc" },
      },
    },
  } as never);
  assert.equal(out, null);
});

test("une session sans shareId ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_3",
        payment_status: "paid",
        amount_total: 100,
        currency: "eur",
        customer_details: { email: "a@b.co" },
        metadata: {},
      },
    },
  } as never);
  assert.equal(out, null);
});

test("un remboursement devient une révocation", () => {
  const out = interpretStripeEvent({
    type: "charge.refunded",
    data: { object: { payment_intent: "pi_1" } },
  } as never);
  assert.deepEqual(out, { kind: "refunded", paymentIntentId: "pi_1" });
});

test("un événement qui ne nous concerne pas ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "customer.created",
    data: { object: {} },
  } as never);
  assert.equal(out, null);
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
cd backend && node --experimental-strip-types --test "src/payment/stripeEvent.spec.ts"
```

- [ ] **Étape 3 : écrire l'interprétation**

Créer `backend/src/payment/stripeEvent.util.ts` avec les types ci-dessus et :

```ts
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
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
cd backend && node --experimental-strip-types --test "src/payment/stripeEvent.spec.ts"
```

Attendu : 5 tests, 5 succès.

- [ ] **Étape 5 : écrire l'enregistrement**

Dans `PaymentService`, ajouter :

```ts
  // Un upsert sur stripeCheckoutSessionId : le webhook et la page de retour
  // font le même travail, et Stripe réessaie. Celui qui arrive second ne doit
  // rien créer et rien casser.
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

    return this.prisma.$transaction(async (tx) => {
      const share = await tx.share.findUnique({
        where: { id: outcome.shareId },
        select: { id: true, name: true, expiration: true, creatorId: true },
      });
      if (!share) return null;

      const paiement = await tx.sharePayment.upsert({
        where: { stripeCheckoutSessionId: outcome.checkoutSessionId },
        update: {},
        create: {
          shareId: share.id,
          shareName: share.name,
          email: outcome.email,
          scope: "EMAIL",
          sellerId: share.creatorId,
          amountCents: outcome.amountCents,
          currency: outcome.currency,
          stripeCheckoutSessionId: outcome.checkoutSessionId,
          stripePaymentIntentId: outcome.paymentIntentId,
          paidAt,
          accessUntil,
        },
      });

      // Dans la MÊME transaction : un redémarrage entre les deux laisserait un
      // droit payé sur un transfert qui expire demain.
      const nouvelle = nextExpiration(share.expiration, accessUntil);
      if (nouvelle)
        await tx.share.update({
          where: { id: share.id },
          data: { expiration: nouvelle },
        });

      return paiement;
    });
  }

  async revokePayment(paymentIntentId: string) {
    await this.prisma.sharePayment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
```

Importer `moment` comme le reste du backend : `import * as moment from "moment";`
(pas d'`esModuleInterop`).

- [ ] **Étape 6 : la route du webhook, avec son corps brut**

La vérification de signature exige le corps **brut**, pas le JSON analysé.
Dans `backend/src/main.ts`, à côté du `bodyParser.raw` déjà posé pour
`application/octet-stream` (`:48-54`), ajouter une règle pour la route du
webhook **avant** le parseur JSON global.

Puis, dans un contrôleur **à part** —
`backend/src/payment/stripeWebhook.controller.ts` :

```ts
import { Controller, HttpCode, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { PaymentService } from "./payment.service";

// Hors de `shares/:shareId/payment` : un webhook n'appartient à aucun
// transfert, c'est Stripe qui dit lequel via `metadata`. Le mettre sous un
// `:shareId` obligerait à inventer une valeur pour le satisfaire — et à faire
// confiance à l'URL plutôt qu'à l'événement signé.
@Controller("shares/webhook")
export class StripeWebhookController {
  constructor(private paymentService: PaymentService) {}

  @Post("stripe")
  @HttpCode(200)
  async webhook(@Req() request: Request & { rawBody?: Buffer }) {
    const event = this.paymentService.verifyWebhook(
      request.rawBody,
      request.headers["stripe-signature"] as string,
    );
    await this.paymentService.applyEvent(event);
  }
}
```

Le déclarer dans les `controllers` de `PaymentModule`.

Dans `PaymentService` :

```ts
  // Laisse remonter l'erreur de Stripe telle quelle : une signature invalide
  // doit répondre 400, jamais 200. Répondre 200 à un événement non vérifié,
  // c'est accepter qu'un inconnu déclare des paiements.
  verifyWebhook(rawBody: Buffer | undefined, signature: string | string[]) {
    if (!rawBody)
      throw new BadRequestException("missing raw body for webhook");

    return this.stripe.client().webhooks.constructEvent(
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
      this.config.get("stripe.webhookSigningSecret"),
    );
  }

  async applyEvent(event: { type: string; data: { object: object } }) {
    const outcome = interpretStripeEvent(event as never);
    if (!outcome) return;
    if (outcome.kind === "paid") await this.recordPayment(outcome);
    else await this.revokePayment(outcome.paymentIntentId);
  }
```

Et dans `main.ts`, **avant** le parseur JSON global, sur le moule du
`bodyParser.raw` déjà présent (`:48-54`) :

```ts
  // Le corps brut, et seulement pour cette route : constructEvent calcule le
  // HMAC sur les octets reçus. Un corps analysé puis re-sérialisé ne donne pas
  // le même condensé, et toute signature valide serait rejetée.
  app.use("/api/shares/webhook/stripe", bodyParser.raw({ type: "*/*" }));
```

La route du webhook n'est donc **pas** sous `/shares/:shareId/payment` : elle
n'appartient à aucun transfert, c'est Stripe qui dit lequel via `metadata`.
La déclarer dans un contrôleur à part, `@Controller("shares/webhook")`.

- [ ] **Étape 7 : la page de retour**

Dans `PaymentService` :

```ts
  // Le même travail que le webhook, depuis l'autre bout. Sans lui, un client
  // qui revient avant que Stripe ait appelé regarde un écran verrouillé alors
  // que son argent est parti. L'upsert fait que le second arrivé ne casse rien.
  async confirmSession(shareId: string, sessionId: string) {
    const session = await this.stripe
      .client()
      .checkout.sessions.retrieve(sessionId);

    // On ne fait PAS confiance au shareId de l'URL : c'est celui que Stripe a
    // enregistré à la création qui fait foi.
    if ((session.metadata as Record<string, string>)?.shareId !== shareId)
      throw new BadRequestException(this.i18n.t("payment.sessionMismatch"));

    await this.applyEvent({
      type: "checkout.session.completed",
      data: { object: session as unknown as object },
    });
  }
```

Message à ajouter dans les deux `payment.json` :
`"sessionMismatch": "Cette session de paiement ne correspond pas à ce transfert"`
et `"This payment session does not match this transfer"`.

- [ ] **Étape 7 bis : déclarer le webhook chez Stripe**

Hors code, et Majid seul peut le faire : dans le tableau de bord Stripe en mode
test, créer un point de terminaison vers
`https://transfer.majid.film/api/shares/webhook/stripe`, abonné à
`checkout.session.completed` et `charge.refunded`, puis coller son secret de
signature dans `/admin/config/stripe`. Sans ça, seule la page de retour crée les
droits — ce qui marche, mais perd tout client qui ferme son onglet.

- [ ] **Étape 8 : vérifier l'idempotence**

```bash
cd backend && node --experimental-strip-types --test "src/payment/stripeEvent.spec.ts"
```

Puis, en direct : payer une fois en mode test, et compter.

```bash
sqlite3 data/transfer.db "SELECT COUNT(*) FROM SharePayment WHERE stripeCheckoutSessionId LIKE 'cs_%';"
```

Attendu : **1**, même si le webhook et la page de retour se sont tous deux
exécutés.

- [ ] **Étape 9 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/tsc -p tsconfig.spec.json --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/src/payment backend/src/main.ts
git commit -m "Record a payment once, whichever path gets there first"
```

---

### Tâche 9 : le reçu, la notification, la révocation

**Fichiers :**
- Modifier : `backend/src/email/email.service.ts`
- Modifier : `backend/src/i18n/fr-FR/email.json`, `en-US/email.json`
- Modifier : `backend/src/payment/payment.service.ts`

**Interfaces :**
- Consomme : `recordPayment` (tâche 8).
- Produit : `EmailService.sendPaymentReceipt(...)`,
  `EmailService.sendPaymentNotificationToSeller(...)`.

- [ ] **Étape 1 : écrire les deux méthodes d'e-mail**

Dans `backend/src/email/email.service.ts`, sur le moule exact de
`sendReverseShareInvite` :

```ts
  /**
   * Un reçu, et il le dit. La facture numérotée est un chantier futur
   * (spec §9) : promettre ici un document qui n'en est pas un mettrait le
   * client en défaut devant sa propre comptabilité.
   */
  async sendPaymentReceipt(
    recipientEmail: string,
    shareId: string,
    shareName: string | undefined,
    amountCents: number,
    currency: string,
    reference: string,
  ) {
    const appUrl = this.config.get("general.appUrl");
    const shareUrl = `${appUrl}/s/${shareId}`;
    const lang = this.config.get("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });

    // Depuis les centimes, sans jamais passer par un flottant intermédiaire.
    const amount = new Intl.NumberFormat(locale as string, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);

    const args = {
      name: shareName ?? shareId,
      amount,
      date: moment().locale(locale as string).format("LL"),
      reference,
    };

    await this.sendMail(
      recipientEmail,
      this.i18n.t("email.paymentReceiptSubject", { lang, args }),
      this.i18n
        .t("email.paymentReceiptMessage", { lang, args })
        .replaceAll("\\n", "\n")
        .replaceAll("{shareUrl}", shareUrl),
      { ctaUrl: shareUrl },
    );
  }
```

`sendPaymentNotificationToSeller` suit la même forme avec les clés
`paymentSellerSubject`/`paymentSellerMessage` et l'adresse du vendeur.

- [ ] **Étape 2 : les clés i18n**

Dans `backend/src/i18n/fr-FR/email.json` :

```json
  "paymentReceiptSubject": "Votre paiement pour « {name} »",
  "paymentReceiptMessage": "Votre paiement de {amount} a bien été reçu le {date}.\\n\\nVous pouvez télécharger vos fichiers ici : {shareUrl}\\n\\nRéférence : {reference}\\n\\nCe message est un reçu, pas une facture.",
  "paymentSellerSubject": "{amount} reçus pour « {name} »",
  "paymentSellerMessage": "{email} a payé {amount} pour « {name} ».\\n\\n{shareUrl}"
```

Et leurs équivalents anglais dans `en-US/email.json`.

- [ ] **Étape 3 : les appeler après l'enregistrement**

Dans `recordPayment`, **après** la transaction et jamais dedans — un serveur de
messagerie lent ou en panne ne doit pas annuler un paiement correctement
enregistré. Chaque envoi est attendu séparément et son échec journalisé, comme
le fait `ReverseShareService.create` pour ses invitations.

- [ ] **Étape 4 : brancher la révocation**

Dans `applyEvent`, le cas `refunded` appelle `revokePayment`. Vérifier en direct
en remboursant depuis le tableau de bord Stripe en mode test : la route d'octets
doit repasser à `403`.

- [ ] **Étape 5 : vérifier les e-mails**

Vider Mailpit, payer en mode test, puis :

```bash
curl -s "http://localhost:8025/api/v1/messages?limit=5" | python3 -c "
import json,sys
for m in json.load(sys.stdin).get('messages',[]):
    print(' →', ', '.join(t['Address'] for t in m.get('To',[])), '|', m.get('Subject'))"
```

Attendu : deux messages — le reçu à l'acheteur, la notification au vendeur.

- [ ] **Étape 6 : typecheck, lint, commit**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add backend/src/email backend/src/i18n backend/src/payment
git commit -m "Send a receipt, tell the seller, honour a refund"
```

---

# Partie E — le front

---

### Tâche 10 : poser un prix à la création

**Fichiers :**
- Modifier : `frontend/src/components/upload/TransferCard.tsx`
- Modifier : `frontend/src/services/share.service.ts`
- Modifier : `frontend/src/i18n/translations/fr-FR.ts`, `en-US.ts`
- Modifier : `backend/src/share/dto/createShare.dto.ts`

**Interfaces :**
- Produit : `priceCents` dans le corps de création d'un transfert.

- [ ] **Étape 1 : accepter le prix côté backend**

Dans le DTO de création, un champ optionnel validé :

```ts
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  priceCents?: number;
```

Le plafond n'est pas décoratif : il borne ce qu'une requête forgée peut demander
à Stripe de débiter.

- [ ] **Étape 2 : refuser qu'un non-administrateur pose un prix**

Dans le service de création, avant l'écriture :

```ts
    // Le vendeur est câblé sur l'administrateur (spec §3). Un expéditeur
    // anonyme ou un compte ordinaire ne vend pas en son nom.
    if (body.priceCents && !user?.isAdmin)
      throw new ForbiddenException(this.i18n.t("share.pricingNotAllowed"));
```

- [ ] **Étape 3 : le champ dans la carte de transfert**

Dans `TransferCard.tsx`, à côté du champ d'expiration, et **seulement** pour un
administrateur :

```tsx
              {user?.isAdmin && (
                <NumberInput
                  variant="filled"
                  min={0}
                  precision={2}
                  step={10}
                  label={t("upload.transfer.price.label")}
                  description={t("upload.transfer.price.description")}
                  {...form.getInputProps("priceEuros")}
                />
              )}
```

`priceEuros: undefined as number | undefined` dans `initialValues`, et à la
soumission :

```tsx
                // Arrondi AVANT de quitter les euros : Math.round(3.30 * 100)
                // vaut 330, mais 3.30 * 100 vaut 330.00000000000006. Aucun
                // flottant ne doit atteindre Stripe.
                priceCents: values.priceEuros
                  ? Math.round(values.priceEuros * 100)
                  : undefined,
```

- [ ] **Étape 4 : les traductions**

```ts
  "upload.transfer.price.label": "Prix (€)",
  "upload.transfer.price.description":
    "Laissez vide pour un transfert gratuit. Le destinataire verra ce qu'il contient, mais devra payer pour le télécharger.",
```

Et l'équivalent anglais.

- [ ] **Étape 5 : vérifier en direct**

Créer un transfert avec un prix en tant qu'administrateur, vérifier en base :

```bash
sqlite3 backend/data/transfer.db "SELECT id, name, priceCents FROM Share ORDER BY createdAt DESC LIMIT 1;"
```

Puis tenter la même création en anonyme avec `priceCents` forcé dans le corps :
attendu `403`.

- [ ] **Étape 6 : typecheck, lint, commit**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint 'src/**/*.tsx' 'src/**/*.ts'
cd ../backend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint 'src/**/*.ts'
```

```bash
git add frontend/src backend/src/share
git commit -m "Let an administrator put a price on a transfer"
```

---

### Tâche 11 : l'écran de déverrouillage

**Fichiers :**
- Modifier : `frontend/src/pages/share/[shareId]/index.tsx:343-375`
- Modifier : `frontend/src/components/share/FileList.tsx`
- Modifier : `frontend/src/types/share.type.ts`
- Modifier : `frontend/src/i18n/translations/fr-FR.ts`, `en-US.ts`

**Interfaces :**
- Consomme : `POST /api/shares/:shareId/payment/session` (tâche 7) et
  `POST /api/shares/:shareId/payment/confirm` (tâche 8).

- [ ] **Étape 1 : exposer le prix et l'état payé**

`GET /api/shares/:id` renvoie déjà les métadonnées. Y ajouter `priceCents` et un
booléen `isPaidForViewer`, calculé côté serveur avec `isPaidFor` — **jamais**
côté client : un booléen calculé dans le navigateur n'est pas une autorisation.

- [ ] **Étape 2 : remplacer les boutons de téléchargement**

Dans `index.tsx`, la zone `:343-375` : si `priceCents` et pas
`isPaidForViewer`, afficher un bouton « Débloquer pour X € » à la place du
téléchargement et de `DownloadAllButton`. Les icônes de téléchargement par
fichier de `FileList` suivent la même condition ; **les icônes de
prévisualisation restent**, la miniature n'étant pas derrière le paiement.

- [ ] **Étape 3 : le clic**

Appelle la route de session et fait `window.location.href = url`. Pas d'onglet
neuf : le retour de Stripe doit revenir dans la même page.

- [ ] **Étape 4 : le retour**

Au montage, si l'URL porte `?payment=<session>`, appeler la route de
confirmation, retirer le paramètre de l'URL, recharger le transfert. Si la
confirmation échoue, afficher un message qui dit que le paiement est bien parti
et que l'accès arrivera — **surtout pas** un message d'erreur sec sur une page
où de l'argent vient de partir.

- [ ] **Étape 5 : le retour d'un autre appareil**

Si le transfert est payé mais que le visiteur n'a pas d'adresse prouvée,
proposer « J'ai déjà payé » qui ouvre `showEmailVerificationModal` : il saisit
son adresse, reçoit un code, et la page se déverrouille.

- [ ] **Étape 6 : les traductions**

```ts
  "share.payment.unlock": "Débloquer pour {price}",
  "share.payment.already-paid": "J'ai déjà payé",
  "share.payment.pending":
    "Votre paiement est bien parti. L'accès s'ouvrira dans un instant — rechargez cette page si rien ne change.",
```

Et l'équivalent anglais.

- [ ] **Étape 7 : la recette complète, en mode test**

Sur `localhost:3333`, dans un navigateur vierge : ouvrir un transfert payant,
constater que les métadonnées et les miniatures s'affichent et que le
téléchargement est refusé, payer avec `4242 4242 4242 4242`, constater le
déverrouillage, vider le navigateur, revenir, cliquer « J'ai déjà payé »,
prouver l'adresse par le code lu dans Mailpit, constater le déverrouillage de
nouveau.

- [ ] **Étape 8 : typecheck, lint, commit**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint 'src/**/*.tsx' 'src/**/*.ts'
```

```bash
git add frontend/src backend/src/share
git commit -m "Show what a paid transfer holds, and sell the way in"
```

---

## Tests système Newman

À ajouter à `backend/test/newman-system-tests.json` une fois la partie E finie,
dans un dossier `Paid shares`. Les neuf premiers points du §10 de la spec, plus
les deux ajoutés :

| # | Requête | Attendu |
|---|---|---|
| 1 | `GET /shares/:id/files/:fileId` sur un transfert avec prix, sans paiement | `403 share_payment_required` |
| 2 | La même après paiement posé et adresse prouvée | `200` |
| 3 | `GET /shares/:id/files/:fileId/thumbnail` et `/metaData` | `200` dans les deux cas |
| 4 | Le créateur et l'administrateur téléchargent | `200` |
| 5 | Un transfert sans prix | inchangé |
| 6 | Le même événement rejoué | une seule ligne `SharePayment` |
| 7 | Après révocation | `403` de nouveau |
| 8 | `DELETE` d'un transfert payé | refus, puis succès avec la dérogation |
| 9 | `PATCH` de config sans `smtp.password` | le secret survit |
| 10 | `GET /configs/admin/smtp` | `value` nul, `isSet` correct |
| 11 | Invariant du seed | aucun `obscured` sans `secret` |

**Rappel : ne jamais lancer `npm run test:system` en local.**

---

## Ordre et points de livraison

| Partie | Livrable seul | Pourquoi cet ordre |
|---|---|---|
| A — secrets | **oui** | Ferme une fuite qui existe aujourd'hui. Rien ne doit ranger une clé Stripe avant |
| B — modèle | oui, sans effet | Un transfert sans prix reste un transfert sans prix |
| C — porte et fenêtre | oui | Éprouvée avec des lignes posées à la main, aucun Stripe |
| D — Stripe | non | Sans la partie E, rien ne déclenche un paiement depuis l'interface |
| E — front | non | Dépend de D |

D et E se livrent ensemble. A, B et C peuvent partir séparément, dans cet ordre.
