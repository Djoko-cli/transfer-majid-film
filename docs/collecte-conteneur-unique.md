# La collecte comme conteneur unique

**Pour qui :** la session Claude Code dédiée à Transfer.
**Objectif :** qu'un lien de dépôt cesse de distribuer des transferts et devienne
**un seul transfert qui grandit** — l'album commun que six personnes remplissent
et dans lequel elles puisent.
**Statut :** design validé par Majid le 18 septembre 2026. **Rien n'est
implémenté.** Ce document est la spécification ; le plan d'implémentation vient
après sa relecture.

Transfert lu au commit `64a23d6e`. Toutes les citations `fichier:ligne` ont été
ouvertes et vérifiées. Une cartographie automatisée en quatre axes a servi à les
trouver ; les affirmations qui portent les décisions ont été rouvertes à la main.

---

## 0. Le résultat en une phrase

**Un transfert inversé est aujourd'hui un distributeur de tickets ; il doit
devenir un dossier.**

---

## 1. L'écart, mesuré

Ce que le code fait réellement, et qui n'a jamais correspondu à l'intention :

| | Aujourd'hui | Voulu |
|---|---|---|
| Un dépôt produit | un `Share` neuf ([`share.service.ts:183`](../backend/src/share/share.service.ts)) | des fichiers ajoutés au conteneur |
| Six amis produisent | six transferts, six pages, six archives | un album |
| Le lien par défaut | **mono-usage** (`maxUseCount: 1`, [`showCreateReverseShareModal.tsx:115`](../frontend/src/components/share/modals/showCreateReverseShareModal.tsx)) | ouvert à tout le groupe |
| Le propriétaire voit | un accordéon d'identifiants bruts tronqués ([`reverseShares.tsx:171`](../frontend/src/pages/account/reverseShares.tsx)) | l'album, et qui a contribué |
| Le contributeur sait | rien : le `ReverseShareDTO` n'expose ni nom ni description ([`reverseShare.dto.ts:3`](../backend/src/reverseShare/dto/reverseShare.dto.ts)) | où il dépose et pour qui |
| Le contributeur voit | rien de ce que les autres ont mis | l'album entier |
| L'identité d'un dépôt | aucune — le jeton **tient lieu** d'identité ([`createShare.guard.ts:23-28`](../backend/src/share/guard/createShare.guard.ts), [`UploadPage.tsx:90`](../frontend/src/components/upload/UploadPage.tsx)) | un prénom et une adresse prouvée |

## 2. Les décisions prises

| Question | Décision |
|---|---|
| Un vrai conteneur, ou une vue agrégée ? | **Un vrai conteneur** : le lien pointe un transfert unique qui grandit |
| Qui peut lire ? | **Album partagé** : quiconque détient le lien voit et télécharge tout |
| Comment on protège | **Le mot de passe du lien**, qui existe déjà. Pas de cooptation, pas de liste blanche |
| Qui a déposé quoi | **Un prénom et une adresse vérifiée** par le mécanisme existant — ou rien de plus si la personne est connectée à son compte |
| Quand ça meurt | **Deux horloges** : une date de fermeture de la collecte, puis une durée de conservation qui court à partir de là |

**La distinction qui structure tout le reste :** le mot de passe garde la porte,
l'adresse vérifiée étiquette la contribution. Aujourd'hui ces deux rôles sont
confondus dans un seul jeton, et c'est ce qui rend les dépôts anonymes.

---

## 3. Le point dur : un transfert qui n'est jamais terminé

`uploadLocked` est un binaire strict, et ses deux valeurs sont également
inutilisables pour un conteneur :

- **verrouillé** → visible, mais tout téléversement est refusé
  ([`local.service.ts:55`](../backend/src/file/local.service.ts)) ;
- **déverrouillé** → invite les fichiers, mais `get()` répond introuvable
  ([`share.service.ts:516`](../backend/src/share/share.service.ts)) **et** le
  cron `deleteUnfinishedShares` le supprime au bout d'un jour
  ([`jobs.service.ts:82-101`](../backend/src/jobs/jobs.service.ts)).

Un conteneur laissé déverrouillé serait donc invisible puis détruit. C'est le
premier problème à résoudre, et tout le reste en dépend.

