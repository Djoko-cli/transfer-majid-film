# Accélérer la chaîne build → release → deploy de Transfer

**Pour qui :** la session Claude Code dédiée à Transfer.
**Origine :** « le workflow de build-release-deploy de Review est beaucoup plus
rapide que celui de Transfer, fais un brief de passation ».
**Statut :** mesuré run par run et étape par étape sur les deux dépôts, puis
soumis à une passe adverse qui a réfuté trois des correctifs proposés. Les
réfutations sont dans le document — ne les redécouvre pas.

Mesures prises le 2026-09-13 sur les 10 dernières releases de chaque dépôt.

---

## 0. À FAIRE TOUT DE SUITE, sans rapport avec la vitesse

**Le tag `v3.5.0` est poussé sur GitHub mais aucune release n'est publiée pour
lui.** Vérifié :

```
git tag --sort=-creatordate | head -1          → v3.5.0
gh api repos/…/git/refs/tags/v3.5.0            → refs/tags/v3.5.0  (existe)
gh api repos/…/releases/tags/v3.5.0            → 404
gh run list --workflow docker-build-push.yml   → le plus récent est v3.4.3
```

`docker-build-push.yml` ne se déclenche que sur `release: published`, donc
**aucune image `v3.5.0` n'existe sur GHCR**. Et comme
`backend-system-tests.yml` se déclenche, lui, sur `push: tags: v*`, un run vert
est bien apparu pour ce tag — ce qui donne l'illusion que la release est
passée. Le NAS tire `:latest`, qui pointe donc encore sur v3.4.3.

Publier la release (ou lancer `workflow_dispatch`) corrige. Et c'est exactement
le genre d'angle mort que `release-pointers.yml` rend visible (§6).

---

## 1. La mesure, et une correction au cadrage de départ

| | Review | Transfer |
|---|---|---|
| `docker-build-push`, médiane sur 10 releases | **177 s** | **340 s** |
| Étape `Build and push` seule | 140 s | 289 s |
| Tout le reste (checkout, metadata, login, buildx, post) | 17 s | 26 s |

**94 % de l'écart (149 s sur 158 s) est à l'intérieur d'une seule étape :
`Build and push`.** Tout ce qui ne change pas ce qui se passe dans
`docker/build-push-action` est du bruit.

**Correction importante :** j'avais annoncé « Transfer dépense ~10 min de CI par
release contre 2 ». C'est vrai en **minutes facturées**, pas en horloge murale.
`docker-build-push` et `docker-security` démarrent **à la même seconde**
(les deux jobs à `2026-09-06T10:06:38Z`) et tournent **en parallèle**. L'horloge
murale est donc 320 s contre 163 s. Supprimer le scan récupère ~266 s facturées
et **zéro seconde d'attente**. À dire clairement, sinon on attend un gain de
5 minutes qui ne viendra pas.

**Deux causes supposées, toutes deux éliminées :**

- **QEMU / arm64 : absent des deux.** Les deux workflows portent
  `platforms: linux/amd64`, et aucun log ne contient une ligne qemu/binfmt.
  Transfer a fait ce choix le 2026-08-28 (commit `5e68829`), avant toutes les
  mesures.
- **Cache manquant : non.** Les deux portent `cache-from: type=gha` et
  `cache-to: type=gha,mode=max`, mot pour mot.

Les deux fichiers de workflow sont quasi identiques. **L'écart ne vient pas de
la configuration CI.**

---

## 2. D'où viennent les 149 s

Décomposition du `Build and push`, run `34026500678` (v3.4.3) contre
`34198442323` (v2.6.3) :

| Poste | Review | Transfer | Écart |
|---|---|---|---|
| Export du cache vers GHA | 11,4 s | **87,5 s** | **+76 s (51 %)** |
| Build du frontend | 89,0 s | 125,3 s | +36 s (24 %) |
| Export + push de l'image | 15,7 s | 32,9 s | +17 s (12 %) |
| Restauration de `node_modules` | 24,3 s | 38,7 s | +14 s (10 %) |
| Contexte de build | 0,2 s | 10,0 s | +10 s (7 %) |

