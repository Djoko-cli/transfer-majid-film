# Portail d'accès unique — phase 0 du chantier paiement

**Pour qui :** la session Claude Code dédiée à Transfer.
**Objectif :** qu'il n'existe plus qu'**un seul chemin** vers les octets d'un
transfert, donc un seul endroit où écrire une règle d'accès — et, au passage,
refermer trois défauts vérifiés qui existent aujourd'hui.
**Statut :** design validé par Majid le 17 septembre 2026. **Rien n'est
implémenté.** Ce document est la spécification ; le plan d'implémentation vient
après sa relecture.

Transfer lu au commit `c51e96e4`. Toutes les citations `fichier:ligne` ont été
ouvertes et vérifiées dans le code réel. Une cartographie automatisée a servi à
les trouver ; deux de ses affirmations se sont révélées fausses et sont
consignées en annexe plutôt que supprimées.

---

## 0. Le résultat en une phrase

**Le contrôle d'accès aux octets existe en deux exemplaires qui divergent
déjà.** On supprime le second au lieu de le réparer.

---

## 1. Pourquoi cette phase existe

Elle est née du chantier paiement : un transfert payant a besoin d'un endroit,
**un seul**, où poser la question « est-ce que c'est payé ? ». Mais son contenu
ne dépend pas du paiement. Trois des quatre points sont des défauts actifs
aujourd'hui, et le quatrième est structurel. Elle est donc livrée **seule, et
avant** toute ligne de code Stripe — décision explicite de Majid, au motif
qu'un correctif de sécurité ne doit pas attendre la recette d'une
fonctionnalité neuve.

### Décisions de phase 1 déjà prises, à ne pas re-litiger

Consignées ici parce qu'elles orientent la phase 0 sans y être implémentées :

