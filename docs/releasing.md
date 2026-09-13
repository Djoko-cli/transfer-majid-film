# Couper une version de Transfer, la promouvoir, revenir en arrière

**Pour qui :** quiconque coupe une version — Majid ou la session Claude Code
dédiée à Transfer.
**Objectif :** que le procédé ne vive pas uniquement dans la tête de celui qui
l'exécute.

---

## En une ligne

Publier une **GitHub Release** construit et pousse l'image. Promouvoir un tag
déjà publié fait avancer `stable`. Le NAS tire. Rien d'autre n'est automatique,
et rien ne se déploie tout seul.

---

## 1. Couper une version

Depuis un arbre propre, entièrement poussé, sur `main`.

```bash
# 1. le tag, sur le commit exact qu'on veut livrer
git tag -a vX.Y.Z -m "vX.Y.Z" <sha>
git push origin vX.Y.Z

# 2. la release, notes lues depuis un fichier — jamais un éditeur
gh release create vX.Y.Z -R Djoko-cli/transfer-majid-film \
  --title "vX.Y.Z" --notes-file <chemin>/notes.md
```

Publier la release déclenche **trois** workflows, tous à surveiller :

| Workflow | Déclencheur | Durée | Rôle |
|---|---|---|---|
| `docker-build-push.yml` | `release: published` | ~5-6 min | construit et pousse `vX.Y.Z`, `vX.Y`, `vX`, `latest` |
| `docker-security.yml` | `release: published` | ~5 min | scan Trivy, build sans cache |
| `backend-system-tests.yml` | `push: tags: v*` | ~1 min 20 | tests système sur le commit tagué |

```bash
gh run list -R Djoko-cli/transfer-majid-film --workflow=docker-build-push.yml --limit 3
```

Les notes sont **en français**, groupées par thème (`## Nouveautés`,
`## Sécurité`, `## Corrections`, `## Administration`, `## Déploiement`), une
entrée par changement visible côté utilisateur. Elles s'écrivent facilement
parce que chaque corps de commit porte déjà le pourquoi et la mesure.

## 2. Promouvoir en production

`stable` est le pointeur que la production est censée suivre. Il ne bouge que
sur commande explicite.

```
Actions → Promote to stable → Run workflow → tag: vX.Y.Z
```

Le workflow refuse de promouvoir un tag dont **tous** les checks ne sont pas
verts — et refuse aussi un commit qui n'en porte aucun, parce que « rien n'a
échoué » et « rien n'a vérifié » ne sont pas la même chose. Il ne reconstruit
rien : l'image promue est, au digest près, celle qui a été construite et
vérifiée au moment de la release. C'est une copie de manifeste.

Il fait deux choses :

- retague `ghcr.io/djoko-cli/transfer-majid-film:vX.Y.Z` en `:stable`
- fait avancer la branche git `stable` sur le commit du tag

## 3. Déployer

Sur le NAS, et **seulement sur signal explicite de Majid** :

```bash
cd /volume2/docker/transfer
docker compose pull && docker compose up -d
```

Le NAS ne porte aucune source : le compose ne fait que tirer une image déjà
construite. Deux commandes idempotentes.

## 4. Revenir en arrière

**Il n'y a pas de procédure séparée.** On promeut un tag plus ancien :

```
Actions → Promote to stable → Run workflow → tag: vX.Y.<Z-1>
```

puis on redéploie comme au point 3. `:stable` repointe sur l'image précédente,
qui existe toujours sur ghcr.

C'est tout l'intérêt de `stable` : `:latest` avance à chaque release et ne
permet de revenir nulle part.

---

## Ce qui bouge, et qui le bouge

| Ref | Bougée par | Quand |
|---|---|---|
| `main` | un push | à chaque changement vérifié |
| `vX.Y.Z` (tag) | un humain | au moment de couper |
| image `:vX.Y.Z` `:vX.Y` `:vX` `:latest` | `docker-build-push.yml` | publication de la release |
| image `:stable` | `promote-stable.yml` | promotion explicite |
| branche `stable` | `promote-stable.yml` | promotion explicite |
| le conteneur du NAS | un humain, en SSH | signal explicite de Majid |

---

## État actuel à connaître

`:stable` **existe** : v3.5.0 a été promu le 2026-09-13, et la branche `stable`
est sur `a33a913`. La mécanique est donc exercée, pas seulement écrite.

Le `docker-compose.yml` de ce dépôt épingle en revanche toujours **`:latest`**,
par choix délibéré. Tant qu'il n'aura pas basculé, promouvoir ne change rien à
ce que le NAS tire : `stable` reste un pointeur observable et un filet de
rollback, pas la source du déploiement.

Basculer le compose sur `:stable` est désormais possible à tout moment. Ça
change une habitude : après chaque release il faudra **promouvoir avant de
déployer**, sinon `docker compose pull` ne ramène rien de neuf. En échange, un
retour arrière devient une promotion d'un tag plus ancien au lieu d'un espoir.

---

## Les pièges, tous rencontrés pour de vrai

**`gh` sans `-R` répond pour l'amont.** Ce dépôt a `origin`
(`Djoko-cli/transfer-majid-film`) et `upstream` (`smp46/pingvin-share-x`). Un
`gh release list` nu renvoie l'historique de l'amont. Ça a produit une
conclusion argumentée et entièrement fausse — « aucune release v3.x n'existe,
les images doivent être poussées à la main » — alors que les treize releases
existent et que toutes ont construit. **Passer `-R` sur chaque appel.**

**Pousser le tag ne suffit pas, et ressemble à un succès.**
`backend-system-tests.yml` se déclenche sur `push: tags: v*` : un run vert
apparaît pour le tag alors qu'aucune image n'a été construite, puisque
`docker-build-push.yml` attend `release: published`. C'est exactement comme ça
que v3.5.0 est resté non livré. Vérifier `--workflow=docker-build-push.yml`,
pas la liste générale.

**Les tags sont annotés.** `git tag -a` crée un objet tag : l'API renvoie le
SHA de cet objet, pas celui du commit. Il faut déréférencer, sinon on promeut
quelque chose qui n'est pas un commit. `promote-stable.yml` le fait.

**La version vit dans le tag, pas dans `package.json`.** Les trois
`package.json` portent le `1.22.1-beta.0` de l'amont et ne sont
délibérément jamais incrémentés. Ce n'est pas un oubli à corriger.

**Une nouvelle clé de configuration a besoin du seed.** L'entrypoint le lance
à chaque démarrage (`scripts/docker/entrypoint.sh`), donc la production est
couverte — mais en local il faut l'exécuter à la main, sinon la clé répond 404.