### La cause dominante : l'isolation du cache GHA par ref

C'est le mécanisme central, et il n'est écrit nulle part dans les deux dépôts.

**GitHub Actions cloisonne les caches par ref git.** Un run déclenché par une
release écrit dans `refs/heads/refs/tags/<tag>`, un scope **qu'aucune autre
release ne pourra lire**. Un run ne peut restaurer que son propre scope (vide,
la première fois) ou celui de la **branche par défaut**.

Vérifié sur l'API :

```
refs/heads/main                    867 647 081 o / 17 entrées  (2026-08-28)
refs/heads/refs/tags/v3.4.2      1 019 236 899 o / 27 entrées
refs/heads/refs/tags/v3.4.3        937 123 530 o / 26 entrées
```

Donc **chaque release de Transfer écrit ~940 Mo que personne ne relira jamais**,
et ne peut lire qu'un scope `main` figé au **2026-08-28**, soit neuf jours avant
v3.4.3.

**La preuve que ça coûte cher :** v3.4.2 → v3.4.3, c'est 4 fichiers et 79 lignes,
tous sous `backend/src`. `git diff --stat v3.4.2 v3.4.3 -- frontend/` est
**vide**. Les 2,5 heures qui séparent les deux releases n'ont rien changé au
frontend — et pourtant `RUN npm run build` a tourné **125,3 s**. Parce que
v3.4.3 ne pouvait pas lire le cache de v3.4.2.

> **Correction à ne pas se faire piéger :** les deux étapes `npm ci` (23,5 s et
> 29,2 s) ne sont **pas** des ratés de cache. Aucune n'émet une seule ligne de
> sortie npm ; ce sont des **succès de cache dont le blob a dû être téléchargé
> et décompressé** (183,08 Mo en 18,2 s, 398,30 Mo en 24,1 s). Les digests
> restaurés n'existent que sous `refs/heads/main`. Ce n'est pas 52,7 s
> d'installation évitable, c'est 52,7 s de restauration, proportionnelle à la
> taille de `node_modules`, pas à la config CI.

### Ce que contiennent réellement les 940 Mo exportés

Les huit plus gros blobs du scope v3.4.3 : 199,7 / 113,1 / **104,6 / 104,3 /
104,1** / 93,8 / 88,4 / 76,3 Mo. Quatre blobs autour de 104 Mo, et
`du -sk frontend/public/img/brand/derived` = **104 156 Ko** (838 fichiers).

**C'est l'imagerie de marque qui domine**, pas `node_modules` (ces blobs-là ont
été téléchargés, pas ré-envoyés — ils sont absents du scope v3.4.3). Elle entre
en couches séparées trois fois : `Dockerfile:10` (`COPY ./frontend .`), `:54`
(`COPY --from=frontend-builder /opt/app/public ./public`) et `:57`
(`COPY … /opt/app/public/img /tmp/img`).

Et l'export est **72,6 s de temps mort strictement sériel** : `#41` finit de
pousser l'image sur GHCR à `10:10:30.370`, `#43` tourne jusqu'à `10:11:42.997`.
C'est du temps passé après que le livrable existe.

> **Preuve que la config de cache est aujourd'hui à perte nette :**
> `docker-security.yml` construit **le même Dockerfile** avec `no-cache: true`
> en **201 s**, soit **88 s de moins** que le build « avec cache » à 289 s. Ce
> qui correspond presque exactement aux 87,5 s d'export.

---

## 3. Les correctifs — et ceux qui NE marchent PAS

### ✅ 1. Cache de registre au lieu du cache GHA — le seul qui règle la cause

```yaml
cache-from: type=registry,ref=ghcr.io/djoko-cli/transfer-majid-film:buildcache
cache-to:   type=registry,ref=ghcr.io/djoko-cli/transfer-majid-film:buildcache,mode=max
```

Le cache devient un artefact OCI dans GHCR, **qui n'a aucun cloisonnement par
ref** : chaque release lit ce que la précédente a écrit. Les identifiants
existent déjà — le workflow se connecte à GHCR à `docker-build-push.yml:32-37`
avec `packages: write`.