| Question | Décision |
|---|---|
| Qui encaisse | Un seul vendeur câblé (l'admin), mais le modèle porte un **vendeur explicite** plutôt que de supposer l'instance |
| Ce que voit un destinataire avant paiement | **Les métadonnées seulement** : noms, tailles, miniatures. Lecture et téléchargement verrouillés |
| À quoi appartient l'accès payé | Une ligne portant une **portée**. `transfert` et `session` câblées en v1 ; `courriel` reste une valeur d'énumération non câblée |

---

## 2. L'état des lieux, vérifié

Les trois routes qui émettent des octets sont décorées d'un seul garde,
`FileSecurityGuard` ([`file.controller.ts:120`](../backend/src/file/file.controller.ts),
`:150`, `:238`). Ce garde étend `ShareSecurityGuard` mais **ne lui délègue que
sous condition** :

- **cookie `share_<id>_token` présent** → `return super.canActivate(context)`
  ([`fileSecurity.guard.ts:103`](../backend/src/file/guard/fileSecurity.guard.ts)).
  Le garde parent est complet.
- **cookie absent** → une réimplémentation manuelle des règles
  ([`fileSecurity.guard.ts:59-101`](../backend/src/file/guard/fileSecurity.guard.ts)).

Les deux jeux de règles ne sont pas les mêmes :

| Contrôle | Garde parent | Branche sans cookie |
|---|---|---|
| Expiration | `:101-106` | `:69-75` |
| Restriction aux destinataires | `:114-122` | `:77-88` |
| Mot de passe | `:124-128`, **avec** code machine `share_password_required` | `:90-91`, **sans** code machine |
| Limite de vues | absent | `:93-98` |
| Jeton valide | `:130-134` | sans objet |
| **Dépôt inversé non public** | **`:137-146`** | **absent** |
| Compteur de vues | via `getShareToken` | `:100`, à chaque requête |

La ligne en gras est un défaut actif : l'`include` Prisma de la branche sans
cookie ([`fileSecurity.guard.ts:49-56`](../backend/src/file/guard/fileSecurity.guard.ts))
ne charge pas la relation `reverseShare`, là où le parent la charge
([`shareSecurity.guard.ts:83`](../backend/src/share/guard/shareSecurity.guard.ts)).
**Les fichiers déposés dans un formulaire de demande non public sont donc
téléchargeables aujourd'hui par quiconque connaît `shareId` + `fileId`, sans
cookie.**

### Le point qui rend la suppression possible

`verifyShareToken` appelle `jwtService.verify(token, …)` sur un `token`
`undefined`, ce qui lève, et le `catch` renvoie `false`
([`share.service.ts:770-786`](../backend/src/share/share.service.ts)). Le garde
parent exige donc un jeton **pour tout**, y compris un transfert sans mot de
passe, et répond `share_token_required`
([`shareSecurity.guard.ts:130-134`](../backend/src/share/guard/shareSecurity.guard.ts)).

Le front gère déjà ce cycle : il intercepte le code et appelle
`POST /shares/:id/token` ([`index.tsx:161-162`](../frontend/src/pages/share/[shareId]/index.tsx)).
La branche sans cookie n'est donc empruntée par **rien** dans l'application —
uniquement par des URL d'octets brutes, dont le seul producteur est le bouton
« copier le lien » de la liste de fichiers.

---

## 3. Section 1 — la porte unique

### Le changement

1. **Supprimer** `backend/src/file/guard/fileSecurity.guard.ts`.
2. Dans `backend/src/file/file.controller.ts`, remplacer sur les trois routes
   d'octets (`:120` zip, `:150` fichier, `:238` miniature) :
   `@UseGuards(FileSecurityGuard)` → `@UseGuards(IdValidation, ShareSecurityGuard)`.
   Retirer l'import `:21`, ajouter les deux autres.
3. Rien d'autre.

C'est exactement la décoration que portent déjà `GET /shares/:id` et
`GET /shares/:id/metaData` ([`share.controller.ts:71-72`](../backend/src/share/share.controller.ts)
et `:83-84`).

### Pourquoi rien d'autre

- **La validation d'identifiant est couverte.** La vérification base64 en ligne
  du garde supprimé ([`fileSecurity.guard.ts:43-45`](../backend/src/file/guard/fileSecurity.guard.ts))
  est le même test que celui d'`IdValidation`, qui lit bien `params.shareId`
  ([`shareIdValidation.guard.ts:24`](../backend/src/share/guard/shareIdValidation.guard.ts)
  et `:34`). Ni l'un ni l'autre ne valide `fileId` : pas de régression.
- **L'injection est déjà en place.** `FileModule` importe `ShareModule`
  ([`file.module.ts:18`](../backend/src/file/file.module.ts)), qui exporte
  `ShareService` ([`share.module.ts:24`](../backend/src/share/share.module.ts)).
  Un garde nommé dans `@UseGuards` est instancié par l'injecteur du module du
  contrôleur ; `ShareSecurityGuard` a exactement les mêmes dépendances que le
  garde supprimé, qui n'était lui non plus pas déclaré dans `providers`.
- **La résolution `shareId`/`id` est identique** dans les deux gardes
  (`fileSecurity.guard.ts:36-41`, `shareSecurity.guard.ts:70-75`).

### Changements de comportement, assumés

| Avant | Après |
|---|---|
| `GET /api/shares/:id/files/:fileId` sans cookie renvoie le fichier | renvoie `403 share_token_required` |
| Les octets d'un dépôt inversé non public sont servis à qui a les identifiants | refusés, code `private_share` |
| Télécharger 3 fichiers compte 3 visiteurs | compte 1 |
| Le refus pour mot de passe sur les octets n'a pas de code machine | il a `share_password_required`, comme sur les métadonnées |

Le compteur : après suppression, `increaseViewCount` n'a plus qu'un seul appelant,
`getShareToken` ([`share.service.ts:735`](../backend/src/share/share.service.ts)).
Vérifié : les deux seuls appels existants sont celui-là et
`fileSecurity.guard.ts:100`.

Rien dans le front ne récupère d'octets hors de la page du transfert : la
prévisualisation et le téléchargement groupé s'exécutent dans la page, donc avec
le cookie.

---

## 4. Section 2 — un seul bouton de lien, en haut à droite

### Ce qui est supprimé

Dans `frontend/src/components/share/FileList.tsx` :

- `copyFileLink` ([`:109-133`](../frontend/src/components/share/FileList.tsx)) —
  c'est lui qui fabriquait l'URL d'octets brute ;
- l'icône qui l'appelle et sa condition `!share.hasPassword` ([`:284`](../frontend/src/components/share/FileList.tsx)) ;
- le terme `(hasPassword ? 0 : 1)` de `countActionIcons` ([`:45`](../frontend/src/components/share/FileList.tsx)),
  et la mention du bouton dans le commentaire qui le précède (`:37-40`) ;
- le paramètre `hasPassword` de `countActionIcons` devient inutile : le
  supprimer, et simplifier l'appel de `maxActionIcons` ([`:148`](../frontend/src/components/share/FileList.tsx)).

La largeur de la colonne d'actions s'ajuste d'elle-même : elle est dérivée du
nombre de boutons réellement rendus, pas d'une constante (`:145-150`, puis
`actionsColumnWidth` en `:47`).