### La résolution

Le conteneur est un `Share` **verrouillé en permanence** — donc lisible,
archivable, protégeable, expirable, exactement comme les autres — et le
téléversement gagne **une seule exception, explicitement nommée**.

`Share` reçoit une colonne :

```prisma
  // Un transfert de collecte : le conteneur unique d'un lien de dépôt. Il
  // reste `uploadLocked` toute sa vie, parce que c'est ce qui le rend
  // lisible — et il accepte pourtant des fichiers, ce qu'aucun autre
  // transfert verrouillé ne fait. L'exception est portée par cette colonne
  // plutôt que déduite de la présence d'un lien, pour qu'elle soit
  // grep-able et qu'un futur lecteur de local.service.ts:55 sache
  // exactement quoi chercher.
  isCollection Boolean @default(false)
```

Et `LocalFileService`/`S3FileService` remplacent leur refus par : refuser si
verrouillé **et** que ce n'est pas une collecte. Rien d'autre ne change dans la
sémantique de `uploadLocked` pour les 100 % de transferts ordinaires.

Le droit d'écrire dans une collecte n'est pas donné par ce drapeau : il est
donné par la contribution ouverte (§5), qui est elle-même adossée à une
identité prouvée. Le drapeau dit seulement « ce transfert-là n'est pas figé ».

---

## 4. Le modèle de données

### `ReverseShare`

```prisma
  // Le conteneur, créé paresseusement à la première contribution — un lien
  // que personne n'utilise ne doit pas laisser un transfert vide derrière
  // lui. Un lien, un conteneur, pour toujours.
  containerShareId String? @unique
  containerShare   Share?  @relation("ReverseShareContainer", fields: [containerShareId], references: [id], onDelete: SetNull)

  // Fin de la collecte. Remplace l'usage actuel de shareExpiration comme
  // date unique : après elle, on ne dépose plus, mais l'album reste.
  collectionEndsAt DateTime

  // Combien de temps l'album survit à la fermeture de la collecte, en
  // secondes. L'expiration du conteneur vaut collectionEndsAt + ceci, et
  // n'est calculée qu'une fois, à la fermeture.
  retentionSeconds Int
```

`shares Share[]` **reste** : c'est la relation des dépôts déjà créés par les
liens de l'ancien modèle (§9), et elle ne doit pas être supprimée.

### `ShareContribution` (nouveau)

```prisma
model ShareContribution {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  // Le prénom saisi. Jamais vérifié, et c'est assumé : entre amis, un
  // nom qu'on peut mentir suffit à savoir qui manque à l'appel.
  name String?

  // L'adresse, et seulement celle que le code à usage unique a prouvée —
  // jamais celle qu'on a tapée. Même règle que ShareService.create() pour
  // un envoi anonyme, et pour la même raison : une adresse déclarée mais
  // non prouvée laisserait signer une contribution du nom d'un autre.
  email String?

  // Renseigné à la place de name/email quand la personne est connectée :
  // son compte porte déjà les deux, et lui redemander serait absurde.
  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  // Ouverte à la création, fermée quand le contributeur a fini. Tant
  // qu'elle est ouverte, elle autorise l'écriture dans le conteneur.
  completedAt DateTime?

  shareId String
  share   Share  @relation(fields: [shareId], references: [id], onDelete: Cascade)

  files File[]

  @@index([shareId, createdAt])
}
```

### `File`

```prisma
  // De quelle contribution ce fichier provient. Nul pour tout fichier
  // antérieur à cette colonne et pour tout transfert ordinaire.
  contributionId String?
  contribution   ShareContribution? @relation(fields: [contributionId], references: [id], onDelete: SetNull)
```

`onDelete: SetNull` et non `Cascade` : supprimer une contribution ne doit jamais
emporter des fichiers que l'album affiche déjà.

---

## 5. Le parcours du contributeur

Le lien `/upload/<token>` devient **la seule surface publique** : l'album et le
dépôt sur la même page. C'est ce que « un lien » veut dire.

