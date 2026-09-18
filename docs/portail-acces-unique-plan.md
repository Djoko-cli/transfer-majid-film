# Portail d'accès unique — plan d'implémentation

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les
> étapes utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** qu'il n'existe plus qu'un seul chemin vers les octets d'un transfert,
et refermer au passage trois défauts vérifiés.

**Architecture :** on supprime le garde `FileSecurityGuard` au lieu de le
réparer, et les trois routes d'octets passent au garde parent
`ShareSecurityGuard`, déjà complet et déjà utilisé par les routes de
métadonnées. Trois corrections indépendantes accompagnent ce changement : un
refus au lieu d'un laissez-passer sur les transferts anonymes, une fusion non
destructive des options de sécurité, et le remplacement du bouton de lien par
fichier par un bouton unique au niveau du transfert.

**Pile :** NestJS 10 + Prisma (SQLite) côté serveur, Next.js 14 Pages Router +
Mantine 6 côté client, tests système en collection Postman exécutée par Newman.

**Spec :** [`docs/portail-acces-unique.md`](portail-acces-unique.md) — commit
`7002d43a`. Le plan argumente depuis la spec ; lire les deux.

---

## Contraintes globales

Elles s'appliquent implicitement à **chaque** tâche.

- **Le deux-points du chemin du dépôt casse la résolution `PATH` de npm.** Le
  dépôt est à `/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer`. Ne jamais
  invoquer `npx <outil>` ni compter sur `node_modules/.bin` via `PATH` :
  appeler `./node_modules/.bin/<outil>` explicitement.
- **ESLint s'invoque à l'opposé selon l'espace de travail.** Dans `frontend/` :
  `ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint <fichiers>`. Dans
  `backend/` : **sans** cette variable (configuration plate propre depuis
  septembre 2026).
- **Aucun commit ne doit laisser `test:system` au rouge.** Le workflow
  `.github/workflows/backend-system-tests.yml` s'exécute sur chaque `push` vers
  `main` et sur chaque pull request. Le cycle rouge → vert se déroule donc
  **dans** une tâche, et seul l'état vert est commité. Ne jamais commiter un
  test qui échoue, même temporairement.
- **Aucune migration de base dans cette phase.** Aucun changement de
  `backend/prisma/schema.prisma`. Si une tâche semble en exiger une, s'arrêter
  et le signaler : c'est un signe que le périmètre a dérivé.
- **Aucune chaîne de traduction nouvelle.** `common.button.copy-link` et
  `common.notify.copied-link` existent déjà en `fr-FR` et `en-US`.
- **Aucun nouveau réglage de configuration.**
- Serveurs de développement : front **3333**, back **8080**. Administrateur de
  test local : `testadmin@example.com` / `TestPassword123!`.
- Toute commande `gh` doit porter `-R Djoko-cli/transfer-majid-film`, sinon elle
  répond pour le dépôt amont.
- Les messages de commit finissent par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- La copie d'interface française vouvoie le visiteur et dit « transfert », pas
  « partage ». Les commentaires de code et les messages de commit sont en
  anglais.
- Ne jamais lancer de build/release Docker, ni de commande mutante sur la NAS.

---

## Structure des fichiers

| Fichier | Sort | Responsabilité après la phase |
|---|---|---|
| `backend/src/file/guard/fileSecurity.guard.ts` | **supprimé** | — |
| `backend/src/file/file.controller.ts` | modifié (`:21`, `:120`, `:150`, `:238`) | Routes d'octets, décorées du garde parent |
| `backend/src/share/guard/shareSecurity.guard.ts` | inchangé | **Seul** garde d'accès à un transfert et à ses octets |
| `backend/src/share/guard/shareOwner.guard.ts` | modifié (`:61-62`) | Propriété d'un transfert ; un transfert anonyme n'a pas de propriétaire |
| `backend/src/share/share.service.ts` | modifié (`:577-610`) | `updateSecurity` devient préservant |
| `backend/test/newman-system-tests.json` | modifié | Collection de tests système, trois dossiers ajoutés |
| `backend/package.json` | possiblement modifié (tâche 1) | `newman` en dépendance de développement si nécessaire |
| `frontend/src/components/share/FileList.tsx` | modifié (`:37-45`, `:109-133`, `:145-150`, `:284`) | Liste de fichiers, sans bouton de lien par fichier |
| `frontend/src/pages/share/[shareId]/index.tsx` | modifié (`:212`+) | Page destinataire, porte le bouton de lien unique |

Aucun fichier créé. C'est volontaire : la phase retire de la structure, elle
n'en ajoute pas.

---

### Task 1: Rendre le harnais exécutable et sonder son comportement de cookies

Le reste du plan suppose deux choses non vérifiées : que la collection Newman
peut s'exécuter sur cette machine, et qu'une requête peut être rendue
réellement non authentifiée. Les deux doivent être établies **avant** d'écrire
un test, parce que leur réponse change la forme des tâches 2 à 4.

**Files:**
- Modify: `backend/package.json` (uniquement si `newman` doit être ajouté)
- Modify: `backend/test/newman-system-tests.json` (requête sonde, retirée à la fin de la tâche)

**Interfaces:**
- Consomme : rien.
- Produit : une **commande de référence** qui exécute la collection localement,
  à citer telle quelle dans les tâches 2, 3 et 4 ; et un **verdict** sur le
  cookie — « vider `COOKIES` suffit » ou « il faut passer par la CI ».

> ### ⚠️ Corrigé après exécution — ne lancez pas `npm run test:system`
>
> Ce script commence par `prisma migrate reset -f`, et `backend/prisma/.env:2`
> pointe `DATABASE_URL="file:../data/transfer.db"` : **il détruirait la base de
> développement locale**. Il dispute aussi le port 8080 au serveur de dev.
> La commande réellement utilisée, établie par cette tâche et employée par les
> tâches 2 à 4, est en fin de tâche sous « Commande de référence ». Les étapes 1
> et 2 ci-dessous sont conservées comme récit de ce qui a été essayé.

- [ ] **Step 1: Tenter le script tel qu'il existe**

```bash
cd backend && npm run test:system
```

Résultat attendu : **incertain**. Le script enchaîne `prisma migrate reset -f`,
`nest start`, `wait-on` et `npx newman`, tous résolus via `PATH` dans un chemin
contenant un deux-points. S'il fonctionne, noter la commande et passer à
l'étape 4. S'il échoue sur un binaire introuvable, continuer à l'étape 2.

- [ ] **Step 2: Installer newman localement et reconstruire la commande à la main**