Gain attendu : les 76 s d'export **plus** le build frontend quand le frontend
n'a pas changé (125 s sur le cas v3.4.2→v3.4.3). Potentiellement 340 s → ~150 s.
**Confiance : haute sur le mécanisme, moyenne sur le chiffre** — voir §7.

### ✅ 2. `context: .` — à faire pour la correction, pas pour les 10 s

```yaml
context: .
file: ./Dockerfile
```

Sans clé `context:`, `docker/build-push-action` bascule sur le **contexte Git** :
BuildKit re-clone le dépôt lui-même (`#1 [internal] load git source … DONE
10.0s`), ce qui rend l'étape `actions/checkout@v3` (3 s) totalement inutile.

**La vraie raison de le faire est un piège de correction :** avec un contexte
Git, un build `workflow_dispatch` **ignore l'arbre qui a été extrait** et
construit ce qui est sur la ref distante.

> **Le gain de temps est surestimé par tout le monde.** Review transfère 3,35 Mo
> de contexte ; l'arbre suivi de Transfer fait 109 192 Ko, dont 104 156 Ko
> d'imagerie qui **ne peut pas être exclue** (`Dockerfile:10` copie tout
> `frontend/`). Tu remplaces 10 s de clone par le transfert local de ~108 Mo.
> Fais-le, mais ne promets pas 10 s.

### ✅ 3. Déplacer `ARG APP_VERSION` sous le bloc `apk`

`Dockerfile:42-43` place `ARG`/`ENV APP_VERSION` **au-dessus** de
`RUN deluser` (`:46`) et du bloc `apk` (`:48-51`). `APP_VERSION` change à chaque
tag, donc c'est une barrière de cache dure : **aucune couche du stage `runner`
ne peut jamais être en cache**. Mesuré : `#16 deluser` 2,6 s et `#17 apk` 11,4 s
tournent à chaque fois.

Deux lignes à descendre, ~14 s, aucun changement de comportement (`APP_VERSION`
reste lu au runtime). **C'est le seul vrai cas de « copier le placement de
Review ».**

### ❌ NE MARCHE PAS — `cache-to: type=gha,scope=release`

L'idée « donner à toutes les releases un scope partagé » est **fausse**.
L'isolation GHA est appliquée **par le service de cache, par ref git** ; le
`scope=` de buildkit ne fait que nommer la clé *à l'intérieur* de ce
cloisonnement. Il ne peut pas le franchir.

Preuve dans les données du dépôt : v3.4.3 tourne 2,5 h après v3.4.2 avec un
frontend octet pour octet identique, et le reconstruit quand même pendant
125,3 s. Un seul manifeste importé (`#4 importing cache manifest`).

**Si tu expédies ça, tu ne gagnes rien et tu brûles un cycle de release.**

### ❌ NE PAS COPIER — le `.dockerignore` de Review tel quel

Sa ligne 25 est `*.md` avec seulement `!README.md` réadmis. Or
`Dockerfile:30` de Transfer fait :

```
COPY mentionslegales.md conditionsutilisation.md politiqueconfidentialite.md ./legal/
```

trois fichiers suivis à la racine, lus par `config.seed.ts`. **La ligne `*.md`
casse le build.** Le sous-ensemble sûr (`docs/`, `.github`, `.env*`, la crasse
macOS) est portable mais ne vaut presque rien : `docs/` fait 912 Ko et aucun
`.DS_Store` n'est suivi.

### ❌ NE PAS PORTER — « pinner `caddy:2-alpine` par digest »

Ça concerne Review, qui a un stage `caddy-bin`. **Transfer n'en a pas** : il
fait `apk add caddy` dans le runner. Et le chiffre de ~51 s avancé pour Review
n'est pas vérifié (§7).

---

## 4. Le scan de sécurité : ne pas copier la réponse de Review

La réponse de Review est « ne pas avoir de scan ». **C'est la mauvaise leçon.**