> **Décision que je prends, à confirmer.** Le conteneur étant un `Share`, il a
> aussi une page `/s/<id>` qui fonctionnera. Elle n'est annoncée nulle part et
> aucune interface n'y mène ; le lien de jeton est l'adresse de l'album. Deux
> URL pour un même contenu est un défaut mineur, et le supprimer coûterait plus
> que de le tolérer.

1. **La porte.** Si le lien porte un mot de passe, il est demandé avant tout —
   avant de lire comme avant de déposer. Une seule porte, pas deux.
2. **L'album.** La page affiche ce qui est déjà là : la liste des fichiers,
   groupée par contribution et légendée « 40 photos de Sophie · 12 septembre »,
   avec les miniatures, la prévisualisation et le « tout télécharger » que la
   page de transfert sait déjà faire.
3. **L'identité.** Pour déposer :
   - connecté → rien à saisir, le compte identifie ;
   - non connecté → un prénom, puis une adresse à laquelle un code est envoyé.
     C'est **exactement** le mécanisme de `POST /verification/request-code` et
     `verify-code` qu'un expéditeur anonyme traverse déjà.
4. **Le dépôt.** Les fichiers s'ajoutent à l'album, qui se recharge.
5. **Après la fermeture de la collecte**, l'album reste lisible et le dépôt
   disparaît, remplacé par une phrase qui dit depuis quand c'est fermé.

### Ce que ça retire

Le jeton de dépôt cesse d'être un laissez-passer d'identité. Concrètement :
`CreateShareGuard` rend `true` dès qu'un jeton valide est présent
([`createShare.guard.ts:23-28`](../backend/src/share/guard/createShare.guard.ts)),
et le frontend s'exempte de la vérification par un `!isReverseShare`
([`UploadPage.tsx:90`](../frontend/src/components/upload/UploadPage.tsx)).
Les deux disparaissent — mais pas en modifiant ce garde, qui protège aussi
l'ancien chemin : le dépôt passe par des routes neuves (§7).

---

## 6. Le parcours du propriétaire

La page `/account/reverseShares` cesse d'être un tableau d'identifiants. Chaque
ligne devient une collecte :

- son nom, son lien, et un bouton copier ;
- **combien de personnes ont contribué**, et leurs prénoms ;
- le poids total et le nombre de fichiers ;
- l'état : *collecte ouverte jusqu'au X* / *fermée, album gardé jusqu'au Y* ;
- un accès direct à l'album.

Le propriétaire **ouvre l'album par le même lien que ses amis**, et il y est
reconnu comme créateur : le conteneur porte `creatorId = reverseShare.creatorId`,
ce qui referme au passage un défaut relevé en cartographie — aujourd'hui le
propriétaire visite les dépôts de son propre lien en simple visiteur, et le mot
de passe qu'il a lui-même choisi lui est réclamé.

Et le conteneur apparaît dans « Mes transferts », puisqu'il a enfin un créateur.

---

## 7. Les routes

Aucune route existante ne change de comportement. Trois routes nouvelles portent
le dépôt, ce qui évite de toucher `POST /shares` et son garde :

| Route | Rôle | Garde |
|---|---|---|
| `POST /reverseShares/:token/contributions` | Ouvre une contribution. Crée le conteneur s'il n'existe pas encore. Corps : `{ name? }` | Jeton valide **et** collecte ouverte **et** identité établie : compte connecté, ou adresse prouvée par le cookie de vérification |
| `POST /reverseShares/:token/contributions/:id/files?name=…&chunkIndex=…&totalChunks=…` | Reçoit les fichiers | La contribution est ouverte et appartient à ce lien |
| `POST /reverseShares/:token/contributions/:id/complete` | Ferme la contribution, invalide l'archive, notifie | Mêmes conditions |

`GET /reverseShares/:token` s'enrichit : il expose enfin `name` et `description`
— aujourd'hui absents du DTO — plus l'état de la collecte et le conteneur.

**Pourquoi une route de téléversement neuve plutôt que celle qui existe.**
`POST /shares/:shareId/files` est gardée par `StrictShareOwnerGuard`
([`file.controller.ts:96`](../backend/src/file/file.controller.ts)), c'est-à-dire
par la propriété du transfert — exactement ce qu'un contributeur n'a pas. Lui
ajouter un second identifiant acceptable élargirait le droit d'écriture sur
**tous** les transferts pour n'y servir qu'ici. La route neuve porte le même
corps, les mêmes paramètres de découpage et le même service en dessous ; seule
son autorisation diffère, et elle ne peut viser que le conteneur du lien nommé
dans son chemin.