```bash
cd backend && npm install --save-dev newman
```

Puis, dans deux terminaux séparés — le `&` du script d'origine mélange les
sorties et masque les erreurs de démarrage :

```bash
cd backend && PATH="./node_modules/.bin:$PATH" DATABASE_URL=file:../data/system-test.db BACKEND_PORT=8081 ./node_modules/.bin/prisma migrate reset -f && PATH="./node_modules/.bin:$PATH" DATABASE_URL=file:../data/system-test.db BACKEND_PORT=8081 ./node_modules/.bin/nest start
```

```bash
cd backend && ./node_modules/.bin/wait-on http://localhost:8081/api/configs && ./node_modules/.bin/newman run ./test/newman-system-tests.json --env-var "API_URL=http://localhost:8081/api" --env-var "API_URL_ANON=http://127.0.0.1:8081/api"
```

### Commande de référence

Les deux blocs ci-dessus **sont** la commande de référence, dans sa forme
finale. Trois choses s'y sont ajoutées au fil de l'exécution, chacune pour une
raison mesurée :

- `DATABASE_URL=file:../data/system-test.db` — sans quoi le reset détruit la
  base de développement.
- `BACKEND_PORT=8081` plus les deux `--env-var` — sans quoi le harnais dispute
  le port 8080 au serveur de dev.
- `PATH="./node_modules/.bin:$PATH"` — Prisma lance sa commande de seed
  (`ts-node …`) par `PATH`, et l'entrée doit être **relative** : une entrée
  absolue contiendrait le deux-points de `js:nodejs`, que `PATH` scinde
  lui-même en deux entrées mortes.

`API_URL_ANON` vise `127.0.0.1` et non `localhost` : le bocal à cookies de
Newman apparie sur la chaîne d'hôte, c'est le seul moyen mesuré d'émettre une
requête réellement non authentifiée depuis cette collection.

- [ ] **Step 3: Vérifier que la collection passe entièrement au vert sur le code actuel**

Résultat attendu : toutes les assertions passent, 0 échec. C'est la référence.
Si une assertion échoue **avant** toute modification, s'arrêter et le signaler :
le harnais est déjà cassé et ce plan n'est pas l'endroit pour le réparer.

- [ ] **Step 4: Ajouter une requête sonde qui teste le vidage des cookies**

La collection gère les cookies à la main : un script de pré-requête au niveau
collection injecte `pm.collectionVariables.get("COOKIES")` dans chaque requête.
Reste à savoir si Newman ajoute **aussi** les siens par son bocal interne, ce
qui rendrait toute requête « non authentifiée » en réalité authentifiée — et
les tests des tâches 2 et 3 vides de sens.

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && python3 - <<'PY'
import json, io
p = "backend/test/newman-system-tests.json"
c = json.load(io.open(p, encoding="utf-8"))

probe = {
  "name": "_probe Cookie clearing works",
  "request": {
    "method": "GET",
    "header": [],
    "url": {"raw": "{{API_URL}}/shares", "host": ["{{API_URL}}"], "path": ["shares"]}
  },
  "event": [
    {"listen": "prerequest", "script": {"type": "text/javascript", "exec": [
      "pm.collectionVariables.set('COOKIES_BACKUP', pm.collectionVariables.get('COOKIES'));",
      "pm.collectionVariables.set('COOKIES', '');",
      "pm.request.headers.remove((h) => h.key.toLowerCase() === 'cookie');"
    ]}},
    {"listen": "test", "script": {"type": "text/javascript", "exec": [
      "pm.collectionVariables.set('COOKIES', pm.collectionVariables.get('COOKIES_BACKUP'));",
      "pm.test('An emptied cookie jar really is unauthenticated', () => {",
      "    pm.expect(pm.response.code).to.be.oneOf([401, 403]);",
      "});"
    ]}}
  ]
}

c["item"].append({"name": "_probe", "item": [probe]})
io.open(p, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False, indent="\t"))
print("sonde ajoutee")
PY
```

`GET /api/shares` est gardé par `JwtGuard` seul
([`share.controller.ts:55-56`](../backend/src/share/share.controller.ts)) et
renvoie les transferts de l'utilisateur : sans authentification il ne peut pas
répondre 200 avec un corps utile.

- [ ] **Step 5: Exécuter la sonde**

Relancer la commande de référence de l'étape 1 ou 3.

- **Si la sonde passe** (401 ou 403) : le vidage de `COOKIES` produit bien une
  requête non authentifiée. Les tâches 2 et 3 sont écrites telles quelles.
- **Si la sonde échoue** (200) : Newman rejoue ses propres cookies. Alors le
  test 3 de la tâche 3 est **impossible dans ce harnais** — le noter et le
  déplacer en vérification manuelle, sans le supprimer du périmètre. La tâche 2
  reste valable : `share.allowAdminAccessAllShares` vaut `false` par défaut
  ([`config.seed.ts:130-133`](../backend/prisma/seed/config.seed.ts)), donc même
  une requête authentifiée en admin est refusée faute de jeton de transfert.

- [ ] **Step 6: Retirer la sonde**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && python3 - <<'PY'
import json, io
p = "backend/test/newman-system-tests.json"
c = json.load(io.open(p, encoding="utf-8"))
before = len(c["item"])
c["item"] = [f for f in c["item"] if f.get("name") != "_probe"]
assert len(c["item"]) == before - 1, "sonde introuvable"
io.open(p, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False, indent="\t"))
print("sonde retiree")
PY
```

La sonde est un instrument de mesure, pas un test : elle n'affirme rien sur le
produit, seulement sur le harnais. Elle ne reste pas.

- [ ] **Step 7: Commiter, uniquement s'il y a quelque chose à commiter**

Si l'étape 2 a ajouté `newman` :

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/package.json backend/package-lock.json
git commit -F - <<'MSG'
Install newman locally instead of fetching it per run

The repo path contains a colon, which breaks npm's PATH lookup, so the
test:system script's `npx newman` could not resolve. Committing the
dependency makes the system tests runnable on a developer machine, which
is the only place the red half of a red-green cycle can be observed —
CI only ever sees the green one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

Sinon, ne rien commiter. Reporter le verdict de l'étape 5 avant de continuer.

---

### Task 2: La porte unique

**Files:**
- Delete: `backend/src/file/guard/fileSecurity.guard.ts`
- Modify: `backend/src/file/file.controller.ts:21` (import), `:120`, `:150`, `:238` (décorations)
- Test: `backend/test/newman-system-tests.json` (dossier `Access gate` ajouté)