`docker-security.yml` coûte ~266–304 s facturées et **0 s d'horloge murale**. Il
ne bloque rien, trois fois plutôt qu'une : `exit-code: "0"`, aucun `needs:`
nulle part, et c'est un workflow séparé du build.

Son `no-cache: true` est délibéré et documenté — pour que Trivy voie les vraies
versions de paquets OS. Mais il reconstruit un Dockerfile identique pour le
jeter.

**Le compromis qui garde la valeur et supprime le doublon :** sur `release`,
scanner **l'image qui a réellement été poussée**, par référence
(`ghcr.io/djoko-cli/transfer-majid-film:<tag>`), au lieu de reconstruire.
~300 s → ~40 s facturées, et on scanne ce qui part en production plutôt qu'une
reconstruction jetable. Le `no-cache: true` garde alors tout son sens sur le
déclencheur **hebdomadaire**, où il sert à attraper une CVE dans une image de
base inchangée.

Et une vraie question à trancher : un scan qui ne bloque rien et que personne
n'est obligé de lire, payé au prix fort, c'est le pire des deux mondes. Soit il
devient bon marché, soit il devient bloquant (`exit-code: 1` + `needs:`).

---

## 5. Ce que Review fait, que Transfer ne peut PAS copier en changeant un fichier

**La vitesse de Review tient en partie à une habitude manuelle.**

Runs `workflow_dispatch` sur `main` de `docker-build-push.yml` :

- **Review** : 2026-09-03, 09-05, 09-06 — trois en six jours. Son index
  buildkit sur `main` date du 09-06, deux jours avant la release v2.6.3.
- **Transfer** : 2026-08-28 ×4, **plus rien depuis**. Index `main` du 08-28,
  neuf jours avant v3.4.3.

Comme le seul scope lisible depuis une release est celui de la branche par
défaut, Review lit un cache d'un à deux jours et Transfer un cache de neuf
jours. **Ce n'est pas une propriété du fichier de workflow, c'est un rythme.**

Et `ci.yml` de Review **ne réchauffe rien** : son job docker utilise le CLI nu
(`docker build -t review:prod -f Dockerfile .`) sans aucun `cache-from` /
`cache-to`. Ce qui prouve que le réchauffage vient bien des dispatches manuels.

Deux façons d'y remédier pour de bon :
- **(a)** le cache de registre (§3.1), qui supprime le problème au lieu de le
  contourner ;
- **(b)** `push: branches: [main]` sur `docker-build-push.yml`, qui maintient le
  scope `main` chaud automatiquement — mais dépense un build à chaque push.

**(a) est meilleur.** Et à noter : **Review a exactement le même défaut**, en
9× plus petit (douze scopes par tag de ~105 Mo chacun, jamais relus).

---

## 6. Ce que Review a en plus, et qui ne coûte rien

Ni l'un ni l'autre ne fait gagner une seconde. Ce sont de l'hygiène de release.

- **`release-pointers.yml`** (11 s) — sur release publiée, non pré-release,
  avance de force une branche `latest` sur le commit du tag. Recommandé :
  **ça aurait rendu l'image manquante de v3.5.0 visible** (§0).
- **`promote-stable.yml`** — promotion manuelle d'un tag vers `stable`, en
  **refusant un tag dont les checks CI ne sont pas tous verts**, avec rollback
  par re-promotion d'un tag plus ancien. Transfer n'a aujourd'hui **aucune
  porte entre un tag et la production** : `docker-compose.yml:4` épingle
  `:latest` flottant.

  Honnêteté requise : ce workflow est du code correct que son auteur **n'a
  jamais lancé** — `stable` est encore sur v1.11.0 du 29 août, quinze releases
  en arrière. À adopter pour ce qu'il fait, pas parce que Review s'en sert.

---

## 7. Ce que Transfer fait MIEUX que Review

Un brief intitulé « adopter la chaîne de Review » pousse à tout aligner. Sur ces
points, **c'est l'inverse qu'il faut faire.**

1. **`concurrency` + `timeout-minutes`.** `docker-security.yml` de Transfer a les
   deux. Le `docker-build-push.yml` de Review **n'a ni l'un ni l'autre** : deux
   releases publiées coup sur coup construiraient en parallèle sans s'annuler,
   sans limite de durée. À porter **vers Review**.
