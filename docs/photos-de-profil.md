# Les photos de profil

**Pour qui :** la session Claude Code dédiée à Transfer.
**Objectif :** qu'un compte ait un visage — récupéré de l'annuaire OpenID quand
il y en a un, envoyé à la main sinon — et que ce visage remplace le rond gris de
la navbar.
**Statut :** design validé par Majid le 19 septembre 2026. **Rien n'est
implémenté.** Ce document est la spécification ; le plan d'implémentation vient
après sa relecture.

Dépôt lu au commit `2c7dd1f6`. Toutes les citations `fichier:ligne` ci-dessous
ont été ouvertes et vérifiées à la main, pas déduites.

---

## 0. Le résultat en une phrase

**Une seule image normalisée par compte**, produite par le même pipeline qu'elle
vienne d'un envoi manuel ou de l'annuaire, servie par une seule route, visible de
son seul propriétaire.

---

## 1. Les décisions prises

| Question | Décision | Ce qui a été écarté, et pourquoi |
|---|---|---|
| La photo OpenID | **Récupérée une fois côté serveur et stockée chez nous**, si et seulement si le compte n'a pas encore de photo | Pointer directement l'URL de l'IdP : signale l'utilisateur à Google/Microsoft à chaque chargement de page, casse quand l'URL expire ou exige une authentification, et oblige à ouvrir la CSP à des domaines tiers |
| Le cadrage | **Recadrage carré automatique**, à la volée (§4) | Un recadreur dans la page : porte laissée ouverte (§8), le serveur n'aura pas à bouger |
| La préséance | **Un envoi manuel gagne toujours** sur l'annuaire | |
| La visibilité | **Son propriétaire et les administrateurs** | Montrer l'avatar sur les listes de contributeurs : c'est une décision d'exposition publique, elle mérite sa propre conversation. Les administrateurs, eux, doivent pouvoir modérer une image inappropriée sur une instance ouverte à d'autres comptes — d'où les routes `users/:id/avatar` du §5 bis, admin uniquement, qui ne posent jamais de photo, seulement la lire et la retirer |
| La taille acceptée | **5 Mio** (5 × 1024 × 1024 octets), comme Review.majid.film | |
| La taille stockée | **10 à 25 Ko** — WebP carré **512 px**, toujours ré-encodé | Stocker l'original : voir §4. 256 px : trop petit pour un écran Rétina sur la page « mon compte » |

---

## 2. Ce qui existe déjà, et qu'on réutilise

- **La navbar a déjà le composant, sans source** :
  `<Avatar size={28} />` ([`ActionAvatar.tsx:21`](../frontend/src/components/header/ActionAvatar.tsx)).
  Il lui manque `src` et `radius="xl"` — Mantine 6 rend un carré arrondi par
  défaut, pas un cercle.
- **Le claim `picture` arrive déjà dans le jeton décodé** et n'est lu nulle part :
  `idTokenData` ([`genericOidc.provider.ts:169`](../backend/src/oauth/provider/genericOidc.provider.ts)),
  dont l'interface `OidcIdToken` (:508) ne déclare pas encore le champ.
- **Google, Microsoft et l'OIDC générique passent tous par `GenericOidcProvider`**
  ([`google.provider.ts:9`](../backend/src/oauth/provider/google.provider.ts),
  [`microsoft.provider.ts:9`](../backend/src/oauth/provider/microsoft.provider.ts)).
  L'écrire une fois couvre les trois. GitHub et Discord implémentent l'interface
  directement et restent hors périmètre (§8).
- **`sharp@0.35.3` est déjà une dépendance** ([`package.json:66`](../backend/package.json))
  **et n'est importé nulle part** : les miniatures passent par ffmpeg.
  `@img/sharp-linuxmusl-x64` et `@img/sharp-libvips-linuxmusl-x64` sont dans le
  lockfile, l'image est `node:24-alpine` ([`Dockerfile:15`](../Dockerfile)) et la
  cible `linux/amd64` ([`docker-build-push.yml:70`](../.github/workflows/docker-build-push.yml)).
  **Mais rien ne l'a jamais exercé** : la tâche 1 doit prouver que `require("sharp")`
  résout dans l'image construite, pas le supposer.