Reste le repli `: 3` (`:150`), utilisé pendant le chargement, quand `files` est
vide. L'arithmétique après suppression, `doesFileSupportPreview` couvrant
`video/`, `image/`, `audio/`, `text/` et `application/pdf` tandis que
`isShareTextFile` ne couvre que `text/`
([`share.service.ts:97` et `:113`](../frontend/src/services/share.service.ts)) :

| Type de fichier | Boutons avant | Boutons après |
|---|---|---|
| Fichier texte (les deux prédicats vrais) | 4 | 3 |
| Média ou PDF | 3 | 2 |
| Binaire non prévisualisable | 2 | 1 |

Le maximum passe donc de 4 à **3**. Le repli valait déjà 3 alors que le maximum
était 4 : ce n'était pas le pire cas mais le cas courant. **Le laisser à 3 après
le changement est le choix sûr** — il devient exactement le pire cas, donc le
squelette de chargement ne peut plus réserver trop peu de place. À ne pas
baisser sans mesurer.

### Ce qui est ajouté

Une icône « copier le lien » dans le groupe déjà présent en haut à droite de la
box ([`index.tsx:212`](../frontend/src/pages/share/[shareId]/index.tsx), le
`<Group position="apart">` dont la moitié droite porte aujourd'hui les boutons
de modification).

Contrairement à ceux-là, elle n'est conditionnée **ni** par `isOwner` (`:58`)
**ni** par `isOwnerOrAdmin` (`:60`) : c'est le destinataire qui a besoin de
faire suivre un lien.

Le motif à reprendre existe à l'identique dans le panneau d'admin
([`ManageShareTable.tsx:147-163`](../frontend/src/components/admin/shares/ManageShareTable.tsx)) :
`HoverTip` + `ActionIcon` + `useClipboard`, notification `common.notify.copied-link`,
et repli par `showShareLinkModal` quand `window.isSecureContext` est faux — cas
réel en HTTP, où le presse-papiers est refusé par le navigateur.

Trois imports à ajouter dans la page : `useClipboard`, `showShareLinkModal`,
`TbLink`. Aucun n'y est aujourd'hui.

### Le lien copié

`<appUrl>/s/<shareId>` — le lien **canonique**, pas `window.location.href`.

Ce n'est pas un détail de forme : l'URL courante peut porter un
`?recipient=…` ([`index.tsx:62`](../frontend/src/pages/share/[shareId]/index.tsx)),
et un destinataire qui fait suivre sa page ferait alors circuler son propre
identifiant de destinataire. La résolution de `appUrl` suit celle du panneau
d'admin : valeur configurée si elle diffère du défaut, sinon
`window.location.origin`.

### Traductions

Aucune à ajouter. `common.button.copy-link` et `common.notify.copied-link`
existent déjà dans les deux langues — ce sont celles qu'utilisait le bouton
supprimé.

---

## 5. Section 3 — les deux fuites sur les transferts anonymes

### Le changement

Dans `backend/src/share/guard/shareOwner.guard.ts`, la ligne 62 :

```ts
// If it's a anonymous share, allow access
if (!share.creatorId) return true;
```

devient un refus. `StrictShareOwnerGuard` en hérite sans modification
([`strictShareOwner.guard.ts:5`](../backend/src/share/guard/strictShareOwner.guard.ts) —
il ne surcharge que `allowAdmin`).

### Pourquoi rien ne casse

Les trois écritures que ce garde protège refusent **déjà** les transferts
anonymes, plus loin, dans le service :

| Route | Garde | Refus existant |
|---|---|---|
| `PATCH /shares/:id` | `ShareOwnerGuard` | [`share.service.ts:541`](../backend/src/share/share.service.ts) → `share.anonymousNoUpdate` |
| `DELETE /shares/:id` | `ShareOwnerGuard` | [`:503`](../backend/src/share/share.service.ts) → `share.anonymousNoDelete` |
| `POST /shares/:id/expire` | `ShareOwnerGuard` | [`:517`](../backend/src/share/share.service.ts) → `share.anonymousNoExpire` |

Le garde ne faisait donc que déplacer le refus. En revanche il laissait passer
deux **lectures** que personne ne vérifiait ensuite :

- `GET /shares/:id/downloads` — `getDownloads` n'a aucun contrôle de
  propriété ([`share.service.ts:619`](../backend/src/share/share.service.ts)).
  Fuite réelle : noms de fichiers, **adresses des destinataires**,
  horodatages. Les adresses IP, elles, sont mises à `null` pour un non-admin
  par le contrôleur ([`share.controller.ts:96`](../backend/src/share/share.controller.ts)) —
  elles ne fuitent pas.