**Interfaces:**
- Consomme : la commande de référence de la tâche 1.
- Produit : `ShareSecurityGuard` devient le seul garde des routes d'octets.
  Les variables de collection `OPEN_FILE_ID` et `REVERSE_FILE_ID` sont créées
  ici ; aucune tâche ultérieure n'en dépend.

- [ ] **Step 1: Écrire les tests qui échouent**

Le dossier est inséré **après** `Get Share`, parce que Newman exécute les
éléments dans l'ordre et que les parts fixes doivent exister avant d'être
interrogées.

Deux points de conception, tous deux tirés de l'ordre des contrôles dans
`shareSecurity.guard.ts` :

1. La part fixe existante `test-share` porte un mot de passe. Sans cookie, le
   garde parent lève `share_password_required` en `:124`, **avant** d'atteindre
   le contrôle de jeton en `:130`. Le test a donc besoin d'une part **sans mot
   de passe**, créée ici : `open-share`.
2. Pour le dépôt inversé, le contrôle `private_share` est en `:137`, soit
   **après** le contrôle de jeton. Sans cookie, le refus tombe donc sur
   `share_token_required`, et c'est exactement l'assertion qui prouve que le
   trou est refermé : aujourd'hui cette requête renvoie les octets.

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && python3 - <<'PY'
import json, io
p = "backend/test/newman-system-tests.json"
c = json.load(io.open(p, encoding="utf-8"))

B64 = "data:application/octet-stream;base64,VGhpcyBpcyBhIHRlc3QgZmlsZWQgdXNlZCBmb3IgdXBsb2FkaW5nIGluIHRoZSBzeXN0ZW0gdGVzdC4="
OCTET = [{"key": "Content-Type", "value": "application/octet-stream", "type": "text"}]

def js(lines):
    return {"type": "text/javascript", "exec": lines}

def item(name, method, path, query=None, body=None, headers=None, tests=None, pre=None):
    raw = "{{API_URL}}/" + "/".join(path)
    if query:
        raw += "?" + "&".join(f"{q['key']}={q['value']}" for q in query)
    url = {"raw": raw, "host": ["{{API_URL}}"], "path": path}
    if query:
        url["query"] = query
    req = {"method": method, "header": headers or []}
    if body is not None:
        req["body"] = body
    req["url"] = url
    ev = []
    if pre:
        ev.append({"listen": "prerequest", "script": js(pre)})
    if tests:
        ev.append({"listen": "test", "script": js(tests)})
    return {"name": name, "request": req, "event": ev}

def raw_json(obj):
    return {"mode": "raw", "raw": json.dumps(obj, indent=4),
            "options": {"raw": {"language": "json"}}}

NO_COOKIE_PRE = [
    "pm.collectionVariables.set('COOKIES_BACKUP', pm.collectionVariables.get('COOKIES'));",
    "pm.collectionVariables.set('COOKIES', '');",
    "pm.request.headers.remove((h) => h.key.toLowerCase() === 'cookie');"
]
RESTORE = "pm.collectionVariables.set('COOKIES', pm.collectionVariables.get('COOKIES_BACKUP'));"

access_gate = {"name": "Access gate", "item": [

  item("Create share without password", "POST", ["shares"],
       body=raw_json({"id": "open-share", "expiration": "1-day", "recipients": []}),
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("Upload file to open share", "POST", ["shares", "open-share", "files"],
       query=[{"key": "name", "value": "open-file.txt"},
              {"key": "chunkIndex", "value": "0"},
              {"key": "totalChunks", "value": "1"}],
       body={"mode": "raw", "raw": B64}, headers=OCTET,
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});",
              "pm.collectionVariables.set('OPEN_FILE_ID', pm.response.json().id);"]),

  item("Complete open share", "POST", ["shares", "open-share", "complete"],
       body=raw_json({}),
       tests=["pm.test('Status code is 202', () => {",
              "    pm.response.to.have.status(202);",
              "});"]),

  item("Get file without a share token is refused", "GET",
       ["shares", "open-share", "files", "{{OPEN_FILE_ID}}"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});",
              "pm.test('Refusal carries the machine code the page reacts to', () => {",
              "    pm.expect(pm.response.json().error).to.be.equal('share_token_required');",
              "});"]),

  item("Get zip without a share token is refused", "GET",
       ["shares", "open-share", "files", "zip"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});"]),

  item("Create a private reverse share", "POST", ["reverseShares"],
       body=raw_json({"sendEmailNotification": False, "maxShareSize": "1073741824",
                      "shareExpiration": "1-day", "maxUseCount": 1,
                      "publicAccess": False}),
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});",
              "const token = pm.response.json().token;",
              "pm.collectionVariables.set('REVERSE_TOKEN', token);",
              "pm.collectionVariables.set('COOKIES', `${pm.collectionVariables.get('COOKIES')};reverse_share_token=${token}`);"]),

  item("Create share through the private reverse share", "POST", ["shares"],
       body=raw_json({"id": "reverse-private", "expiration": "1-day", "recipients": []}),
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("Upload file to the reverse share", "POST", ["shares", "reverse-private", "files"],
       query=[{"key": "name", "value": "reverse-file.txt"},
              {"key": "chunkIndex", "value": "0"},
              {"key": "totalChunks", "value": "1"}],
       body={"mode": "raw", "raw": B64}, headers=OCTET,
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});",
              "pm.collectionVariables.set('REVERSE_FILE_ID', pm.response.json().id);"]),

  item("Complete the reverse share", "POST", ["shares", "reverse-private", "complete"],
       body=raw_json({}),
       tests=["pm.test('Status code is 202', () => {",
              "    pm.response.to.have.status(202);",
              "});"]),

  item("Private reverse share file is not served without a token", "GET",
       ["shares", "reverse-private", "files", "{{REVERSE_FILE_ID}}"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});"]),
]}

names = [f.get("name") for f in c["item"]]
assert "Access gate" not in names, "dossier deja present"
idx = names.index("Get Share") + 1
c["item"].insert(idx, access_gate)
io.open(p, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False, indent="\t"))
print("dossier Access gate insere a l'index", idx)
PY
```

- [ ] **Step 2: Exécuter et vérifier que les trois assertions d'accès échouent**

Commande de référence de la tâche 1.

Échecs attendus, et **uniquement** ceux-là :

| Assertion | Attendu | Obtenu aujourd'hui |
|---|---|---|
| `Get file without a share token is refused` → 403 | 403 | **200**, le fichier est servi |
| `Get zip without a share token is refused` → 403 | 403 | **200**, l'archive est servie |
| `Private reverse share file is not served without a token` → 403 | 403 | **200**, le fichier est servi |

Si un autre test échoue, s'arrêter : les parts fixes ajoutées perturbent la
collection existante, et c'est à corriger avant d'aller plus loin.

- [ ] **Step 3: Supprimer le garde**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && git rm backend/src/file/guard/fileSecurity.guard.ts
```