- **`brandSlides.controller.ts:85`** sert déjà une image en `StreamableFile` avec
  ses en-têtes : c'est le modèle à suivre.

---

## 3. Le modèle de données

**Une colonne, et c'est tout.**

```prisma
model User {
  // Non-nulle veut dire « ce compte a une photo » ; le chemin du fichier s'en
  // déduit, il n'a pas à être stocké. Sert aussi de cache-buster dans l'URL :
  // la navbar doit cesser d'afficher l'ancienne image à la seconde où elle
  // change, et c'est ce que `?v=` porte.
  avatarUpdatedAt DateTime?
}
```

**Migration :** `prisma migrate diff --from-schema-datasource
--to-schema-datamodel --script` vers un dossier créé à la main, puis
`migrate deploy`. `prisma migrate dev` échoue en non-interactif dans ce dépôt.

**Les octets :** `DATA_DIRECTORY/avatars/<userId>.webp`, via une constante
`AVATAR_DIRECTORY` posée à côté de `BRAND_IMAGE_DIRECTORY`
([`constants.ts:62`](../backend/src/constants.ts)). Même volume que les
partages, donc rien à monter de plus sur le NAS.

**Suppression d'un compte :** le fichier part avec. Prisma n'a pas de hook pour
ça, donc c'est `UserService.delete` qui le retire explicitement, avant la
suppression de la ligne — un fichier orphelin ne se retrouve jamais tout seul.

**Le DTO :** `UserDTO` gagne `avatarUpdatedAt`, **avec `@Expose()`**. Sans lui le
champ disparaît silencieusement de toutes les réponses : `from()` sérialise avec
`excludeExtraneousValues: true` ([`user.dto.ts:88`](../backend/src/user/dto/user.dto.ts)).

---

## 4. Le pipeline d'image : une seule porte

`AvatarService.store(userId: string, bytes: Buffer): Promise<Date>` est le
**seul** endroit du code qui écrit un avatar. Les deux sources y passent, sans
exception et sans branche « stocker tel quel ».

**512 px et pas 256** : le rond de la navbar en fait 28, mais la page « mon
compte » l'affiche en grand, et un écran Rétina demande deux pixels physiques
par pixel CSS. 256 y serait visiblement mou.

```ts
await sharp(bytes, { limitInputPixels: 50_000_000 })
  .rotate()                                                   // applique l'orientation EXIF, puis la jette
  .resize(512, 512, { fit: "cover", position: "attention" })
  .webp({ quality: 82 })
  .toBuffer();
```

Quatre propriétés tombent de là, et c'est pour ça qu'il n'y a pas de chemin
alternatif :

1. **Le type est prouvé par le décodage**, jamais cru sur parole d'un en-tête
   `Content-Type` que l'appelant contrôle.
2. **Un fichier piégé ne survit pas au ré-encodage** — ce qui sort de sharp est
   une image que sharp a écrite, pas celle qu'on lui a donnée.
3. **La navbar télécharge quelques dizaines de Ko** pour son rond, pas 5 Mo.
4. **`limitInputPixels` borne la bombe à décompression** : une image de 100 Ko
   qui se déplie en 50 000 × 50 000 pixels est refusée avant d'être allouée.

`position: "attention"` laisse sharp choisir la région la plus saillante plutôt
que le centre géométrique. C'est gratuit et ça rattrape la plupart des portraits
décentrés — ce qui rend le recadreur manuel (§8) d'autant moins urgent.

`.rotate()` **sans argument** applique l'orientation EXIF puis la supprime. Sans
lui, une photo prise au téléphone en portrait arrive couchée. Le reste des
métadonnées EXIF — dont **les coordonnées GPS** — ne survit pas non plus, ce qui
est le comportement voulu pour une image que le compte expose de lui-même.

