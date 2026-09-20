# Transfert payant — phase 1 du chantier paiement

**Pour qui :** la session Claude Code dédiée à Transfer.
**Objectif :** qu'un transfert puisse porter un prix, qu'un destinataire paie
pour en télécharger les octets, et que le droit ainsi acquis survive à son
navigateur.
**Statut :** design validé par Majid le 21 septembre 2026. **Rien n'est
implémenté.** Le plan d'implémentation est un document séparé.

---

## 0. Le résultat en une phrase

Un administrateur pose un prix sur un transfert ; le destinataire voit ce qu'il
contient mais ne peut rien en tirer avant d'avoir payé ; une fois payé, l'accès
appartient à l'adresse qui a payé et vaut au moins trente jours.

---

## 1. Ce que la phase 0 a déjà tranché

La phase 0 (`portail-acces-unique.md`, livrée le 18 septembre 2026) a été faite
pour celle-ci : elle a réduit à **une seule porte** les chemins vers les octets
d'un transfert, pour qu'il n'existe qu'un endroit où poser la question « est-ce
que c'est payé ? ». Elle a aussi consigné trois décisions qui ne sont pas
rouvertes ici :

| Sujet | Décision |
|---|---|
| Qui encaisse | Un seul vendeur câblé — l'administrateur — mais le modèle porte un **vendeur explicite** plutôt que de supposer l'instance |
| Ce que voit un destinataire avant paiement | **Les métadonnées seulement** : noms, tailles, miniatures. Lecture et téléchargement verrouillés |
| À quoi appartient l'accès payé | Une ligne portant une **portée** |

Elle avait laissé ouverte la question de savoir laquelle des portées serait
câblée. **Elle est tranchée ici : `EMAIL`.**

## 2. Les décisions de cette phase

Prises avec Majid le 21 septembre 2026.

| Question | Décision | Ce qu'elle écarte |
|---|---|---|
| À quoi sert un transfert payant | Facturer un client la livraison de ses fichiers | La vente publique à des inconnus reste un chantier futur : elle apporte TVA, fraude, volume et remboursements |
| Ce que devient l'accès quand le client revient d'un autre appareil | Il est attaché à **l'adresse** qui a payé ; le client la prouve par code à usage unique | La portée `SESSION`, qui bloquerait un client ayant changé de téléphone |
| Le justificatif | Un **reçu par courriel** envoyé par Transfer | La facture numérotée avec mentions légales et archivage : chantier futur, explicitement voulu |
| Le transfert expire après paiement | Le paiement **garantit une fenêtre** : l'expiration recule si besoin, et la suppression est refusée pendant | « Rien d'automatique », qui fait absorber chaque incident par Majid |
| La clé Stripe dans la console | Le panneau **ne relit plus jamais** un réglage `obscured` | Sortir la clé de la base entièrement, qui imposerait d'éditer un fichier sur le NAS à chaque rotation |
| Comment on encaisse | **Stripe Checkout hébergé** + webhook | Le formulaire de paiement intégré, retenu comme chantier futur : il ne change que le navigateur, pas le serveur |

---

## 3. Le modèle

### Le prix vit sur le transfert

Une colonne sur `Share` :

```prisma
priceCents Int?
```

`null` veut dire gratuit. Tous les transferts existants le restent sans
migration de données.

Pas de colonne de devise ici : en v1 elle ne varie pas — c'est celle du compte
Stripe — et c'est sur le paiement qu'elle a une valeur comptable.

### Le paiement vit à part

Un prix est une propriété du transfert ; un paiement est un événement qui doit
**survivre au transfert**, sans quoi la facture numérotée du chantier futur
n'aura plus rien à facturer.

```prisma
model SharePayment {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  // Nullable et SetNull : un transfert supprimé ne doit pas effacer la trace
  // de l'argent. `shareName` est dénormalisé au moment du paiement pour que
  // la ligne reste lisible une fois la relation coupée.
  shareId   String?
  share     Share?   @relation(fields: [shareId], references: [id], onDelete: SetNull)
  shareName String?

  // L'adresse qui a payé. C'est elle, la portée EMAIL.
  email String

  // "EMAIL" en v1. "TRANSFER" et "SESSION" restent des valeurs admises par la
  // phase 0 pour la vente publique. Une chaîne et non une enum : la base est
  // SQLite, que Prisma ne laisse pas déclarer d'enum — même convention que
  // `Share.storageProvider` (schema.prisma:211).
  scope String @default("EMAIL")

  // Le vendeur explicite voulu par la phase 0. Toujours l'administrateur en
  // v1, mais le modèle ne le suppose pas.
  sellerId String?
  seller   User?   @relation("SharePaymentSeller", fields: [sellerId], references: [id], onDelete: SetNull)

  // Ce qui a RÉELLEMENT été débité, pas ce qui était affiché. C'est cette
  // ligne que la facture future lira.
  amountCents Int
  currency    String

  // La clé d'idempotence. Stripe réessaie ses webhooks et la page de retour
  // fait le même travail : la contrainte d'unicité est ce qui fait que deux
  // livraisons du même événement ne créent qu'un droit.
  stripeCheckoutSessionId String  @unique
  stripePaymentIntentId   String?

  paidAt      DateTime
  accessUntil DateTime

  // Posé par le webhook charge.refunded. Un droit révoqué n'ouvre plus rien.
  revokedAt DateTime?

  @@index([shareId, email])
}
```