- [ ] **Step 4: Rebrancher les trois routes sur le garde parent**

Dans `backend/src/file/file.controller.ts`, remplacer l'import de la ligne 21 :

```ts
import { FileSecurityGuard } from "./guard/fileSecurity.guard";
```

par :

```ts
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { ShareSecurityGuard } from "src/share/guard/shareSecurity.guard";
```

`IdValidation` est peut-être déjà importé dans ce fichier — les routes de
téléversement l'utilisent (`:37`, `:56`, `:78`, `:96`). Vérifier avant
d'ajouter un doublon, que TypeScript signalerait.

Puis, sur les trois routes d'octets (`:120` zip, `:150` fichier, `:238`
miniature), remplacer :

```ts
  @UseGuards(FileSecurityGuard)
```

par :

```ts
  @UseGuards(IdValidation, ShareSecurityGuard)
```

C'est la décoration que portent déjà `GET /shares/:id`
([`share.controller.ts:71-72`](../backend/src/share/share.controller.ts)) et
`GET /shares/:id/metaData` (`:83-84`).

- [ ] **Step 5: Vérifier que ça compile et que le lint est propre**

```bash
cd backend && ./node_modules/.bin/nest build && ./node_modules/.bin/eslint 'src/**/*.ts'
```

Attendu : aucune sortie, code de retour 0. Une erreur d'injection ne
surgirait pas ici mais au démarrage : `FileModule` importe déjà `ShareModule`
([`file.module.ts:18`](../backend/src/file/file.module.ts)), qui exporte
`ShareService` ([`share.module.ts:24`](../backend/src/share/share.module.ts)),
et `ShareSecurityGuard` a exactement les mêmes dépendances que le garde
supprimé.

- [ ] **Step 6: Exécuter la collection et vérifier qu'elle est entièrement verte**

Commande de référence. Attendu : 0 échec, y compris les tests préexistants
`Get File` et `Get Zip` du dossier `Get Share` — ils passent après
`Get share token`, donc avec le cookie, et c'est précisément le chemin qui
survit.

- [ ] **Step 7: Vérifier en direct le compteur de vues et la prévisualisation**

Démarrer les deux serveurs de développement, se connecter avec
`testadmin@example.com` / `TestPassword123!` sur `http://localhost:3333`.

1. Créer un transfert de 3 fichiers, l'ouvrir en tant que destinataire, et
   télécharger les trois. Dans « Mes transferts », le compteur « Visiteurs »
   doit afficher **1**, pas 3. Avant ce changement il affichait 3 :
   `increaseViewCount` était appelé par la branche supprimée à chaque requête
   d'octets, et n'a plus qu'un appelant, `getShareToken`
   ([`share.service.ts:735`](../backend/src/share/share.service.ts)).
2. Ouvrir la prévisualisation d'une image ou d'une vidéo depuis l'icône œil :
   elle doit fonctionner. Elle passe par le même chemin d'octets, depuis la
   page, donc avec le cookie.
3. Cliquer « Tout télécharger » sur un transfert de plusieurs fichiers : le ZIP
   doit arriver.

- [ ] **Step 8: Commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/src/file/file.controller.ts backend/test/newman-system-tests.json
git commit -F - <<'MSG'
Serve share bytes through one gate instead of two

FileSecurityGuard delegated to ShareSecurityGuard only when a share
token cookie was present. Without one it ran its own copy of the rules,
and the two copies had already drifted: the copy's Prisma include never
loaded the reverseShare relation, so it could not apply the
private-reverse-share rule the original applies. Files dropped into a
non-public file request were therefore downloadable by anyone holding
the share and file ids.

Removing the copy is what fixes it. The parent already requires a token
for everything — verifyShareToken throws on an undefined token and the
page has always handled the resulting share_token_required by asking for
one — so the only traffic the removed branch carried was raw byte URLs.

Two things follow for free: the view counter now has a single caller, so
a three-file share stops counting three visitors, and a password refusal
on a byte route finally carries the same machine code as on metadata.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 3: Les deux fuites sur les transferts anonymes

**Files:**
- Modify: `backend/src/share/guard/shareOwner.guard.ts:61-62`
- Test: `backend/test/newman-system-tests.json` (dossier `Anonymous share leaks`, ajouté **en dernier**)

**Interfaces:**
- Consomme : le verdict de cookie de la tâche 1, étape 5.
- Produit : rien dont une tâche ultérieure dépende.

- [ ] **Step 1: Écrire le test qui échoue**

Le dossier va **à la fin** de la collection, et non au milieu : il modifie deux
réglages de configuration globaux pour pouvoir créer un transfert anonyme, et
ces réglages ne doivent pas influencer les tests précédents. Il les restaure
ensuite — ceinture et bretelles, puisque `test:system` remet la base à zéro à
chaque exécution.

Le corps de `PATCH /api/configs/admin` est un **tableau** de `{key, value}`, et
`value` doit être un **vrai booléen**, pas la chaîne `"true"` — sinon la
requête répond 400.

L'utilisateur créé par `_setup > Sign Up` est administrateur : le premier
compte l'est d'office
([`auth.service.ts:100`](../backend/src/auth/auth.service.ts)), ce qui autorise
ce `PATCH`.

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && python3 - <<'PY'
import json, io
p = "backend/test/newman-system-tests.json"
c = json.load(io.open(p, encoding="utf-8"))

B64 = "data:application/octet-stream;base64,VGhpcyBpcyBhIHRlc3QgZmlsZWQgdXNlZCBmb3IgdXBsb2FkaW5nIGluIHRoZSBzeXN0ZW0gdGVzdC4="
OCTET = [{"key": "Content-Type", "value": "application/octet-stream", "type": "text"}]

def js(lines):
    return {"type": "text/javascript", "exec": lines}

def item(name, method, path, query=None, body=None, headers=None, tests=None, pre=None):
    raw = "{{API_URL}}/" + "/".join(path)
    if query:
        raw += "?" + "&".join(f"{q['key']}={q['value']}" for q in query)
    url = {"raw": raw, "host": ["{{API_URL}}"], "path": path}
    if query:
        url["query"] = query
    req = {"method": method, "header": headers or []}
    if body is not None:
        req["body"] = body
    req["url"] = url
    ev = []
    if pre:
        ev.append({"listen": "prerequest", "script": js(pre)})
    if tests:
        ev.append({"listen": "test", "script": js(tests)})
    return {"name": name, "request": req, "event": ev}