- `GET /shares/:id/from-owner` — renvoie le `ShareDTO` complet, liste de
  fichiers comprise, **hors mot de passe et hors limite de vues**
  ([`share.controller.ts:77-79`](../backend/src/share/share.controller.ts)).

### Contrepartie

Un expéditeur anonyme n'a plus aucun accès de gestion à son transfert. Il n'en
avait déjà aucun qui fonctionne : les trois écritures lui étaient refusées, et
les deux lectures n'ont pas d'interface. Un admin conserve l'accès par le
`allowAdmin` du garde ([`shareOwner.guard.ts:59`](../backend/src/share/guard/shareOwner.guard.ts)).

---

## 6. Section 4 — la fusion non destructive

### Le défaut

`updateSecurity` ([`share.service.ts:577-610`](../backend/src/share/share.service.ts))
raisonne sur deux champs seulement. S'il ne reste ni mot de passe ni limite de
vues, il **supprime la ligne entière** (`:592-597`). Et quand il la conserve, sa
branche `create` ne recopie que ces deux champs (`:601-605`).

`restrictToRecipients` est le troisième champ de `ShareSecurity`
([`schema.prisma:263`](../backend/prisma/schema.prisma)) et n'est dans aucun des
deux cas.

Ce n'est pas théorique : la modale d'infos envoie **toujours** un bloc
`security` ([`showShareInformationsModal.tsx:311-315`](../frontend/src/components/share/showShareInformationsModal.tsx)),
donc la condition `if (body.security)` ([`share.service.ts:565`](../backend/src/share/share.service.ts))
est toujours vraie et `updateSecurity` s'exécute à chaque enregistrement.

**Conséquence actuelle : un transfert réservé à ses destinataires, sans mot de
passe ni limite de vues, perd sa restriction dès que son propriétaire enregistre
la modale d'infos** — sans message, et sans que cette case y soit même affichée.

### Le changement

Réécrire `updateSecurity` pour qu'il préserve ce qu'il ne touche pas :

1. **Plus de `delete`.** Un `upsert` qui écrit `null` dans les seules colonnes
   réellement vidées.
2. **`restrictToRecipients` reporté** dans la branche `create`, depuis
   `currentSecurity`.
3. Le raccourci « ni mot de passe ni limite → efface tout » remplacé par un test
   sur ce qui subsiste **réellement**, restriction comprise. Une ligne
   `ShareSecurity` entièrement vide n'a pas besoin d'exister ; une ligne qui ne
   porte qu'une restriction, si.

`UpdateShareSecurityDTO` ([`updateShare.dto.ts:12-25`](../backend/src/share/dto/updateShare.dto.ts))
n'a pas besoin de nouveau champ : la restriction n'est pas modifiable depuis
cette modale, elle doit seulement survivre.

### Ce que ça prépare

Le prix d'un transfert pourra vivre dans `ShareSecurity` sans risque
d'effacement. **Il n'y vivra probablement pas** : un droit payé a son propre
cycle de vie — horodatage, identifiant d'événement Stripe, portée, vendeur — et
n'a pas sa place dans un sac d'options. Mais ce sera une décision de phase 1, pas
un présupposé de celle-ci.

---

## 7. Hors périmètre, délibérément

Chacun est réel, aucun n'est sur le chemin du paiement, et les empiler dans la
même livraison rendrait la recette illisible. À reverser dans `chantiers.md`.

| Sujet | Le fait |
|---|---|
| URL présignée S3 | `file.controller.ts:162-179` renvoie une redirection 302 vers une URL valable 300 s, hors de tout garde et irrévocable. Sans objet en stockage local ; **bloquant pour un transfert payant en S3** |
| Cache des miniatures | `file.controller.ts:249-252` pose `Cache-Control: public, max-age=31536000, immutable`. Acceptable tant que les métadonnées sont visibles avant paiement — c'est le choix retenu — mais à revoir si ce choix change |
| `JwtGuard` échoue ouvert | [`jwt.guard.ts:14`](../backend/src/auth/guard/jwt.guard.ts) renvoie `share.allowUnauthenticatedShares` au lieu de `false` en cas d'échec d'authentification. Tous les gardes de transfert en héritent |
| Jeton sans expiration | `generateShareToken` ne pose pas d'`expiresIn` pour un transfert permanent ([`share.service.ts:755-759`](../backend/src/share/share.service.ts)). Le jeton ne périme jamais |
| Cookie sans `secure` ni `sameSite` | [`share.controller.ts:186-189`](../backend/src/share/share.controller.ts) |
| `maxViews` non revérifié | `verifyShareToken` ne contrôle que l'identifiant, la date de création et la signature du mot de passe (`:777-783`). Un porteur de jeton dépasse la limite de vues |
| Cookies élagués à 10 | `clearShareTokenCookies` ([`share.controller.ts:194`](../backend/src/share/share.controller.ts)). Deviendra un vrai problème le jour où le cookie prouvera un paiement |
| Secret en clair au panneau | `getByCategory` renvoie la valeur de tout réglage `obscured` ([`config.service.ts:528`](../backend/src/config/config.service.ts)). À trancher avant d'y ranger une clé Stripe |