Mesuré sur trois photographies réelles du dépôt (`lespotscasses-s2-3840`,
`kalou-s4-2048`, `cavacava-s5-3840`, de 2048×1577 à 3840×1634) : **11,6 à
25,3 Ko** en sortie. Les mêmes en 256 px donnaient 3,2 à 9,6 Ko — le passage
à 512 coûte donc une dizaine de kilo-octets par compte, une fois.

Un décodage qui échoue lève une `BadRequestException` avec un message i18n, pas
une 500 : « ce fichier n'est pas une image que nous savons lire ».

---

## 5. Les trois routes

Toutes sous `@UseGuards(JwtGuard)`, toutes sur soi-même : le `userId` n'est
jamais un paramètre, il vient du jeton. **C'était vrai de toutes les routes
d'avatar tant qu'il n'y en avait qu'un jeu ; le §5 bis en ajoute un second,
réservé aux administrateurs, où le `userId` est cette fois un paramètre de
chemin.**

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/users/me/avatar` | octets bruts, `Content-Type: image/*`, **≤ 5 Mio** | `201` + le `UserDTO` à jour |
| `GET /api/users/me/avatar` | — | `200` WebP, ou `404` si la colonne est nulle |
| `DELETE /api/users/me/avatar` | — | `204`, idempotent |

### Le plafond vit sur la route, pas dans `main.ts`

Le `bodyParser.raw` global ([`main.ts:49`](../backend/src/main.ts)) ne parse que
`application/octet-stream` et se cale sur `share.chunkSize`, dont la valeur par
défaut est 10 000 000 ([`config.seed.ts:125`](../backend/prisma/seed/config.seed.ts)).
S'en servir couplerait deux limites sans rapport : un admin qui baisse la
taille de chunk casserait l'envoi de photos sans jamais faire le lien.

On ajoute donc un parseur **borné au chemin**, juste après l'existant :

```ts
app.use(
  "/api/users/me/avatar",
  bodyParser.raw({ type: "image/*", limit: AVATAR_MAX_BYTES }),
);
```

Le chemin porte `/api` parce que `setGlobalPrefix("api")` est appelé **après**
ce `app.use` : Express filtre sur l'URL réellement reçue.
`AVATAR_MAX_BYTES = 5 * 1024 * 1024` va dans `constants.ts`, en dur — ce n'est
pas un réglage d'administration, et une valeur que personne ne tourne n'a rien à
faire dans la table de configuration.

Au-delà, Express lève `PayloadTooLargeError` et Nest répond `413`. Le front
vérifie la taille **avant** d'envoyer (§7), donc en pratique personne ne voit
cette réponse ; elle reste la ceinture pour un appel direct à l'API.

### Le cache

`GET` répond avec `Cache-Control: private, max-age=31536000, immutable`, ce qui
n'est correct **que** parce que le front appelle toujours l'URL avec
`?v=<avatarUpdatedAt en ms>`. Changer de photo change `v`, donc change l'URL,
donc contourne le cache immédiatement. `private` parce que l'image appartient à
un compte et n'a rien à faire dans un cache partagé.

---

## 5 bis. Les routes d'administration

Deux routes de plus, dans un contrôleur séparé
([`adminAvatar.controller.ts`](../backend/src/avatar/adminAvatar.controller.ts)),
sous `@Controller("users/:id/avatar")` et `@UseGuards(JwtGuard,
AdministratorGuard)`. Elles réutilisent `AvatarService.read`/`.remove` telles
quelles — le service prenait déjà un `userId` en paramètre, rien à y changer.

| Route | Réponse |
|---|---|
| `GET /api/users/:id/avatar` | `200` WebP (mêmes en-têtes que la route `me`), `404` si le compte visé n'a pas de photo |
| `DELETE /api/users/:id/avatar` | `204`, idempotent |

**Un administrateur peut voir et retirer la photo d'un autre compte. Il ne
peut pas en poser une** : de quoi modérer une image inappropriée, pas de quoi
choisir le visage de quelqu'un d'autre à sa place.

**Pourquoi un fichier séparé de `avatar.controller.ts` :** ce dernier est
`@Controller("users/me/avatar")` et son invariant se lit à l'œil — aucune de
ses méthodes ne lit de paramètre de route, l'identifiant vient toujours du
jeton. Y ajouter des routes `:id` ferait disparaître cette propriété de la
lecture.

**Le piège de l'ordre d'enregistrement :** `users/:id/avatar` capture aussi
`users/me/avatar` — `me` est une valeur de `:id` comme une autre pour le
routeur. Dans [`avatar.module.ts`](../backend/src/avatar/avatar.module.ts),
`AvatarController` (la route `me`) doit donc rester déclaré **avant**
`AdminAvatarController` dans le tableau `controllers`, sans quoi une requête
sur `me` serait interceptée par le contrôleur `:id`.

**Le garde qui échoue ouvert n'est pas un problème ici :** `JwtGuard` laisse
passer une requête sans utilisateur quand `share.allowUnauthenticatedShares`
est activé — ce qu'il a fallu border explicitement sur les routes `me`
(`AvatarController.requireUser`). `AdministratorGuard` rend `false` dès que
`request.user` est absent ([`isAdmin.guard.ts`](../backend/src/auth/guard/isAdmin.guard.ts)),
donc ce cas est déjà couvert : un utilisateur absent ne peut jamais être
admin.

---

## 6. Le chemin OpenID, et son garde-fou

### La plomberie

1. `OidcIdToken` ([`genericOidc.provider.ts:508`](../backend/src/oauth/provider/genericOidc.provider.ts))
   gagne `picture?: string`.
2. `GenericOidcProvider.getUserInfo` le recopie dans le DTO qu'il renvoie ;
   `OAuthSignInDto` gagne `pictureUrl?: string`.
3. **Deux points d'accroche**, tous les deux dans
   [`oauth.service.ts`](../backend/src/oauth/oauth.service.ts) :
   - `signUp`, juste après la création, où `result.user.id` est disponible ;
   - `link`, la branche « un utilisateur est déjà connecté » du contrôleur
     ([`oauth.controller.ts`](../backend/src/oauth/oauth.controller.ts)),
     appelée aussi bien pour une première association que pour une
     réassociation après un retrait délibéré (« mon compte » → dissocier →
     se réassocier). C'est même *le* chemin qu'on emprunte quand on veut
     déclencher la récupération délibérément — l'oublier revient à ne couvrir
     que l'inscription, jamais la reprise volontaire. `link()` reçoit
     `pictureUrl` du contrôleur (disponible deux lignes plus haut, dans
     `user.pictureUrl`) et relit l'utilisateur en base pour connaître son
     `avatarUpdatedAt` avant d'appeler `ingestFromOidc` — `signUp`, lui, n'a
     pas besoin de cette relecture : le compte vient d'être créé, sa colonne
     est nulle par construction.
   Cette section prescrivait d'abord un point dans `signIn`, branche « compte
   déjà lié » : c'est ce qui défaisait un retrait délibéré à la connexion
   suivante (voir l'encadré ci-dessous), et il a été retiré — `link()` n'est
   pas ce point-là, c'est l'association explicite, pas une connexion
   ordinaire.
4. Les deux appels sont **sans `await`** : une photo n'a pas le droit de
   ralentir une inscription ou une association, encore moins de les faire
   échouer. Conséquence assumée : au premier chargement qui suit
   l'inscription ou l'association, `avatarUpdatedAt` est encore nulle et la
   navbar montre le rond gris ; la photo apparaît au chargement suivant.

`AvatarService.ingestFromOidc(user, pictureUrl)` **rend la main immédiatement**
si l'URL est absente ou si `user.avatarUpdatedAt` n'est pas nulle. C'est là que
vit la règle « une fois, et l'envoi manuel gagne » — pour les deux appelants :
une photo déjà présente n'est donc jamais remplacée par une réassociation.

**Non testé, et ça ne peut pas l'être avec ce harnais.** Le câblage de
`link()` n'a aucune couverture automatisée : la suite Newman ne peut pas
simuler un annuaire OpenID (il faudrait un IdP factice), et ce dépôt n'a pas
de test d'intégration NestJS capable de monter `OAuthController` avec un
utilisateur déjà connecté. Seule la lecture du code — et une vérification
manuelle en navigateur, si l'occasion se présente — en répond.

### Le garde-fou SSRF

Cette URL est fournie par un tiers. Derrière le serveur il y a ton réseau NAS.
La liste suivante n'est pas une précaution de principe, c'est le cœur de la
tâche.

- **`https:` uniquement.** Pas de `http:`, pas de `file:`, pas de `data:`.
- **Pas d'identifiants dans l'URL** (`https://user:pass@…`).
- **Refus de toute adresse non publique** : boucle locale (127.0.0.0/8, ::1),
  privées (10/8, 172.16/12, 192.168/16), lien-local (169.254/16 — **c'est
  l'adresse des métadonnées cloud**), unique-local (fc00::/7), non spécifiée
  (0.0.0.0, ::), et les formes IPv4-mappées de tout ce qui précède.
- **La vérification se fait au moment de la connexion, pas avant.** Un contrôle
  fait sur le résultat d'un `dns.lookup` puis suivi d'un `connect` séparé laisse
  une fenêtre de reliaison DNS : le nom résout vers une adresse publique pendant
  le test, vers 127.0.0.1 pendant la connexion. On passe donc un `lookup`
  personnalisé à `node:https`, qui refuse l'adresse à l'instant où la socket
  l'utilise. Aucune dépendance nouvelle.
- **Trois redirections au maximum**, chaque saut repassant l'URL par les mêmes
  règles.
- **Cinq secondes au total**, puis abandon.
- **Lecture coupée à `AVATAR_MAX_BYTES`**, socket détruite — on ne fait pas
  confiance au `Content-Length` annoncé.

Un échec est journalisé en `warn` et rien d'autre ne se passe : la personne
enverra sa photo à la main.

**Corrigé pendant l'exécution — la récupération n'a lieu qu'à l'inscription, pas
à chaque connexion.** Cette section disait d'abord « tant que la colonne reste
nulle, la tentative sera rejouée à la connexion suivante », ce qui contredisait
le §1 : `remove()` remet la colonne à nul, donc un retrait délibéré était défait
à la connexion suivante par l'annuaire. Un retrait est une décision manuelle au
même titre qu'un envoi, et « un envoi manuel gagne toujours » doit valoir pour
les deux. Ce qu'on perd : le rattrapage d'un échec réseau à la connexion
suivante — qui échoue à l'inscription enverra sa photo à la main. Ce qu'on
gagne : un retrait qui tient, et la disparition complète de la requête sortante
par connexion que cette section assumait « à contrecœur ».

---

## 7. Le front

### La navbar

[`ActionAvatar.tsx:21`](../frontend/src/components/header/ActionAvatar.tsx)
devient :

```tsx
<Avatar size={28} radius="xl" src={avatarSrc} />
```

où :

```ts
const avatarSrc = user?.avatarUpdatedAt
  ? `/api/users/me/avatar?v=${new Date(user.avatarUpdatedAt).getTime()}`
  : undefined;
```

Mantine retombe sur son propre placeholder quand `src` vaut `undefined` **ou**
quand l'image échoue à charger : sans photo, l'affichage est exactement celui
d'aujourd'hui. `radius="xl"` est le cercle demandé.

`CurrentUser` (`frontend/src/types/user.type.ts`) gagne `avatarUpdatedAt?: string`.

### La page « mon compte »

Un nouveau `<Paper p="xl">` **en tête**, avant le bloc « informations »
([`account/index.tsx:189`](../frontend/src/pages/account/index.tsx)) — c'est la
chose la plus personnelle de la page, elle passe devant. Il contient :

- l'avatar en `size={96} radius="xl"` ;
- un `<FileButton>` Mantine acceptant
  `image/png,image/jpeg,image/webp,image/gif,image/avif` ;
- un bouton « retirer », affiché **seulement** quand il y a une photo.

**Le contrôle de taille est fait aussi côté navigateur** : `file.size > 5 Mo`
lève un toast et n'envoie rien. Refuser un fichier de 40 Mo après l'avoir
téléversé serait une insulte à une connexion montante d'ADSL.

`userService` gagne `uploadAvatar(file: File)` — qui poste le `File` tel quel
avec `Content-Type: file.type` — et `deleteAvatar()`. Les deux appellent
`refreshUser()` en sortie, sinon la navbar garde l'ancienne image jusqu'au
prochain rechargement.

**i18n**, dans `fr-FR.ts` et `en-US.ts` : le titre du bloc, sa description, les
deux boutons, le toast de succès, le toast « fichier trop lourd », le toast
« ce n'est pas une image lisible ».

---

## 8. Hors périmètre, délibérément

- **Le recadreur manuel.** La porte est explicitement ouverte : il enverra des
  coordonnées de recadrage en plus, et `AvatarService.store()` n'aura pas à
  changer — juste à les passer à `.extract()` avant `.resize()`.
- **GitHub et Discord.** Leur avatar ne transite pas par un jeton OIDC mais par
  leur propre API ; ce sont deux providers séparés
  ([`github.provider.ts:9`](../backend/src/oauth/provider/github.provider.ts),
  [`discord.provider.ts:8`](../backend/src/oauth/provider/discord.provider.ts)).
  Ajoutables plus tard, un appel chacun, sans rien défaire.
- **La photo LDAP** (`jpegPhoto` / `thumbnailPhoto`).
- **L'avatar sur les listes de contributeurs ou de destinataires.** C'est un
  changement d'exposition, pas une extension d'affichage.
- **Un interrupteur d'administration** pour désactiver la fonction.

---

## 9. Vérification

**Unitaire — c'est le validateur d'URL qui porte le risque**, donc c'est lui qui
est testé en premier et le plus : `http://`, `https://127.0.0.1/a.png`,
`https://10.0.0.5/a.png`, `https://169.254.169.254/latest/meta-data`,
`https://[::1]/a.png`, `https://[::ffff:127.0.0.1]/a.png`,
`https://user:pass@example.com/a.png`, une URL publique valide, et une chaîne de
redirections dont le troisième saut pointe vers une adresse privée.

**Système (Newman)**, dossier `[Avatar]` ajouté à
[`newman-system-tests.json`](../backend/test/newman-system-tests.json) :
envoi d'un PNG valide → `200` ; relecture → `200` et `Content-Type: image/webp` ;
envoi d'un fichier qui n'est pas une image → `400` ; envoi de 6 Mo → `413` ;
suppression → `204` ; relecture après suppression → `404` ; lecture sans jeton →
`401`.

Dossier `[Avatar admin]` séparé, pour le §5 bis : un compte non-admin qui lit
la photo d'un autre compte → `403` (le test qui garde la règle) ; un
administrateur qui lit la photo d'un autre compte → `200`, octets vérifiés
(`RIFF`/`WEBP`, comme la route `me`) ; un administrateur qui la retire →
`204`.

**En navigateur** : le cercle de la navbar avant/après envoi, à 375 px et en
desktop, et la disparition de l'image au retrait sans rechargement de page.

**Dans l'image Docker** : prouver que `require("sharp")` résout et qu'un
encodage WebP aboutit. Rien ne l'a jamais fait ; une dépendance déclarée n'est
pas une dépendance qui fonctionne.