def raw_json(obj):
    return {"mode": "raw", "raw": json.dumps(obj, indent=4),
            "options": {"raw": {"language": "json"}}}

NO_COOKIE_PRE = [
    "pm.collectionVariables.set('COOKIES_BACKUP', pm.collectionVariables.get('COOKIES'));",
    "pm.collectionVariables.set('COOKIES', '');",
    "pm.request.headers.remove((h) => h.key.toLowerCase() === 'cookie');"
]
RESTORE = "pm.collectionVariables.set('COOKIES', pm.collectionVariables.get('COOKIES_BACKUP'));"
OK_200 = ["pm.test('Status code is 200', () => {", "    pm.response.to.have.status(200);", "});"]

folder = {"name": "Anonymous share leaks", "item": [

  item("Allow anonymous shares", "PATCH", ["configs", "admin"],
       body=raw_json([{"key": "share.allowUnauthenticatedShares", "value": True},
                      {"key": "share.requireEmailVerificationForAnonymousShares", "value": False}]),
       tests=OK_200),

  item("Create an anonymous share", "POST", ["shares"],
       body=raw_json({"id": "anon-share", "expiration": "1-day", "recipients": []}),
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("Upload file to the anonymous share", "POST", ["shares", "anon-share", "files"],
       query=[{"key": "name", "value": "anon-file.txt"},
              {"key": "chunkIndex", "value": "0"},
              {"key": "totalChunks", "value": "1"}],
       body={"mode": "raw", "raw": B64}, headers=OCTET,
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("Complete the anonymous share", "POST", ["shares", "anon-share", "complete"],
       body=raw_json({}),
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 202', () => {",
              "    pm.response.to.have.status(202);",
              "});"]),

  item("Download log of an anonymous share is not public", "GET",
       ["shares", "anon-share", "downloads"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});"]),

  item("File list of an anonymous share is not public", "GET",
       ["shares", "anon-share", "from-owner"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});"]),

  item("Restore anonymous share settings", "PATCH", ["configs", "admin"],
       body=raw_json([{"key": "share.allowUnauthenticatedShares", "value": False},
                      {"key": "share.requireEmailVerificationForAnonymousShares", "value": True}]),
       tests=OK_200),
]}

names = [f.get("name") for f in c["item"]]
assert "Anonymous share leaks" not in names, "dossier deja present"
c["item"].append(folder)
io.open(p, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False, indent="\t"))
print("dossier Anonymous share leaks ajoute en dernier")
PY
```

- [ ] **Step 2: Exécuter et vérifier que les deux assertions de fuite échouent**

Commande de référence. Échecs attendus, et uniquement ceux-là :

| Assertion | Attendu | Obtenu aujourd'hui |
|---|---|---|
| `Download log of an anonymous share is not public` → 403 | 403 | **200**, le journal est renvoyé |
| `File list of an anonymous share is not public` → 403 | 403 | **200**, le `ShareDTO` complet est renvoyé |

Si la création du transfert anonyme échoue avec un 403, c'est que le vidage de
cookie ne fonctionne pas dans ce harnais — verdict de la tâche 1. Dans ce cas :
retirer ce dossier, le consigner comme vérification manuelle dans la spec, et
passer directement à l'étape 3, en prouvant la correction par la vérification
manuelle de l'étape 5.

- [ ] **Step 3: Refuser au lieu de laisser passer**

Dans `backend/src/share/guard/shareOwner.guard.ts`, remplacer les lignes 61-62 :

```ts
    // If it's a anonymous share, allow access
    if (!share.creatorId) return true;
```

par :

```ts
    // An anonymous share has no owner, so nobody passes an ownership check
    // for it — least of all whoever merely holds its link. The three writes
    // this guard fronts already refuse anonymous shares further in
    // (ShareService.update, remove and expire), so this changes no write.
    // What it does change is the two reads nothing checked afterwards:
    // GET :id/downloads, whose service method has no ownership check at
    // all, and GET :id/from-owner, which returns the whole share — file
    // list included — past both the password and the visitor limit.
    if (!share.creatorId) return false;
```

`StrictShareOwnerGuard` en hérite sans modification : il ne surcharge que
`allowAdmin` ([`strictShareOwner.guard.ts:5-8`](../backend/src/share/guard/strictShareOwner.guard.ts)).

- [ ] **Step 4: Vérifier que ça compile, que le lint passe, et que la collection est verte**

```bash
cd backend && ./node_modules/.bin/nest build && ./node_modules/.bin/eslint 'src/**/*.ts'
```

Puis la commande de référence. Attendu : 0 échec.

- [ ] **Step 5: Vérifier en direct qu'un propriétaire garde son accès**

Cette correction peut casser un usage légitime — c'est le seul risque de la
tâche. Sur `http://localhost:3333`, connecté en `testadmin@example.com` :

1. Créer un transfert, le compléter, le télécharger une fois.
2. Dans « Mes transferts », ouvrir le journal de téléchargements de **son
   propre** transfert : il doit s'afficher. Le propriétaire passe par
   `share.creatorId == user.id`
   ([`shareOwner.guard.ts:56`](../backend/src/share/guard/shareOwner.guard.ts)),
   pas par la ligne modifiée.
3. Modifier ce transfert depuis la modale d'infos : l'enregistrement doit
   réussir.
4. Le supprimer : la suppression doit réussir.

- [ ] **Step 6: Commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/src/share/guard/shareOwner.guard.ts backend/test/newman-system-tests.json
git commit -F - <<'MSG'
Stop treating everyone as the owner of an anonymous share

ShareOwnerGuard returned true for any share with no creator, so holding
the link was enough to pass an ownership check. The three writes it
fronts refuse anonymous shares further in, so nothing could be changed
or deleted this way — but two reads had no check after the guard, and
both leaked: the download log, which exposes file names, recipient
addresses and timestamps, and /from-owner, which returns the whole share
past the password and the visitor limit.

An anonymous share has no owner. The guard now says so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 4: La fusion non destructive des options de sécurité

**Files:**
- Modify: `backend/src/share/share.service.ts:577-610`
- Test: `backend/test/newman-system-tests.json` (dossier `Security merge`, inséré avant `Anonymous share leaks`)