L'index sur `(shareId, email)` est celui que le garde interroge à chaque
requête d'octets.

### Qui peut poser un prix

En v1, **un administrateur seulement**. Le vendeur est câblé sur lui, donc un
expéditeur anonyme ou un compte ordinaire ne peut pas vendre en son nom. Le
chemin de l'argent reste étroit, et la règle est la même que celle qui gouverne
déjà `canCreatePermanentShares`.

---

## 4. Le parcours d'achat

1. L'administrateur crée un transfert et y pose un prix, dans la carte de
   transfert, à côté de l'expiration et du mot de passe.
2. Le destinataire ouvre le lien. Il voit le nom, la liste des fichiers, leurs
   tailles, les miniatures — tout ce que la phase 0 a décidé de montrer. À la
   place des boutons de téléchargement : **« Débloquer pour 300 € »**.
3. Il clique. Le serveur ouvre une session Stripe Checkout et le redirige.
   Stripe collecte son adresse au passage.
4. Il paie, il revient sur la page du transfert.

Deux chemins créent le droit, et c'est volontaire :

| Chemin | Rôle |
|---|---|
| Webhook `checkout.session.completed` | Celui qui fait foi. Crée la ligne, recule l'expiration si besoin, envoie le reçu, notifie le vendeur |
| Page de retour | Vérifie la session auprès de Stripe et fait le même travail si le webhook n'est pas encore arrivé |

Sans le second, un client regarde un écran verrouillé pendant que son argent est
parti. Les deux écrivent sur `stripeCheckoutSessionId`, donc peu importe lequel
gagne la course.

### Le retour, plus tard, d'un autre appareil

Le client prouve son adresse par le flux de code à usage unique **qui existe
déjà** : `verification.service.ts` émet un jeton `{ email }` valable 4 h
([`:79-82`](../backend/src/verification/verification.service.ts)), le pose en
cookie (`:85`) et répond `getVerifiedEmail(request)`. Rien à construire.

---

## 5. La porte

`ShareSecurityGuard` garde tout ce qu'il fait — expiration, mot de passe,
restriction aux destinataires — et **ses deux dérogations** : l'administrateur
sous `share.allowAdminAccessAllShares`
([`shareSecurity.guard.ts:92-98`](../backend/src/share/guard/shareSecurity.guard.ts))
et le créateur (`:114`). Le vendeur doit pouvoir télécharger son propre
transfert payant sans payer.

Une seule chose s'ajoute, à la fin : si la route est marquée comme exigeant un
paiement **et** que `share.priceCents` n'est pas `null`, le garde cherche une
ligne `SharePayment` non révoquée pour le couple (transfert, adresse prouvée).

Refus : **`402`**, code `share_payment_required`, dans la même forme que les
`share_token_required` et `share_password_required` d'aujourd'hui.

### Quelles routes

Un décorateur `@RequiresPayment()`, sur **deux** routes :

| Route | Décorée | Pourquoi |
|---|---|---|
| `GET zip` ([`file.controller.ts:119`](../backend/src/file/file.controller.ts)) | oui | ce sont les octets |
| `GET :fileId` ([`:149`](../backend/src/file/file.controller.ts)) | oui | ce sont les octets |
| `GET :fileId/thumbnail` ([`:237`](../backend/src/file/file.controller.ts)) | **non** | la phase 0 a décidé que les miniatures sont visibles avant paiement |
| `GET /shares/:id` et `/metaData` | **non** | idem, ce sont les métadonnées |

Un décorateur plutôt qu'un garde qui devine d'après l'URL : le garde résout déjà
deux noms de paramètre différents (`shareSecurity.guard.ts:70-75`), lui ajouter
une seconde règle implicite le rendrait illisible. Là, celui qui ajoutera une
sixième route verra la marque — ou son absence.

---

## 6. La fenêtre garantie

Au paiement, `accessUntil = paidAt + share.paidAccessWindow`, un réglage de type
`timespan` comme `share.maxExpiration`, valeur par défaut **30 days**.