---

## 8. Vérification

### Non-régressions de sécurité, à écrire comme tests

Le harnais existant est celui de `.github/workflows/backend-system-tests.yml` ;
en lire le contenu avant de choisir où les poser.

1. `GET /api/shares/<id>/files/<fileId>` **sans cookie** → `403`,
   code `share_token_required`. *Aujourd'hui : renvoie le fichier.*
2. Même requête sur un transfert issu d'un dépôt inversé **non public** → `403`,
   code `private_share`. *Aujourd'hui : renvoie le fichier.*
3. `GET /api/shares/<id>/downloads` sur un transfert **anonyme**, non
   authentifié → `403`. *Aujourd'hui : renvoie le journal.*

Les trois échouent avant le changement et passent après. C'est la seule preuve
qui vaille pour un changement de garde.

### Vérifications en direct, sur `localhost:3333`

Identifiants de développement : `testadmin@example.com` / `TestPassword123!`.

4. Ouvrir un transfert de 3 fichiers, télécharger les 3, vérifier que le
   compteur « Visiteurs » avance de **1** et non de 3.
5. Copier le lien depuis le nouveau bouton, l'ouvrir dans un navigateur vierge :
   la page s'affiche et le transfert est téléchargeable.
6. Même chose sur un transfert protégé par mot de passe : le bouton est toujours
   là, et le lien copié demande bien le mot de passe à l'arrivée.
7. Vérifier que la colonne d'actions n'a pas de vide à droite après suppression
   du bouton par fichier — sur un transfert de binaires, et sur un transfert
   contenant un fichier texte (qui ajoute le bouton « copier le contenu »).
8. Créer un transfert restreint aux destinataires, sans mot de passe ni limite,
   enregistrer la modale d'infos, et vérifier **en base** que
   `restrictToRecipients` est toujours vrai.
9. La prévisualisation et le téléchargement groupé fonctionnent toujours depuis
   la page — ils passent par le cookie, mais c'est le chemin qui change.

---

## 9. Ordre de livraison

Quatre commits, dans cet ordre, chacun vérifiable seul :

1. **La porte unique** — suppression du garde, trois décorations. Prouvé par les
   tests 1 et 2 et les vérifications 4 et 9. C'est le cœur ; il vaut d'être isolé.
2. **Les fuites anonymes** — `shareOwner.guard.ts:62`. Prouvé par le test 3.
3. **La fusion non destructive** — `updateSecurity`. Prouvé par la vérification 8.
4. **Le bouton de lien** — suppression côté liste, ajout côté page. Prouvé par
   les vérifications 5, 6 et 7.

Le 4 dépend du 1 : tant que la branche sans cookie existe, l'ancien bouton
fonctionne encore et sa suppression ressemble à une régression gratuite.

Aucune migration de base. Aucun réglage de configuration nouveau. Aucune chaîne
de traduction nouvelle.

---

## Annexe — ce que la cartographie automatisée a dit de faux

Consigné parce qu'une erreur corrigée en silence se reproduit.

1. **« Un inconnu peut retirer le mot de passe d'un transfert anonyme, le
   supprimer, ou l'expirer. »** Faux. Les trois écritures sont refusées par le
   service (`share.service.ts:541`, `:503`, `:517`). Le trou est réel mais
   limité à deux lectures.
2. **« Le journal de téléchargements fuite les adresses IP. »** Faux. Le
   contrôleur les met à `null` pour un non-admin (`share.controller.ts:96`).
3. **« `trust proxy` est codé en dur à `true`. »** Faux : c'est
   `process.env.TRUST_PROXY === "true"` ([`main.ts:63`](../backend/src/main.ts)).
   L'effet tient néanmoins en production, `docker-compose.yml:8` le mettant à
   `true` — mais la cause n'était pas celle annoncée.

Leçon appliquée pour la suite : une citation `fichier:ligne` produite par un
agent est une **piste**, pas un fait. Toutes celles de ce document ont été
rouvertes.