**Interfaces:**
- Consomme : rien des tâches précédentes.
- Produit : `updateSecurity(shareId, body, currentSecurity?)` garde sa signature
  exacte. Seul son corps change.

- [ ] **Step 1: Écrire le test qui échoue**

L'observable choisi n'est pas le contenu d'une réponse mais un **comportement
de sécurité** : un transfert réservé à ses destinataires refuse un visiteur non
authentifié avec le code `share_restricted_to_recipients`
([`shareSecurity.guard.ts:114-121`](../backend/src/share/guard/shareSecurity.guard.ts)).
Si la modification de la modale d'infos détruit la restriction, ce refus
disparaît et le garde tombe sur le contrôle de jeton à la place. C'est
directement la propriété perdue, sans dépendre de ce qu'un DTO expose.

Le corps du `PATCH` reproduit exactement ce que la modale envoie
([`showShareInformationsModal.tsx:311-315`](../frontend/src/components/share/showShareInformationsModal.tsx)) :
un bloc `security` avec `maxViews: null` et pas de mot de passe. Un transfert ne
peut pas cumuler restriction et mot de passe
([`share.service.ts:108-112`](../backend/src/share/share.service.ts)), donc la
part fixe n'a que la restriction — précisément le cas qui perd tout.

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && python3 - <<'PY'
import json, io
p = "backend/test/newman-system-tests.json"
c = json.load(io.open(p, encoding="utf-8"))

B64 = "data:application/octet-stream;base64,VGhpcyBpcyBhIHRlc3QgZmlsZWQgdXNlZCBmb3IgdXBsb2FkaW5nIGluIHRoZSBzeXN0ZW0gdGVzdC4="
OCTET = [{"key": "Content-Type", "value": "application/octet-stream", "type": "text"}]

def js(lines):
    return {"type": "text/javascript", "exec": lines}

def item(name, method, path, query=None, body=None, headers=None, tests=None, pre=None):
    raw = "{{API_URL}}/" + "/".join(path)
    if query:
        raw += "?" + "&".join(f"{q['key']}={q['value']}" for q in query)
    url = {"raw": raw, "host": ["{{API_URL}}"], "path": path}
    if query:
        url["query"] = query
    req = {"method": method, "header": headers or []}
    if body is not None:
        req["body"] = body
    req["url"] = url
    ev = []
    if pre:
        ev.append({"listen": "prerequest", "script": js(pre)})
    if tests:
        ev.append({"listen": "test", "script": js(tests)})
    return {"name": name, "request": req, "event": ev}

def raw_json(obj):
    return {"mode": "raw", "raw": json.dumps(obj, indent=4),
            "options": {"raw": {"language": "json"}}}

NO_COOKIE_PRE = [
    "pm.collectionVariables.set('COOKIES_BACKUP', pm.collectionVariables.get('COOKIES'));",
    "pm.collectionVariables.set('COOKIES', '');",
    "pm.request.headers.remove((h) => h.key.toLowerCase() === 'cookie');"
]
RESTORE = "pm.collectionVariables.set('COOKIES', pm.collectionVariables.get('COOKIES_BACKUP'));"

folder = {"name": "Security merge", "item": [

  item("Create a recipient-restricted share", "POST", ["shares"],
       body=raw_json({"id": "restricted-share", "expiration": "1-day",
                      "recipients": [], "security": {"restrictToRecipients": True}}),
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("Upload file to the restricted share", "POST",
       ["shares", "restricted-share", "files"],
       query=[{"key": "name", "value": "restricted-file.txt"},
              {"key": "chunkIndex", "value": "0"},
              {"key": "totalChunks", "value": "1"}],
       body={"mode": "raw", "raw": B64}, headers=OCTET,
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("Complete the restricted share", "POST",
       ["shares", "restricted-share", "complete"],
       body=raw_json({}),
       tests=["pm.test('Status code is 202', () => {",
              "    pm.response.to.have.status(202);",
              "});"]),

  item("Restriction holds before any edit", "GET", ["shares", "restricted-share"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});",
              "pm.test('Refused for the restriction, not for a missing token', () => {",
              "    pm.expect(pm.response.json().error).to.be.equal('share_restricted_to_recipients');",
              "});"]),

  item("Edit the share exactly as the info modal does", "PATCH",
       ["shares", "restricted-share"],
       body=raw_json({"name": "renamed", "description": None,
                      "expiration": "1-day",
                      "security": {"maxViews": None}}),
       tests=["pm.test('Status code is 200', () => {",
              "    pm.response.to.have.status(200);",
              "});"]),

  item("Restriction survives the edit", "GET", ["shares", "restricted-share"],
       pre=NO_COOKIE_PRE,
       tests=[RESTORE,
              "pm.test('Status code is 403', () => {",
              "    pm.response.to.have.status(403);",
              "});",
              "pm.test('Still refused for the restriction after a plain rename', () => {",
              "    pm.expect(pm.response.json().error).to.be.equal('share_restricted_to_recipients');",
              "});"]),
]}

names = [f.get("name") for f in c["item"]]
assert "Security merge" not in names, "dossier deja present"
idx = names.index("Anonymous share leaks") if "Anonymous share leaks" in names else len(c["item"])
c["item"].insert(idx, folder)
io.open(p, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False, indent="\t"))
print("dossier Security merge insere a l'index", idx)
PY
```

- [ ] **Step 2: Exécuter et vérifier que seule la dernière assertion échoue**

Commande de référence.

| Assertion | Attendu | Obtenu aujourd'hui |
|---|---|---|
| `Restriction holds before any edit` | 403 `share_restricted_to_recipients` | **passe déjà** |
| `Restriction survives the edit` | 403 `share_restricted_to_recipients` | **échoue** : la ligne de sécurité a été supprimée, le refus devient `share_token_required` |

La première assertion passe des deux côtés : c'est voulu. Elle prouve que la
part fixe est bien construite, sans quoi l'échec de la seconde ne voudrait rien
dire.

- [ ] **Step 3: Réécrire `updateSecurity`**

Dans `backend/src/share/share.service.ts`, remplacer intégralement le corps
des lignes 577-610 :

```ts
  private async updateSecurity(
    shareId: string,
    body: UpdateShareDTO,
    currentSecurity?: ShareSecurity,
  ) {
    const nextPassword = body.security.removePassword
      ? null
      : body.security.password
        ? await argon.hash(body.security.password)
        : currentSecurity?.password;
    const nextMaxViews =
      body.security.maxViews !== undefined
        ? body.security.maxViews
        : currentSecurity?.maxViews;
    // Carried, never authored here: no edit path can set or clear the
    // restriction, so its only job is to survive one. It used to not:
    // the row was deleted whenever password and maxViews both came out
    // empty, and the upsert's create branch never copied it — so a share
    // restricted to its recipients, with no password and no view limit,
    // lost its restriction the moment its owner renamed it.
    const nextRestrictToRecipients =
      currentSecurity?.restrictToRecipients ?? false;

    // A row carrying nothing has no reason to exist; a row carrying only
    // the restriction very much does. The old test asked about two of the
    // three columns and threw the row away on their word alone.
    const carriesNothing =
      !nextPassword && !nextMaxViews && !nextRestrictToRecipients;

    if (carriesNothing) {
      if (currentSecurity) {
        await this.prisma.shareSecurity.delete({ where: { shareId } });
      }
      return;
    }

    await this.prisma.shareSecurity.upsert({
      where: { shareId },
      create: {
        share: { connect: { id: shareId } },
        password: nextPassword,
        maxViews: nextMaxViews,
        restrictToRecipients: nextRestrictToRecipients,
      },
      update: {
        password: nextPassword,
        maxViews: nextMaxViews,
        restrictToRecipients: nextRestrictToRecipients,
      },
    });
  }