Si `share.expiration` tombe avant `accessUntil`, elle **recule** jusque-là. Une
écriture, dans la même transaction que la ligne de paiement — sinon un
redémarrage entre les deux laisse un droit payé sur un transfert qui expire
demain.

La suppression : `remove()`
([`share.service.ts:516`](../backend/src/share/share.service.ts)) refuse tant
qu'un paiement non révoqué a son `accessUntil` dans le futur. La console propose
alors un « supprimer quand même » explicite, en indiquant combien de personnes
ont payé et jusqu'à quand.

Le cron d'expiration (`jobs.service.ts:25`) n'a rien à apprendre : l'expiration
ayant déjà reculé, il ne voit pas le transfert.

---

## 7. Les secrets

`getByCategory` ([`config.service.ts:522-531`](../backend/src/config/config.service.ts))
renvoie aujourd'hui `value: variable.value ?? variable.defaultValue` pour toute
variable non verrouillée — donc les onze réglages `obscured` en clair : mot de
passe SMTP, secrets OAuth, clés S3, bind LDAP.

**Le changement** : pour un réglage `obscured`, `value: null` et un booléen
`isSet`. Le panneau affiche « défini » et un champ pour remplacer. On peut
écrire une clé, jamais relire l'ancienne.

### La route publique, vérifiée

`getByCategory` est derrière `JwtGuard` et `AdministratorGuard`
([`config.controller.ts:41-42`](../backend/src/config/config.controller.ts)).
Mais il existe une **seconde** route qui renvoie des valeurs, `list()`
([`config.service.ts:567`](../backend/src/config/config.service.ts)), servie par
`GET /api/configs` **sans aucun garde** (`config.controller.ts:35-37`) — c'est
elle que lit le navigateur de n'importe quel visiteur.

Elle filtre sur `secret`, **pas** sur `obscured`. Vérifié en base : les onze
réglages `obscured` portent tous `secret: true`, donc aucun ne sort aujourd'hui.

**C'est un couplage, pas une garantie.** Un réglage `obscured` ajouté sans
`secret: true` partirait en clair à des visiteurs anonymes. Les réglages Stripe
étant neufs, deux conséquences :

1. `stripe.secretKey` et `stripe.webhookSigningSecret` portent **`obscured: true`
   et `secret: true`**.
2. Un test assure qu'aucun réglage `obscured` n'a `secret: false` — c'est
   l'invariant, et il doit casser le jour où quelqu'un l'oublie.

Ça ne rend pas une session d'administrateur compromise inoffensive — elle peut
encore écraser la clé, ce qui casse les paiements sans rien prendre. Ça supprime
le vol, qui est la seule des deux dont les conséquences survivent à
l'application.

### Ce qu'il faut afficher — et le piège qui n'en est pas un

**Correction, écrite après vérification du code.** Cette section affirmait
d'abord que le panneau renvoie toutes les valeurs à l'enregistrement, donc que
masquer un secret effacerait le mot de passe SMTP au premier enregistrement des
réglages SMTP. C'est **faux** : `updateConfigVariable`
([`[category].tsx:160-175`](../frontend/src/pages/admin/config/[category].tsx))
n'accumule que les variables réellement modifiées, et `saveConfigVariables`
(`:138-141`) n'envoie que celles-là. Un champ auquel personne n'a touché n'est
jamais envoyé. Le scénario catastrophe n'existe pas.

Ce qui reste, et qui est le vrai travail :

- Le `PasswordInput`
  ([`AdminConfigInput.tsx:77-86`](../frontend/src/components/admin/configuration/AdminConfigInput.tsx))
  s'affichera **vide**, puisqu'il n'a plus de valeur à recevoir. Sans rien
  d'autre, l'administrateur croira le réglage non posé et le ressaisira pour
  rien. D'où `isSet`, et un libellé qui dit « défini » quand il l'est.
- **Effacer volontairement le champ reste le moyen d'effacer le secret** :
  `update()` traite `""` comme `null`
  ([`config.service.ts:684`](../backend/src/config/config.service.ts)). C'est
  cohérent, et ça doit le rester — sans ça, un secret posé par erreur serait
  ineffaçable depuis la console.

## 8. Quand l'argent tourne mal

| Cas | Traitement |
|---|---|
| Webhook falsifié | Signature vérifiée avec le secret de signature Stripe — un `obscured` de plus, qui bénéficie du §7 |
| Webhook rejoué | La contrainte d'unicité sur `stripeCheckoutSessionId` ; l'écriture est un `upsert` |
| Le client paie deux fois | Avant d'ouvrir une session, si un paiement valide existe pour (transfert, adresse), on ne propose pas de payer : on déverrouille. Deux onglets simultanés peuvent encore débiter deux fois — c'est un remboursement depuis le tableau de bord, et le reçu envoyé à chaque paiement le rend visible |
| Remboursement | Webhook `charge.refunded` : `revokedAt` est posé, le garde cesse d'honorer la ligne. Sans ça : « payé, remboursé, télécharge toujours » |
| Transfert supprimé après paiement | La ligne survit (`SetNull`). L'acheteur reçoit un message clair plutôt qu'un 404 |
| Paiement abandonné, Stripe indisponible | Aucune ligne, aucun accès. Sûr par construction |

