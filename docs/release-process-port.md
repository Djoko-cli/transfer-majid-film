# Le procédé build → release → deploy de Review

**Pour qui :** la session Claude Code dédiée à Transfer.
**Quoi :** la *manière d'opérer* — ce qui se tape, dans quel ordre, qui décide
quoi. Pas les secondes de CI : celles-là sont dans `CI-RELEASE-PORT.md`, qui est
un sous-produit de cette enquête et **pas** le sujet ici.

Ce qui rend la boucle de Review rapide n'est presque jamais la machine. C'est
qu'à chaque étape il n'y a **qu'une commande, non interactive, et rien à
décider**.

---

## 1. La boucle, telle qu'elle est réellement pratiquée

### Étape 1 — Commit, à chaque changement vérifié

Un commit par changement **vérifié**, jamais spéculatif, poussé immédiatement,
et le SHA court annoncé à Majid dans la foulée. Jamais de travail qui
s'accumule non committé.

```bash
git add <les fichiers précis>
git commit -F - <<'MSG'
Résumé à l'impératif

Le problème, l'approche, et comment c'est vérifié — avec les nombres mesurés,
jamais un "devrait marcher".
MSG
git push origin main
```

Directement sur `main`, pas de branche ni de PR : c'est un projet perso. Les
messages sont de la prose, pas des listes de fichiers touchés.

**Ce que ça donne à la release :** le `CHANGELOG` et les notes de release
s'écrivent tout seuls, parce que chaque corps de commit contient déjà le
pourquoi et la mesure. Il n'y a jamais à reconstituer ce qui s'est passé.

### Étape 2 — Le CHANGELOG s'alimente en continu

`CHANGELOG.md` porte une section `## [Unreleased]` avec `### Added`,
`### Fixed`, `### Changed`. Les entrées sont écrites **pour un lecteur**, pas
comme un journal de commits : un paragraphe par changement visible, qui dit ce
qui se passait avant et ce qui se passe maintenant.

Elles sont ajoutées **au moment du changement**, pas au moment de la release.
C'est ce qui fait que couper une version ne coûte rien.

### Étape 3 — La release, sur signal explicite uniquement

```bash
# 1. déplacer [Unreleased] sous un en-tête daté
#    ## [X.Y.Z] - AAAA-MM-JJ

# 2. tagger et pousser
git tag vX.Y.Z            # en général HEAD de main
git push origin vX.Y.Z

# 3. publier la release, notes lues depuis un fichier (jamais d'éditeur)
gh release create vX.Y.Z \
  --repo Djoko-cli/review-majid-film \
  --title "X.Y.Z — <titre en français>" \
  --notes-file /chemin/vers/notes.md
```

Les notes sont **en français**, groupées par thème (`## Thème` par domaine
fonctionnel), une ligne par changement visible côté utilisateur, écrites pour
être lues sur GitHub.

### Étape 4 — L'image se construit seule

`release: published` déclenche `docker-build-push.yml`, qui pousse sur
`ghcr.io/djoko-cli/review-majid-film` avec les tags semver plus `latest`.
`release-pointers.yml` avance la branche `latest` sur le tag.

**Rien à faire.** On attend, on vérifie que le run est vert.

### Étape 5 — Le déploiement, sur signal explicite uniquement

```bash
ssh nas
cd /volume2/docker/review
/usr/local/bin/docker compose pull
/usr/local/bin/docker compose up -d
```

C'est tout. Le NAS ne contient **que trois choses** :

```
/volume2/docker/review/
├── config/              (config.yaml, secrets.env)
├── data/                (postgres, redis, minio)
└── docker-compose.yml
```

**Aucune source.** Le compose ne fait que `pull` une image déjà construite.

---

## 2. Les cinq propriétés qui rendent la boucle rapide

Ce sont elles qu'il faut porter, pas les fichiers.

1. **Aucune étape interactive.** `--notes-file` plutôt qu'un éditeur,
   `compose up -d` plutôt qu'une console. Rien n'attend une frappe.
2. **Rien à construire à la main.** Le seul artefact est l'image, et c'est la
   CI qui la fabrique sur publication de la release. Il n'y a pas de build local
   à lancer, donc pas de « ça marche chez moi ».
3. **Le NAS ne porte pas de source.** Le déploiement est un `pull` + `up -d`,
   deux commandes idempotentes. Pas de `git pull`, pas de `build` sur le NAS,
   pas de transfert de fichiers.
4. **La lecture du NAS est libre, seule l'écriture attend.** `ssh nas`, lister
   les conteneurs, lire les logs, interroger Postgres, mesurer un endpoint en
   production : tout ça se fait sans demander. Ce qui attend le signal de Majid,
   c'est `compose pull/up`, redémarrer un conteneur, et `gh release create`.
   **Conséquence pratique : le diagnostic ne bloque jamais.** C'est ce qui fait
   que les questions se tranchent avec un fait mesuré plutôt qu'une hypothèse.
5. **Une image, quatre conteneurs.** `review`, `review-postgres`, `review-redis`,
   `review-minio`. Un seul artefact à construire, à pousser, à tirer.

---

## 3. Les règles permanentes qui encadrent ça

À reprendre telles quelles, ce sont celles de Majid :

- **Ne jamais couper une release ni déployer sans son signal explicite.** CI
  verte veut dire que le code tient, pas qu'il est prêt à partir. Ne pas
  proposer « je déploie sauf objection » : le défaut est d'attendre.