**Relations inverses à ne pas oublier** — Prisma les exige des deux côtés :
`Share` reçoit `collectionOf ReverseShare? @relation("ReverseShareContainer")`
et `contributions ShareContribution[]`, `User` reçoit
`contributions ShareContribution[]`.

---

## 8. Les deux horloges, et l'archive

**Pendant la collecte** : `collectionEndsAt` gouverne le droit de déposer. Le
conteneur porte une expiration lointaine et ne doit être détruit par aucun cron.

**À la fermeture** : un cron horaire pose `expiration = collectionEndsAt +
retentionSeconds` sur le conteneur. À partir de là, le transfert expire comme
n'importe quel autre, par le chemin existant.

`ReverseShareService.remove()` ne doit plus expirer les dépôts en cascade
([`reverseShare.service.ts:139-148`](../backend/src/reverseShare/reverseShare.service.ts)) :
supprimer le lien ne doit pas supprimer l'album. Ce comportement est correct
pour l'ancien modèle et faux pour le nouveau.

**L'archive** : chaque contribution close pose `isZipReady = false` et relance
`createZip`. Le mécanisme existe (`share.service.ts:238`, `:297-303`) ; seul son
déclencheur change. Sur un album de plusieurs gigaoctets, reconstruire à chaque
dépôt est coûteux — à mesurer avant de se contenter de ça, et à remplacer par
une construction à la demande si le coût se voit.

---

## 9. Les liens existants

Un lien créé avant cette version possède déjà des dépôts séparés, rattachés par
`shares Share[]`. **Ils ne sont pas migrés** : ces transferts existent, ont leurs
liens, et les casser pour une cohérence de modèle serait une perte sèche.

À sa prochaine utilisation, un ancien lien se crée un conteneur et se comporte
comme un neuf. Ses anciens dépôts restent listés séparément, sous un intitulé qui
dit ce qu'ils sont. L'expiration par défaut d'un lien étant de trois jours, cette
cohabitation se résorbe d'elle-même en quelques jours.

---

## 10. Hors périmètre, délibérément

- **Supprimer ou remplacer sa propre contribution.** Souhaitable, mais demande
  une preuve d'identité persistante côté contributeur. À reprendre ensuite.
- **La déduplication entre contributions.** Deux amis déposant `IMG_4821.jpg`
  produisent deux fichiers homonymes dans le même album, et dans la même
  archive.
- **Les quotas.** `maxShareSize` reste un plafond par contribution, et le total
  de l'album continue de peser sur le quota du propriétaire seul.
- **`maxUseCount`.** Devient un plafond de contributions, son libellé est
  corrigé, et son défaut passe de 1 à une valeur qui laisse un groupe entier
  déposer. Rien de plus : le transformer en compteur de personnes demanderait de
  dédoublonner les identités.
- **Le bogue du cookie `publicAccess`** (`!!(getCookie(…) ?? true)` sur la chaîne
  `"false"`, toujours vraie) : à corriger à part, il n'attend pas ce chantier.

---

## 11. Vérification

Trois propriétés à écrire comme tests système, dans la collection Newman :

1. Deux contributions successives sur le même lien produisent **un** conteneur
   et **un seul**, portant les fichiers des deux.
2. Un dépôt sans identité prouvée est refusé — le jeton seul ne suffit plus.
3. Après `collectionEndsAt`, l'album se lit et le dépôt est refusé.

Puis en direct, sur `localhost:3333` :

4. Le parcours complet d'un contributeur non connecté : prénom, code reçu dans
   Mailpit, dépôt, et l'album qui contient sa contribution **et** celle d'un
   autre, correctement attribuées.
5. Le propriétaire ouvre l'album par le lien du jeton, n'a pas de mot de passe à
   saisir, et voit qui a contribué.
6. Un lien protégé par mot de passe le réclame avant de montrer quoi que ce soit.
7. Le « tout télécharger » de l'album rend une archive contenant les fichiers de
   toutes les contributions.