2. **Une vérification au moment de la release.** `backend-system-tests.yml` se
   déclenche sur `push: tags: v*` (1 min 22). `ci.yml` de Review ne se déclenche
   **jamais** sur une release. Transfer paie ~350–390 s facturées pour du signal
   consultatif ; Review paie 0 s pour **aucun signal**. Prendre la réponse de
   Review au pied de la lettre reviendrait à supprimer la seule vérification au
   moment de la release qui existe dans les deux dépôts.
3. **`docker-security.yml` utilise déjà `context: .`** et des actions plus
   récentes que `docker-build-push.yml` du même dépôt. Le correctif §3.2 est
   dans le dépôt, juste dans le mauvais fichier.

---

## 8. Ordre de travail

1. **Publier la release v3.5.0** (§0). Sans rapport avec la vitesse, mais
   c'est de la production qui n'a pas été livrée.
2. **Mesurer le build à froid** avant de toucher quoi que ce soit (§9, Q1).
   Tous les classements ci-dessus en dépendent et personne ne l'a.
3. **`context: .` + `file: ./Dockerfile`** — deux lignes, la plus haute
   confiance, et c'est une correction autant qu'une optimisation.
4. **Descendre `ARG APP_VERSION`** sous le bloc `apk` — deux lignes, ~14 s.
5. **Basculer le cache sur `type=registry`** — le vrai correctif. Mesurer
   deux releases successives avant/après.
6. **Le scan de sécurité** : scanner l'image poussée sur `release`, garder le
   `no-cache: true` sur le cron hebdomadaire.
7. **`release-pointers.yml`**, puis `promote-stable.yml` si la porte CI-verte
   est voulue.
8. **Porter `concurrency` + `timeout-minutes` vers Review** (§7.1).

---

## 9. Questions ouvertes

1. **Quel est le chiffre à froid ?** La mesure la plus utile avant tout
   correctif : lancer `workflow_dispatch` sur `main` deux fois de suite et
   relever `#13`, `#14`, `#24`, `#25` et `#43`. Le premier run donne le vrai
   coût de `npm ci` et du build frontend sans cache ; le second donne le
   plancher atteignable. Tout le §2 repose dessus.
2. **Cache de registre ou réchauffage de `main` ?** (a) supprime le
   cloisonnement et ~940 Mo de churn par release, mais déplace le cache dans
   GHCR ; (b) est plus petit mais dépense un build à chaque push sur main.
3. **Les 104 Mo d'imagerie ont-ils leur place dans l'image ?** Ils sont déjà sur
   le NAS, montés en lecture seule comme `MAJIDFILM_SOURCE_ROOT` pour la
   synchro, et pourtant embarqués trois fois dans l'image. C'est le principal
   levier sur l'export du cache ET sur l'export de l'image.
4. **Le résultat Trivy doit-il bloquer quelque chose ?** Aujourd'hui
   `exit-code: "0"`, `vuln-type: os` seulement (les dépendances npm ne sont pas
   scannées), et l'upload SARIF a été retiré.
5. **Quelle est la taille de l'image publiée de Transfer ?** Pas lisible avec
   les identifiants de cette machine (GHCR refuse un jeton de pull sur ce
   paquet ; celui de Review se lit : 20 couches, 358,2 Mo compressés).
6. **Confirmer qu'aucun changement retenu ne touche le chemin SQLite.**
   `/volume2/docker/transfer/db:/db` n'est délibérément pas auto-`chown`é
   (`create-user.sh` ne parcourt que `backend/data` et `frontend/public`), et le
   commentaire du compose documente que ça a réellement cassé quand PUID/PGID
   ont changé.
7. **Le digest de `caddy:2-alpine` a-t-il réellement changé** entre le dispatch
   du 09-06 de Review et sa release du 09-08 ? C'est le maillon non vérifié
   d'une estimation à ~51 s côté Review. À ne pas citer avant de l'avoir lu
   dans le log.