- **Aller sur le NAS est autorisé**, y écrire non. La règle porte sur
  l'écriture, pas sur l'accès.
- **Annoncer systématiquement le SHA court** à chaque commit, et pousser
  immédiatement. Ne jamais finir un tour avec un commit non poussé.
- **Français, tutoiement.**

---

## 4. Où Transfer diffère aujourd'hui

| | Review | Transfer |
|---|---|---|
| Source sur le NAS | aucune | aucune (idem) |
| Conteneurs | 4, une image | 2 (`transfer` + `clamav`), une image |
| Déploiement | `compose pull && up -d` | idem |
| Branche `latest` suivant la release | oui, automatique | **absente** |
| Branche `stable` + porte CI verte | oui, manuelle | **absente** |
| Rollback défini | repointer `stable` | **aucun** — le compose épingle `:latest` flottant |
| Vérification au moment du tag | aucune | tests système (1 min 22) |

Le procédé de base est donc **déjà le même**. Ce qui manque à Transfer, c'est la
couche de sécurité autour : pas de pointeur de production, pas de porte entre un
tag et la prod, pas de chemin de retour arrière.

### L'anomalie à corriger d'abord

**Le tag `v3.5.0` est poussé sur GitHub, mais aucune release n'est publiée pour
lui.**

```
gh api repos/Djoko-cli/transfer-majid-film/git/refs/tags/v3.5.0   → existe
gh api repos/Djoko-cli/transfer-majid-film/releases/tags/v3.5.0   → 404
gh run list --workflow docker-build-push.yml                      → dernier : v3.4.3
```

`docker-build-push.yml` ne se déclenche que sur `release: published`, donc
**aucune image v3.5.0 n'existe** et le NAS tire toujours v3.4.3. Et comme
`backend-system-tests.yml` se déclenche, lui, sur `push: tags: v*`, un run vert
est apparu pour ce tag — ce qui donne l'illusion que la release est partie.

C'est exactement le trou que `release-pointers.yml` rend visible : une branche
`latest` qui n'avance pas est un signal immédiat.

---

## 5. Ce qu'il y a à porter, par ordre d'utilité

1. **Publier la release v3.5.0.** Production non livrée.
2. **Écrire la procédure quelque part** — Review a `docs/RELEASING.md`, qui dit
   quelles refs bougent, qui les bouge, et comment revenir en arrière. Transfer
   n'a pas d'équivalent, ce qui veut dire que le procédé ne vit que dans la tête
   de celui qui l'exécute.
3. **`release-pointers.yml`** — 11 secondes, avance une branche `latest` sur le
   tag publié. Donne un pointeur observable.
4. **Une branche `stable` + `promote-stable.yml`** — promotion manuelle qui
   **refuse un tag dont les checks ne sont pas tous verts**, et rollback en
   re-promouvant un tag plus ancien. Faire ensuite pointer le compose du NAS sur
   `stable` plutôt que sur `:latest` flottant : c'est ce qui transforme « on
   croise les doigts » en « on repointe ».

   Honnêteté : côté Review ce workflow est du code correct **jamais lancé** —
   `stable` est encore sur v1.11.0, quinze releases en arrière. À adopter pour
   ce qu'il fait, pas parce que Review s'en sert.
5. **Les notes de release depuis un fichier**, jamais depuis un éditeur — c'est
   ce qui permet à la session de préparer la release entièrement et de s'arrêter
   pile avant la commande qui la publie.

---

## 6. Le point de friction actuel côté outillage

Majid signale que **le workflow automatique de release de Transfer est cassé
depuis une mise à jour de Claude** et qu'il doit accorder de nouvelles
permissions dans un `claude.json`.

Constat, pour situer : Review n'a **aucun** `.claude/settings.json` ni
`settings.local.json` dans le dépôt, et la liste d'autorisations au niveau
utilisateur est vide — donc rien n'y est pré-autorisé, et la boucle reste fluide
parce que chaque étape est **une commande unique et prévisible** que Majid
approuve au passage.

Transfer a `.claude/settings.local.json` avec deux entrées, dont une qui
référence encore l'ancien nom `pingvin-share-x` :

```json
"Bash(ssh -o ConnectTimeout=5 nas \"cat /volume2/docker/pingvin-share-x/.env …\")"
```

Une règle d'autorisation aussi littérale ne survit ni à un renommage ni à un
changement de version. **Piste, à vérifier avant d'agir :** préférer des motifs
larges et stables (par exemple `Bash(gh release create *)`,
`Bash(ssh nas *)`) plutôt que des commandes complètes figées, et supprimer
l'entrée périmée. Je n'ai pas diagnostiqué la panne elle-même — Majid a le
message d'erreur, il faut le lire avant de toucher au fichier.

---

## 7. Ce que ce brief ne couvre PAS

Les secondes de CI. Elles sont dans **`CI-RELEASE-PORT.md`**, avec un résultat
qui vaut d'être connu même s'il n'était pas la question : l'écart mesuré
(340 s contre 177 s) ne vient ni de QEMU ni d'un cache absent — les deux
workflows sont quasi identiques — mais du cloisonnement du cache GitHub Actions
par ref git, qui fait que chaque release de Transfer écrit ~940 Mo que personne
ne relira jamais. Et trois des correctifs « évidents » y sont réfutés, preuves à
l'appui, dont un qui **casserait le build** s'il était appliqué tel quel.