```

`UpdateShareSecurityDTO` n'a pas besoin de champ nouveau
([`updateShare.dto.ts:12-25`](../backend/src/share/dto/updateShare.dto.ts)) :
la restriction n'est pas modifiable depuis cette modale, elle doit seulement
survivre.

- [ ] **Step 4: Vérifier que ça compile, que le lint passe, et que la collection est verte**

```bash
cd backend && ./node_modules/.bin/nest build && ./node_modules/.bin/eslint 'src/**/*.ts'
```

Puis la commande de référence. Attendu : 0 échec.

- [ ] **Step 5: Vérifier en direct qu'un retrait de mot de passe fonctionne toujours**

Le risque de cette tâche est de ne plus jamais supprimer la ligne de sécurité,
ce qui laisserait des options fantômes. Sur `http://localhost:3333` :

1. Créer un transfert **avec** mot de passe et **sans** limite de vues.
2. Dans la modale d'infos, cocher le retrait du mot de passe, enregistrer.
3. Ouvrir le transfert en destinataire : il ne doit **plus** demander de mot de
   passe. La ligne de sécurité ne portait que le mot de passe et aucune
   restriction, donc elle doit avoir été supprimée.
4. Créer un transfert avec une limite de vues, enregistrer la modale sans y
   toucher, et vérifier que la limite est toujours appliquée.

- [ ] **Step 6: Commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/src/share/share.service.ts backend/test/newman-system-tests.json
git commit -F - <<'MSG'
Keep the restriction a share edit was never asked to touch

updateSecurity decided the fate of a three-column row by asking about
two of them. With no password and no view limit left it deleted the row
outright, and even when it kept it, the upsert's create branch copied
only those same two columns. Either way restrictToRecipients was lost.

The info modal sends a security block on every save, so this was not a
corner case: renaming a share that was restricted to its recipients,
with no password, silently opened it to anyone holding the link — with
no message, and without that setting ever appearing in the modal.

The field is carried, never authored: no edit path can set or clear it.
And a row is now deleted only when it really carries nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 5: Un seul bouton de lien, au niveau du transfert

Aucun test système : la collection Newman n'exerce pas le front. La preuve est
en vérification directe, et elle est suffisante — c'est un déplacement de
bouton, pas une règle d'accès.

Cette tâche **dépend de la tâche 2**. Tant que la branche sans cookie existe,
l'ancien bouton fonctionne encore et le supprimer ressemblerait à une
régression gratuite.

**Files:**
- Modify: `frontend/src/components/share/FileList.tsx:37-45`, `:109-133`, `:145-150`, `:284-296`
- Modify: `frontend/src/pages/share/[shareId]/index.tsx` (imports, et le groupe de droite en `:252`)

**Interfaces:**
- Consomme : la tâche 2 (la porte unique).
- Produit : rien.

- [ ] **Step 1: Retirer le bouton par fichier**

Dans `frontend/src/components/share/FileList.tsx` :

1. Supprimer la fonction `copyFileLink` en entier (`:109-133`). C'est elle qui
   fabriquait l'URL d'octets brute, désormais sans gardien qui l'accepte.
2. Supprimer le bloc de l'icône et sa condition (`:284-296`), soit le
   `{!share.hasPassword && ( … <TbLink /> … )}` complet.
3. Dans `countActionIcons` (`:41-45`), supprimer le terme `(hasPassword ? 0 : 1)`
   **et** le paramètre `hasPassword`, qui n'a plus d'autre usage :

```ts
// How many action buttons a given file's row will render — mirrors the
// conditionals in the actions cell exactly (download is unconditional,
// the clipboard and preview ones depend on the file type).
const countActionIcons = (file: FileMetaData) =>
  1 +
  (shareService.isShareTextFile(file.name) ? 1 : 0) +
  (shareService.doesFileSupportPreview(file.name) ? 1 : 0);
```

4. Adapter l'appel dans `maxActionIcons` (`:148`) :

```ts
          ...files.map((file) => countActionIcons(file)),
```

5. **Laisser le repli `: 3` (`:150`) tel quel.** Le maximum passe de 4 à 3 : un
   fichier texte satisfait `isShareTextFile` **et**
   `doesFileSupportPreview`, qui couvre `text/` en plus de `video/`, `image/`,
   `audio/` et `application/pdf`
   ([`share.service.ts:97` et `:113`](../frontend/src/services/share.service.ts)).
   Le repli valait déjà 3 quand le maximum était 4 : ce n'était pas le pire cas
   mais le cas courant. À 3, il devient exactement le pire cas, donc le
   squelette de chargement ne peut plus réserver trop peu de place. Ne pas le
   baisser.
6. Nettoyer les imports devenus inutiles — vraisemblablement `TbLink`,
   `useClipboard`, `TextInput`, `glassModalStyles` et `modals` si plus rien
   d'autre ne les emploie dans ce fichier. TypeScript et ESLint les signalent ;
   ne pas en supprimer un « au cas où ».
7. Mettre à jour le commentaire de `CARD_WIDTH` dans
   [`index.tsx:37-39`](../frontend/src/pages/share/[shareId]/index.tsx), qui
   justifie la largeur de la carte par « up to 4 action icons per row ». Le
   maximum passe à 3. La largeur elle-même ne change pas — 640 reste le bon
   chiffre pour une table avec une colonne de noms — mais un commentaire qui
   cite un nombre faux est pire que pas de commentaire.