---

## 9. Hors périmètre, délibérément

Chacun est réel, aucun n'est sur le chemin de la v1.

| Sujet | Pourquoi pas maintenant |
|---|---|
| TVA | La vente à des particuliers inconnus l'impose ; facturer un client connu, non. Vient avec la vente publique |
| Facture numérotée | Numérotation continue, mentions légales, archivage : un sous-système à part entière. **Chantier futur explicitement voulu** — le modèle porte déjà de quoi l'alimenter |
| Formulaire de paiement intégré | **Chantier futur explicitement voulu.** Ne change que le navigateur : la création de paiement, le webhook et le droit sont communs aux deux |
| Vente publique | Portées `TRANSFER` et `SESSION`, fraude, volume, remboursements |
| Devises multiples | Celle du compte Stripe suffit |
| Vendeur autre que l'administrateur | Le modèle le porte, rien ne le câble |
| Remboursement partiel depuis l'app | Le tableau de bord Stripe le fait |
| URL présignée S3 | `file.controller.ts:162-179` sort du garde. **Bloquant pour un transfert payant en S3** ; sans objet en stockage local, qui est la configuration actuelle. Déjà consigné dans `chantiers.md` §5 |

---

## 10. Vérification

### Sans dépenser un euro

Tout se joue en **mode test Stripe** : clés `sk_test_…`, cartes de test, y
compris celles qui échouent et celle qui force le 3-D Secure.

Le webhook se teste sans réseau : sa vérification de signature en fait une
fonction pure du corps signé, donc un test unitaire avec une charge fabriquée
suffit — y compris pour la rejouer deux fois et prouver l'idempotence.

### Non-régressions, à écrire comme tests

1. `GET /api/shares/:id/files/:fileId` sur un transfert avec prix, sans
   paiement → `402 share_payment_required`.
2. La même route après paiement, avec l'adresse prouvée → `200`.
3. `GET :fileId/thumbnail` et `GET /shares/:id/metaData` → `200` dans les deux
   cas.
4. Le créateur et l'administrateur téléchargent sans payer.
5. Un transfert **sans prix** se comporte exactement comme aujourd'hui.
6. Rejouer le même `checkout.session.completed` ne crée qu'une ligne.
7. Après `charge.refunded`, la route d'octets répond de nouveau `402`.
8. `remove()` refuse un transfert dont un paiement court, et l'accepte avec la
   dérogation explicite.
9. **Un `PATCH` de configuration qui ne mentionne pas `smtp.password` le laisse
   intact** — c'est déjà le comportement, ce test le verrouille.
10. `getByCategory` ne renvoie plus de valeur pour un réglage `obscured`, et
    renvoie `isSet` correctement pour un réglage posé comme pour un réglage vide.
11. **Aucun réglage `obscured` n'a `secret: false`** — l'invariant du §7, qui est
    ce qui tient la route publique `GET /api/configs`.

### En direct

Sur `localhost:3333`, avec Mailpit pour lire le reçu et une clé de test : poser
un prix, ouvrir le lien dans un autre navigateur, constater que les métadonnées
s'affichent et que le téléchargement est refusé, payer avec une carte de test,
constater le déverrouillage, vider le navigateur, prouver l'adresse par code, et
constater le déverrouillage de nouveau.

---

## 11. Prérequis hors code

Deux choses que la session Claude Code ne peut pas faire à la place de Majid :

1. Un **compte Stripe actif en EUR**, et ses clés de test pour la recette.
2. Le **webhook déclaré** dans le tableau de bord Stripe, pointé sur
   `transfer.majid.film`, et son secret de signature saisi dans la console.

---

## 12. Ordre de livraison

L'ordre importe : chaque étape doit pouvoir être livrée et recettée seule.

1. **Le correctif des secrets** (§7), front compris. Il est indépendant du
   paiement, il ferme une fuite qui existe aujourd'hui, et rien ne doit ranger
   une clé Stripe avant lui.
2. **Le modèle** (§3) et la migration. Sans comportement : un transfert sans
   prix reste un transfert sans prix.
3. **La porte** (§5) et la fenêtre garantie (§6), éprouvées avec des lignes
   `SharePayment` posées à la main. Aucun Stripe encore.
4. **Stripe** (§4) : session de paiement, webhook, page de retour, reçu.
5. **Le front** : le champ de prix à la création, et l'écran de déverrouillage.