- [ ] **Step 2: Ajouter le bouton unique sur la page**

Dans `frontend/src/pages/share/[shareId]/index.tsx`, ajouter dans le
`<Group spacing="xs" noWrap>` de droite (celui qui commence après le bloc du
titre, vers `:252`), **avant** les boutons conditionnels `isOwner` et
`isOwnerOrAdmin` :

```tsx
              {/* Not gated on isOwner: forwarding the link is the
                  recipient's need, not the owner's. And the canonical link
                  rather than window.location.href — the current URL can
                  carry a ?recipient= that a recipient would then hand on as
                  their own. */}
              <HoverTip label={t("common.button.copy-link")}>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label={t("common.button.copy-link")}
                  onClick={() => {
                    const appUrl =
                      config.get("general.appUrl") !==
                      config.get("general.appUrl", true)
                        ? config.get("general.appUrl")
                        : window.location.origin;

                    if (window.isSecureContext) {
                      clipboard.copy(`${appUrl}/s/${shareId}`);
                      toast.success(t("common.notify.copied-link"));
                    } else {
                      showShareLinkModal(
                        modals,
                        shareId,
                        config.get("general.appUrl"),
                        config.get("general.appUrl", true),
                      );
                    }
                  }}
                >
                  <TbLink />
                </ActionIcon>
              </HoverTip>
```

Ajouter en tête de composant, près des autres hooks :

```tsx
  const clipboard = useClipboard();
```

Les imports à ajouter, et eux seuls. `ActionIcon`, `HoverTip`, `useModals`
— donc `modals` —, `useConfig` — donc `config` —, `toast` et `useTranslate`
— donc `t` — sont **déjà** présents dans ce fichier :

```tsx
import { useClipboard } from "@mantine/hooks";
import showShareLinkModal from "../../../components/account/showShareLinkModal";
```

Et ajouter `TbLink` à l'import `react-icons/tb` existant, qui porte déjà
`TbDownload`, `TbEdit` et `TbFiles` :

```tsx
import { TbDownload, TbEdit, TbFiles, TbLink } from "react-icons/tb";
```

Attention au chemin : `showShareLinkModal` vit dans
`frontend/src/components/account/`, **pas** dans `components/share/` malgré son
sujet. C'est la même profondeur relative que les autres imports de cette page
(`../../../components/…`).

- [ ] **Step 3: Vérifier que ça compile et que le lint passe**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

```bash
cd frontend && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint src/components/share/FileList.tsx "src/pages/share/[shareId]/index.tsx"
```

Attendu : aucune sortie pour les deux.

- [ ] **Step 4: Vérifier en direct**

Sur `http://localhost:3333`, connecté en `testadmin@example.com` :

1. Ouvrir un transfert en destinataire : l'icône de lien est en haut à droite
   de la box, et il n'y a plus d'icône de lien sur les lignes de fichiers.
2. Copier le lien, l'ouvrir dans un navigateur vierge — ou une fenêtre privée :
   la page s'affiche et le transfert est téléchargeable.
3. Vérifier que le lien copié **ne contient pas** de `?recipient=`. Le tester
   depuis un transfert ouvert par un lien qui en portait un : le lien copié doit
   rester `…/s/<transfert>`.
4. Sur un transfert protégé par mot de passe : l'icône est **toujours** là — ce
   qui est nouveau — et le lien copié demande bien le mot de passe à l'arrivée.
5. Vérifier qu'il ne reste pas de vide à droite dans la colonne d'actions, sur
   un transfert de binaires non prévisualisables **et** sur un transfert
   contenant un fichier `.txt` — qui ajoute le bouton « copier le contenu ».
6. Vérifier la page à 375 px de large : le groupe de droite est `noWrap` et
   compte désormais jusqu'à trois icônes pour un propriétaire.

- [ ] **Step 5: Commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add "frontend/src/components/share/FileList.tsx" "frontend/src/pages/share/[shareId]/index.tsx"
git commit -F - <<'MSG'
Copy one link for the transfer, not one per file

The per-file button copied a raw byte URL, which is exactly the path the
previous commit closed. Left alone it would produce links that work for
whoever copied them — they hold the cookie — and fail for the person
they were sent to, which is worse than no button.

So the button moves up to the transfer and copies its page. It is not
gated on ownership, because forwarding a link is the recipient's need,
and it copies the canonical link rather than the current URL, which can
carry a ?recipient= the forwarder would be handing on as their own.

It also survives a password now. A direct byte URL could not ask for
one; a link to the page asks on arrival.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

## Couverture de la spec

| Section de la spec | Tâche |
|---|---|
| §3 La porte unique | Task 2 |
| §4 Un seul bouton de lien | Task 5 |
| §5 Les deux fuites anonymes | Task 3 |
| §6 La fusion non destructive | Task 4 |
| §8 Tests 1, 2, 3 | Task 2 (steps 1-2), Task 3 (steps 1-2) |
| §8 Vérifications 4 et 9 | Task 2 step 7 |
| §8 Vérifications 5, 6, 7 | Task 5 step 4 |
| §8 Vérification 8 | Task 4 steps 1-2 |
| §7 Hors périmètre | non implémenté, volontairement. À reverser dans `docs/chantiers.md` en fin de phase |
| §9 Ordre de livraison | Tasks 2 → 3 → 4 → 5, précédées de la Task 1 |

**Écart assumé entre la spec et ce plan**, à signaler à Majid plutôt qu'à
enterrer : la spec envisageait aussi d'affirmer le code `private_share` sur un
dépôt inversé privé **avec** un jeton de transfert. Ce test n'est pas dans le
plan. Il exige d'être porteur d'un jeton de transfert tout en n'étant pas le
créateur du transfert, or la collection signe toutes ses requêtes avec le même
compte et gère ses cookies à la main — le rendre fiable coûterait un second
compte et une gymnastique de cookies pour une règle que le garde parent
applique déjà sur le seul chemin survivant. Elle reste couverte par la
vérification en direct de la Task 2, step 7.

## Ce qui reste après cette phase

À traiter avant d'écrire la moindre ligne de Stripe :

1. Reverser le tableau « hors périmètre » de la spec §7 dans
   `docs/chantiers.md`, avec ses mesures, pour que la décision soit reprenable.
2. Trancher où vit une clé secrète Stripe, puisque `getByCategory` renvoie en
   clair la valeur de tout réglage `obscured`.
3. Décider si le droit payé vit dans `ShareSecurity` ou dans sa propre table —
   la Task 4 rend le premier choix possible, elle ne le recommande pas.
