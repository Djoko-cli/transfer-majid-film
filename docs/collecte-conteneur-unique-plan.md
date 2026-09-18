# La collecte comme conteneur unique — plan d'implémentation

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les
> étapes utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** qu'un lien de dépôt cesse de distribuer des transferts et devienne un
seul transfert qui grandit — l'album commun que plusieurs personnes remplissent
et dans lequel elles puisent.

**Architecture :** le conteneur est un `Share` ordinaire, créé en même temps que
le lien et portant le jeton pour identifiant, donc une seule adresse publique.
Il reste `uploadLocked` toute sa vie — c'est ce qui le rend lisible — et une
colonne `isCollection` explicite lui ouvre la seule exception nécessaire au
téléversement. Chaque dépôt devient une `ShareContribution` portant un prénom et
une adresse prouvée, à laquelle les fichiers se rattachent. L'ancien chemin, qui
fabriquait un transfert par dépôt, est retiré en entier.

**Pile :** NestJS 10 + Prisma (SQLite) côté serveur, Next.js 14 Pages Router +
Mantine 6 côté client, tests système en collection Postman exécutée par Newman.

**Spec :** [`docs/collecte-conteneur-unique.md`](collecte-conteneur-unique.md).
Le plan argumente depuis elle ; lire les deux.

---

## Contraintes globales

Elles s'appliquent implicitement à **chaque** tâche.

- **Le deux-points du chemin du dépôt casse la résolution `PATH` de npm.**
  Ne jamais invoquer `npx <outil>` : appeler `./node_modules/.bin/<outil>`
  explicitement. Et tout préfixe `PATH` doit être **relatif** — une entrée
  absolue contiendrait le deux-points de `js:nodejs`, que `PATH` scinde
  lui-même en deux entrées mortes.
- **ESLint s'invoque à l'opposé selon l'espace de travail.** Dans `frontend/` :
  `ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint <fichiers>`. Dans
  `backend/` : **sans** cette variable.
- **Aucun commit ne doit laisser les tests système au rouge.** Le workflow
  `backend-system-tests` s'exécute sur chaque `push` vers `main` et sur chaque
  pull request. Le cycle rouge → vert se déroule **dans** une tâche.
- **Le harnais de tests tourne sur une base jetable et sur le port 8081**, pour
  ne pas détruire la base de développement ni disputer le port au serveur de
  dev. Commande de référence, en deux terminaux :

  ```bash
  cd backend && PATH="./node_modules/.bin:$PATH" DATABASE_URL=file:../data/system-test.db BACKEND_PORT=8081 ./node_modules/.bin/prisma migrate reset -f && PATH="./node_modules/.bin:$PATH" DATABASE_URL=file:../data/system-test.db BACKEND_PORT=8081 ./node_modules/.bin/nest start
  ```
  ```bash
  cd backend && ./node_modules/.bin/wait-on http://localhost:8081/api/configs && ./node_modules/.bin/newman run ./test/newman-system-tests.json --env-var "API_URL=http://localhost:8081/api" --env-var "API_URL_ANON=http://127.0.0.1:8081/api"
  ```

  `API_URL_ANON` vise `127.0.0.1` et non `localhost` : le bocal à cookies de
  Newman apparie sur la chaîne d'hôte, c'est le seul moyen d'émettre une requête
  réellement non authentifiée depuis cette collection.
- **`prisma migrate dev` échoue en non-interactif.** Les migrations se
  fabriquent par différentiel :

  ```bash
  cd backend && mkdir -p prisma/migrations/<AAAAMMJJHHMMSS>_<nom> && PATH="./node_modules/.bin:$PATH" ./node_modules/.bin/prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/migration.sql
  ```
  puis `prisma migrate deploy` avec le même préfixe.
- Serveurs de développement : front **3333**, back **8080**. Administrateur de
  test local : `testadmin@example.com` / `TestPassword123!`. Mailpit sur
  **8025**, SMTP local sur 1025.
- Le champ de connexion s'appelle `email`, pas `emailOrUsername`.
- Toute commande `gh` doit porter `-R Djoko-cli/transfer-majid-film`.
- Les messages de commit sont en anglais et finissent par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- La copie d'interface française vouvoie le visiteur et dit « transfert », jamais
  « partage ». Les commentaires de code sont en anglais.
- **Toute nouvelle clé de traduction doit exister dans `fr-FR` et `en-US`.**
- Ne jamais lancer de build/release Docker, ni de commande mutante sur la NAS.

---

## Structure des fichiers

| Fichier | Sort |
|---|---|
| `backend/prisma/schema.prisma` | modifié : `Share.isCollection`, `ShareContribution`, `File.contributionId`, `ReverseShare` remanié |
| `backend/prisma/migrations/<date>_collection_container/` | créé |
| `backend/src/reverseShare/reverseShare.service.ts` | modifié : crée le conteneur, ne casse plus ses enfants |
| `backend/src/reverseShare/dto/createReverseShare.dto.ts` | modifié : deux horloges |
| `backend/src/share/contribution.service.ts` | **créé** : ouvrir, alimenter, fermer une contribution |
| `backend/src/share/contribution.controller.ts` | **créé** : les trois routes de dépôt |
| `backend/src/share/guard/contribution.guard.ts` | **créé** : le droit d'écrire dans une collecte |
| `backend/src/file/local.service.ts` | modifié : l'exception de verrou |
| `backend/src/share/share.service.ts` | modifié : la branche par dépôt retirée, le DTO enrichi |
| `backend/src/share/guard/createShare.guard.ts` | modifié : le laissez-passer inconditionnel retiré |
| `backend/src/jobs/jobs.service.ts` | modifié : le cron de fermeture |
| `frontend/src/pages/upload/[reverseShareToken].tsx` | **supprimé** |
| `frontend/src/components/upload/UploadPage.tsx` | modifié : la branche `isReverseShare` retirée |
| `frontend/src/pages/share/[shareId]/index.tsx` | modifié : l'album et le dépôt |
| `frontend/src/components/share/CollectionDropzone.tsx` | **créé** : identité puis dépôt |
| `frontend/src/pages/account/reverseShares.tsx` | modifié : la page de gestion |
| `frontend/src/components/share/modals/showCreateReverseShareModal.tsx` | modifié : deux horloges |
| `backend/test/newman-system-tests.json` | modifié : un dossier `Collection` |

---

### Task 1: Le modèle de données

Rien de fonctionnel ne change ici. La tâche existe seule parce qu'une migration
ratée est beaucoup plus coûteuse à démêler quand elle est enterrée sous du code.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<date>_collection_container/migration.sql`

**Interfaces:**
- Consomme : rien.
- Produit : `Share.isCollection`, `ShareContribution`, `File.contributionId`,
  `ReverseShare.containerShareId` / `collectionEndsAt` / `retentionSeconds`.
  Toutes les tâches suivantes en dépendent.

- [ ] **Step 1: Écrire le schéma**

Dans `backend/prisma/schema.prisma`, sur `model Share` :

```prisma
  // A collection transfer: the single container behind a deposit link. It
  // stays uploadLocked for its whole life, because that is what makes it
  // readable — and it accepts files anyway, which no other locked transfer
  // does. The exception is carried by this column rather than inferred from
  // the presence of a link, so that it is greppable and a future reader of
  // local.service.ts's lock check knows exactly what to look for.
  isCollection Boolean @default(false)

  collectionOf  ReverseShare?       @relation("ReverseShareContainer")
  contributions ShareContribution[]
```

Sur `model File` :

```prisma
  // Which contribution this file came in with. Null for every file that
  // predates this column and for every ordinary transfer.
  contributionId String?
  contribution   ShareContribution? @relation(fields: [contributionId], references: [id], onDelete: SetNull)
```

Sur `model User` :

```prisma
  contributions ShareContribution[]
```

Le modèle neuf, en entier :

```prisma
model ShareContribution {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  // The first name that was typed. Never verified, and deliberately so:
  // among friends, a name one could lie about is enough to know who is
  // still missing.
  name String?

  // The address, and only ever the one the one-time code proved — never
  // the one that was typed. Same rule as ShareService.create() applies to
  // an anonymous sender, and for the same reason: a declared but unproven
  // address would let someone sign a contribution in another person's name.
  email String?

  // Set instead of name/email when the contributor is signed in: their
  // account already carries both, and asking again would be absurd.
  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  // Open on creation, closed when the contributor is done. While it is
  // open, it is what authorises writing into the container.
  completedAt DateTime?

  shareId String
  share   Share  @relation(fields: [shareId], references: [id], onDelete: Cascade)

  files File[]

  @@index([shareId, createdAt])
}
```

Sur `model ReverseShare`, **retirer** `shares Share[]` et `shareExpiration`, et
ajouter :

```prisma
  // Created with the link and never later, and it takes the link's token
  // for its id — so there is exactly one public address and the owner
  // writes it. A link nobody ever uses leaves an empty transfer in their
  // list: that is intended, the empty transfer is the collection, waiting.
  containerShareId String @unique
  containerShare   Share  @relation("ReverseShareContainer", fields: [containerShareId], references: [id], onDelete: Cascade)

  // When depositing stops. Replaces shareExpiration, which used to close
  // the link and delete the files with a single date.
  collectionEndsAt DateTime

  // How long the album outlives the end of collection, in seconds. The
  // container's own expiration is collectionEndsAt + this, computed once,
  // at closing time.
  retentionSeconds Int
```

- [ ] **Step 2: Fabriquer la migration**

```bash
cd backend && STAMP=$(date +%Y%m%d%H%M%S) && mkdir -p "prisma/migrations/${STAMP}_collection_container" && PATH="./node_modules/.bin:$PATH" DATABASE_URL=file:../data/system-test.db ./node_modules/.bin/prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > "prisma/migrations/${STAMP}_collection_container/migration.sql" && cat "prisma/migrations/${STAMP}_collection_container/migration.sql"
```

Lire le SQL produit avant de l'appliquer. `containerShareId` est **non nul** sur
une table qui contient peut-être déjà des lignes : si la base de développement
porte des transferts inversés, la migration échouera. C'est attendu et c'est
sain — la spec §9 établit qu'aucun lien n'a jamais été distribué. Dans ce cas,
supprimer ces lignes de la base **de développement seulement** est acceptable ;
si la production en contenait, il faudrait s'arrêter et rouvrir la spec.

- [ ] **Step 3: Appliquer et vérifier**

```bash
cd backend && PATH="./node_modules/.bin:$PATH" DATABASE_URL=file:../data/system-test.db ./node_modules/.bin/prisma migrate deploy && PATH="./node_modules/.bin:$PATH" ./node_modules/.bin/prisma generate && ./node_modules/.bin/nest build
```

Attendu : migration appliquée, client régénéré, compilation à zéro. La
compilation **échouera** partout où le code lit `reverseShare.shares` ou
`shareExpiration` — c'est la liste de travail des tâches 2 et 4, à noter dans le
rapport sans la traiter ici.

> Cette tâche est la seule du plan à ne pas se terminer sur une compilation
> verte, parce que le schéma retire des champs que le code utilise encore. Elle
> n'est donc **pas commitée seule** : son commit est celui de la tâche 2.

- [ ] **Step 4: Ne rien commiter**

Reporter la liste des erreurs de compilation. La tâche 2 reprend à partir de là.

---

### Task 2: Le conteneur naît avec le lien, et meurt deux fois

**Files:**
- Modify: `backend/src/reverseShare/reverseShare.service.ts`
- Modify: `backend/src/reverseShare/dto/createReverseShare.dto.ts`
- Modify: `backend/src/jobs/jobs.service.ts`
- Test: `backend/test/newman-system-tests.json`

**Interfaces:**
- Consomme : le schéma de la tâche 1.
- Produit : `ReverseShareService.create()` renvoie toujours le jeton, qui est
  désormais **aussi** l'identifiant du conteneur. Les tâches 3, 5 et 6 en
  dépendent.

- [ ] **Step 1: Écrire le test qui échoue**

Le dossier va **avant** `Anonymous share leaks`, qui doit rester en dernier car
il bascule des réglages globaux. Lire d'abord les dossiers `Access gate` et
`Security merge` pour reprendre leur style exactement.

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && python3 - <<'PY'
import json, io

p = "backend/test/newman-system-tests.json"
c = json.load(io.open(p, encoding="utf-8"))

def js(lines):
    return {"type": "text/javascript", "exec": lines}

def item(name, method, path, query=None, body=None, headers=None, tests=None, pre=None, host="{{API_URL}}"):
    raw = host + "/" + "/".join(path)
    if query:
        raw += "?" + "&".join(f"{q['key']}={q['value']}" for q in query)
    url = {"raw": raw, "host": [host], "path": path}
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

folder = {"name": "Collection container", "item": [

  item("Create a collection link", "POST", ["reverseShares"],
       body=raw_json({"token": "vacances-test", "sendEmailNotification": False,
                      "maxShareSize": "1073741824", "collectionEndsAt": "3-days",
                      "retention": "7-days", "maxUseCount": 20,
                      "publicAccess": True}),
       tests=["pm.test('Status code is 201', () => {",
              "    pm.response.to.have.status(201);",
              "});"]),

  item("The container exists at the token's own address", "GET",
       ["shares", "vacances-test"],
       tests=["pm.test('Status code is 200', () => {",
              "    pm.response.to.have.status(200);",
              "});",
              "pm.test('It is a collection, open, and empty', () => {",
              "    const b = pm.response.json();",
              "    pm.expect(b.isCollection).to.be.true;",
              "    pm.expect(b.files.length).to.be.equal(0);",
              "});"]),

  item("A collection cannot take an id a transfer already owns", "POST",
       ["reverseShares"],
       body=raw_json({"token": "test-share", "sendEmailNotification": False,
                      "maxShareSize": "1073741824", "collectionEndsAt": "3-days",
                      "retention": "7-days", "maxUseCount": 20,
                      "publicAccess": True}),
       tests=["pm.test('Status code is 400', () => {",
              "    pm.response.to.have.status(400);",
              "});"]),
]}

names = [f.get("name") for f in c["item"]]
assert "Collection container" not in names, "dossier deja present"
idx = names.index("Anonymous share leaks") if "Anonymous share leaks" in names else len(c["item"])
c["item"].insert(idx, folder)
io.open(p, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False, indent="\t"))
print("dossier Collection container insere a l'index", idx)
PY
```

`test-share` est la part fixe créée par le dossier `Create Share` : le troisième
test vérifie que les deux espaces de noms sont bien confondus.

- [ ] **Step 2: Vérifier que ça échoue, et comment**

Commande de référence. Les trois assertions doivent échouer — la première parce
que le DTO ne connaît pas encore `collectionEndsAt`. C'est attendu.

- [ ] **Step 3: Les deux horloges dans le DTO**

Dans `backend/src/reverseShare/dto/createReverseShare.dto.ts`, remplacer
`shareExpiration` par :

```ts
  // When depositing stops, as a relative "3-days" string, same shape as
  // the field it replaces.
  @IsString()
  collectionEndsAt: string;

  // How long the album survives after that, same shape.
  @IsString()
  retention: string;
```

- [ ] **Step 4: Créer le conteneur avec le lien**

Dans `backend/src/reverseShare/reverseShare.service.ts`, `create()` :
`shareExpiration` cède la place aux deux horloges, et la création devient
transactionnelle.

```ts
    const collectionEndsAt = parseRelativeDateToAbsolute(data.collectionEndsAt);
    const retentionSeconds = moment
      .duration(
        data.retention.split("-")[0],
        data.retention.split("-")[1] as moment.unitOfTime.DurationConstructor,
      )
      .asSeconds();

    // Two namespaces became one the day the container took the token for
    // its id, so both have to be clear. Checking only the token would let
    // a collection be born at the address of an existing transfer.
    if (!(await this.isReverseShareTokenAvailable(data.token)).isAvailable)
      throw new BadRequestException(this.i18n.t("reverseShare.tokenInUse"));
    // Queried here rather than through ShareService: ShareModule already
    // imports ReverseShareModule, so injecting it back would be circular
    // and would need a forwardRef for a single findUnique.
    if (await this.prisma.share.findUnique({ where: { id: data.token } }))
      throw new BadRequestException(this.i18n.t("share.idInUse"));
```

Puis, en une transaction, le conteneur **et** le lien :

```ts
    // The container is born locked, which is what makes it readable at
    // once: an unlocked transfer answers "not found" and a cron deletes it
    // within a day. Its expiration is far off until the collection closes,
    // at which point the cron in JobsService computes the real one.
    const reverseShare = await this.prisma.$transaction(async (tx) => {
      await tx.share.create({
        data: {
          id: data.token,
          name: data.name || undefined,
          description: data.description || undefined,
          isCollection: true,
          uploadLocked: true,
          expiration: moment(collectionEndsAt).add(10, "years").toDate(),
          creatorId,
          security:
            hashedPassword || data.maxViews
              ? {
                  create: {
                    password: hashedPassword,
                    maxViews: data.maxViews || undefined,
                  },
                }
              : undefined,
        },
      });

      return tx.reverseShare.create({
        data: {
          token: data.token,
          containerShareId: data.token,
          collectionEndsAt,
          retentionSeconds,
          remainingUses: data.maxUseCount,
          maxShareSize: data.maxShareSize,
          sendEmailNotification: data.sendEmailNotification,
          publicAccess: data.publicAccess,
          name: data.name || undefined,
          description: data.description || undefined,
          password: hashedPassword,
          maxViews: data.maxViews || undefined,
          creatorId,
        },
      });
    });
```

`hashedPassword` est la valeur déjà calculée plus haut dans la méthode ; la
sortir dans une variable plutôt que de hacher deux fois.

- [ ] **Step 5: Le cron qui ferme les collectes**

Dans `backend/src/jobs/jobs.service.ts`, une méthode neuve :

```ts
  // The first of the two clocks running out. Depositing stops on its own,
  // because every write checks collectionEndsAt — what this does is start
  // the second clock, by giving the container the expiration it will
  // actually die of. Computed once, here, rather than derived on every
  // read: an album whose death date moves is one nobody can answer "until
  // when?" about.
  @Cron("0 * * * *")
  async closeEndedCollections() {
    const ended = await this.prisma.reverseShare.findMany({
      where: {
        collectionEndsAt: { lt: new Date() },
        containerShare: { expiration: { gt: moment().add(1, "year").toDate() } },
      },
      include: { containerShare: true },
    });

    for (const collection of ended) {
      await this.prisma.share.update({
        where: { id: collection.containerShareId },
        data: {
          expiration: moment(collection.collectionEndsAt)
            .add(collection.retentionSeconds, "seconds")
            .toDate(),
        },
      });
    }

    if (ended.length > 0) {
      this.logger.log(`Closed ${ended.length} collections`);
    }
  }
```

Le filtre sur une expiration à plus d'un an est ce qui rend l'opération
idempotente : une collecte déjà fermée porte une date proche et n'est plus
sélectionnée.

- [ ] **Step 6: `remove()` ne doit plus tuer l'album**

Dans le même service, `remove()` expire aujourd'hui tous les transferts liés.
Avec un conteneur, cela reviendrait à supprimer l'album en supprimant le lien.
La cascade `onDelete: Cascade` sur `containerShare` fait déjà le nécessaire dans
l'autre sens ; retirer la boucle d'expiration et ne supprimer que la ligne
`ReverseShare`.

- [ ] **Step 7: Compiler, linter, et vérifier le vert**

```bash
cd backend && ./node_modules/.bin/nest build && ./node_modules/.bin/eslint 'src/**/*.ts'
```

Puis la commande de référence : les trois assertions du dossier `Collection
container` passent, et **rien d'autre ne régresse**.

- [ ] **Step 8: Commiter, schéma compris**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/prisma backend/src/reverseShare backend/src/jobs backend/test
git commit -F - <<'MSG'
Give a deposit link one container, born with it

A reverse share minted a transfer per submission, so the link was a
ticket dispenser and nothing ever pooled. It now carries a single
container, created in the same transaction as the link itself and taking
the link's token for its id — so there is exactly one public address,
and it is the one the owner typed.

The container is born locked on purpose. That is the only state in which
a transfer is readable; unlocked it answers "not found" and a cron
deletes it within the day. Writing into it is a separate exception,
carried by its own column.

The single expiry date splits in two. One closes the collection, the
other says how long the album outlives it, and an hourly job turns the
first into the second — so a photo dropped on the last day no longer
lives for an hour.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 3: Écrire dans une collecte

Le cœur du chantier. Une contribution ouverte est ce qui autorise l'écriture :
le drapeau `isCollection` dit seulement que ce transfert n'est pas figé.

**Files:**
- Modify: `backend/src/file/local.service.ts` (le refus de verrou)
- Create: `backend/src/share/contribution.service.ts`
- Create: `backend/src/share/contribution.controller.ts`
- Create: `backend/src/share/guard/contribution.guard.ts`
- Modify: `backend/src/share/share.module.ts`
- Test: `backend/test/newman-system-tests.json`

**Interfaces:**
- Consomme : le conteneur de la tâche 2.
- Produit : `POST /shares/:id/contributions` → `{ id }` ;
  `POST /shares/:id/contributions/:contributionId/files` ;
  `POST /shares/:id/contributions/:contributionId/complete`. La tâche 5 les
  appelle.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter au dossier `Collection container` de la tâche 2, à la suite :

- `Open a contribution without an identity is refused` → sur `{{API_URL_ANON}}`,
  avec le retrait de l'en-tête `Cookie` (copier le motif des dossiers existants),
  attendu **403** ;
- `Open a contribution as a signed-in user` → sur `{{API_URL}}`, attendu **201**,
  et `pm.collectionVariables.set('CONTRIB_ID', pm.response.json().id)` ;
- `Upload into the contribution` → `POST {{API_URL}}/shares/vacances-test/contributions/{{CONTRIB_ID}}/files?name=photo.txt&chunkIndex=0&totalChunks=1`,
  en-tête `Content-Type: application/octet-stream`, corps
  `data:application/octet-stream;base64,VGVzdCBmaWxl`, attendu **201** ;
- `Close the contribution` → attendu **200** ;
- `The container now holds the file` → `GET {{API_URL}}/shares/vacances-test`,
  attendu **200** et `files.length === 1` ;
- `A second contribution lands in the same container` → réouvrir, déposer,
  fermer, puis vérifier `files.length === 2` **et** que l'identifiant du
  transfert n'a pas changé. C'est l'assertion qui prouve le conteneur unique ;
  sans elle, tout le reste pourrait passer avec deux transferts.

- [ ] **Step 2: Vérifier que ça échoue**

Commande de référence. Les routes n'existent pas : attendu 404 partout sauf sur
la lecture du conteneur.

- [ ] **Step 3: L'exception de verrou**

Dans `backend/src/file/local.service.ts`, remplacer :

```ts
    if (share.uploadLocked)
      throw new BadRequestException(this.i18n.t("file.alreadyCompleted"));
```

par :

```ts
    // A collection is the one transfer that is locked and still writable:
    // locked is what makes it readable, and it has to be readable while it
    // fills. What actually authorises this write is the open contribution
    // the controller checked before getting here — this flag only says the
    // transfer is not frozen.
    if (share.uploadLocked && !share.isCollection)
      throw new BadRequestException(this.i18n.t("file.alreadyCompleted"));
```

Le chemin S3 n'a pas d'équivalent à modifier : `createPreSignedUploadUrls`
(`file.service.ts:79`) ne consulte pas `uploadLocked` du tout. C'est une lacune
préexistante, hors périmètre, à consigner dans `docs/chantiers.md` en fin de
tâche plutôt qu'à corriger ici.

- [ ] **Step 4: Le garde**

`backend/src/share/guard/contribution.guard.ts` :

```ts
// What lets a stranger write into someone else's transfer, and the only
// thing that does. Three conditions, all necessary: the transfer is a
// collection, its collection window is still open, and the contribution
// named in the path belongs to it and has not been closed. A contribution
// is only ever opened against a proven identity (see ContributionService),
// so this guard inherits that proof rather than re-checking it.
@Injectable()
export class ContributionGuard implements CanActivate {
  constructor(private prisma: PrismaService, private readonly i18n: I18nService) {}

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const { id, contributionId } = request.params;

    const contribution = await this.prisma.shareContribution.findUnique({
      where: { id: contributionId },
      include: { share: { include: { collectionOf: true } } },
    });

    if (!contribution || contribution.shareId !== id)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    if (contribution.completedAt)
      throw new ForbiddenException(
        this.i18n.t("share.contributionClosed"),
        "contribution_closed",
      );

    if (
      !contribution.share.isCollection ||
      !contribution.share.collectionOf ||
      contribution.share.collectionOf.collectionEndsAt < new Date()
    )
      throw new ForbiddenException(
        this.i18n.t("share.collectionClosed"),
        "collection_closed",
      );

    (request as any).contribution = contribution;
    return true;
  }
}
```

Deux clés de traduction neuves, dans `backend/src/i18n/fr-FR/share.json` **et**
`en-US/share.json` : `contributionClosed` et `collectionClosed`.

- [ ] **Step 5: Le service**

`backend/src/share/contribution.service.ts` porte trois méthodes.

`open(shareId, name, user, verifiedEmail)` : refuse si le transfert n'est pas
une collecte ouverte ; refuse si `remainingUses <= 0` ; refuse si ni `user` ni
`verifiedEmail` ; décrémente `remainingUses` ; crée la ligne. Le commentaire à y
mettre :

```ts
    // An identity is required, and it is never the one that was typed: a
    // signed-in account, or an address the one-time code proved. The link
    // used to stand in for identity — a valid token was a free pass — and
    // that is exactly why nobody could tell who had sent what.
```

`complete(contribution)` : pose `completedAt`, met `isZipReady: false` sur le
conteneur, relance `createZip`, et notifie le créateur si
`sendEmailNotification`. Le commentaire :

```ts
    // The archive is rebuilt from scratch on every contribution. On a
    // multi-gigabyte album that will be felt, and the answer then is to
    // build it on demand instead — measure before assuming either way.
```

`getWithFiles(shareId)` : les contributions avec leurs fichiers, pour le DTO de
la tâche 5.

- [ ] **Step 6: Le contrôleur**

`backend/src/share/contribution.controller.ts`, préfixe
`shares/:id/contributions`. Trois routes, gardées comme le tableau du §7 de la
spec le dit. La route de fichiers reprend **mot pour mot** le corps de
`FileController.create` (`file.controller.ts:96-118`) — mêmes paramètres de
requête, même appel à `fileService.create` — en ajoutant l'identifiant de
contribution au fichier créé. Ne pas réécrire ce corps de mémoire : l'ouvrir et
le copier.

Déclarer les trois classes dans `backend/src/share/share.module.ts`
(`controllers` pour le contrôleur, `providers` pour le service).

- [ ] **Step 7: Compiler, linter, vérifier le vert**

```bash
cd backend && ./node_modules/.bin/nest build && ./node_modules/.bin/eslint 'src/**/*.ts'
```

Puis la commande de référence : tout le dossier `Collection container` passe, y
compris l'assertion des deux contributions dans un seul conteneur.

- [ ] **Step 8: Commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/src backend/test
git commit -F - <<'MSG'
Let a collection be written into while it stays readable

Locked and unlocked were the only two states a transfer had, and neither
fits a container that fills over a week: locked refuses files, unlocked
answers "not found" and is deleted by a cron within a day. A collection
stays locked and the lock check gains one named exception.

The exception is not what grants the write. An open contribution is, and
a contribution is only ever opened against an identity — a signed-in
account, or an address the one-time code proved. A valid link used to be
a free pass, which is the reason nobody could tell who had sent what.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 4: Retirer l'ancien chemin

Aucun lien n'ayant jamais été distribué (spec §9), l'ancien modèle part en
entier plutôt que de survivre en compatibilité.

**Files:**
- Modify: `backend/src/share/share.service.ts` (la branche par dépôt)
- Modify: `backend/src/share/guard/createShare.guard.ts`
- Modify: `frontend/src/components/upload/UploadPage.tsx`
- Modify: `frontend/src/services/share.service.ts`
- Delete: `frontend/src/pages/upload/[reverseShareToken].tsx`

**Interfaces:**
- Consomme : les tâches 2 et 3, qui doivent être vertes avant de retirer quoi
  que ce soit.
- Produit : rien.

- [ ] **Step 1: Retirer le laissez-passer du garde**

Dans `createShare.guard.ts`, supprimer le bloc qui rend `true` sur simple
présence d'un jeton valide (`:23-28`). Un dépôt ne passe plus par `POST /shares`.

- [ ] **Step 2: Retirer la branche par dépôt**

Dans `share.service.ts`, `create()` perd tout ce qui concerne
`reverseShareToken` : le paramètre, la recherche du lien, l'écrasement du nom,
de la description, de l'expiration et de la sécurité, et le `connect` final. Le
contrôleur cesse de lire le cookie `reverse_share_token` et de le passer, ici et
dans `complete()`.

- [ ] **Step 3: Retirer le parcours frontend**

- Supprimer `frontend/src/pages/upload/[reverseShareToken].tsx`.
- Dans `UploadPage.tsx` : retirer la propriété `isReverseShare`, la branche de
  rendu correspondante, `submitReverseShare`, et l'exemption `!isReverseShare`
  de `requiresEmailVerification` (`:90`) — cette dernière disparaît d'elle-même
  avec la propriété.
- Dans `frontend/src/services/share.service.ts` : retirer la pose et la
  suppression du cookie `reverse_share_token`.

- [ ] **Step 4: Vérifier que rien ne référence plus l'ancien chemin**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer" && grep -rn "reverse_share_token\|isReverseShare\|reverseShareToken" backend/src frontend/src || echo "(plus aucune référence)"
```

Attendu : plus aucune référence, hors les noms de variables internes au module
`reverseShare` lui-même.

- [ ] **Step 5: Compiler des deux côtés et vérifier le vert**

```bash
cd backend && ./node_modules/.bin/nest build && ./node_modules/.bin/eslint 'src/**/*.ts'
```
```bash
cd frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint 'src/**/*.tsx' 'src/**/*.ts'
```

Puis la commande de référence. **Attention** : le dossier Newman existant
`Access gate` contient des requêtes qui créent un transfert via un jeton de
dépôt (`Create a private reverse share`, `Create share through the private
reverse share`). Elles vont casser, et c'est correct — ce chemin n'existe plus.
Les réécrire pour qu'elles utilisent une collecte, en conservant leur intention :
vérifier qu'un fichier d'une collecte non publique n'est pas servi sans jeton.

- [ ] **Step 6: Commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add -A backend/src frontend/src backend/test
git commit -F - <<'MSG'
Remove the path that minted a transfer per deposit

Nothing has ever been deposited through a link on this instance, so the
old model leaves whole rather than living beside the new one: the branch
of create() that overwrote each submission's name and expiration, the
guard clause that made a valid token a free pass, the frontend page that
drove it, and the cookie that carried it.

The system tests that exercised the old path are rewritten against a
collection rather than deleted — what they were really checking, that a
non-public collection serves nothing without a token, still matters.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 5: La page publique — l'album et le dépôt

**Files:**
- Modify: `backend/src/share/dto/share.dto.ts` (l'état de collecte)
- Modify: `frontend/src/pages/share/[shareId]/index.tsx`
- Create: `frontend/src/components/share/CollectionDropzone.tsx`
- Modify: `frontend/src/components/share/FileList.tsx` (le groupement)
- Modify: `frontend/src/i18n/translations/fr-FR.ts` et `en-US.ts`

**Interfaces:**
- Consomme : les routes de la tâche 3.
- Produit : rien.

- [ ] **Step 1: Le DTO porte la collecte**

`ShareDTO` gagne, avec `@Expose()` — sans quoi le champ disparaît
silencieusement, `excludeExtraneousValues` étant actif :

```ts
  @Expose()
  isCollection: boolean;

  @Expose()
  collection?: {
    isOpen: boolean;
    endsAt: Date;
    description?: string;
    contributions: { id: string; name?: string; createdAt: Date; fileCount: number }[];
  };
```

- [ ] **Step 2: Le composant de dépôt**

`CollectionDropzone.tsx` enchaîne deux états.

**Identité.** Si `user` existe, rien à saisir — afficher son nom et passer.
Sinon : un champ prénom, un champ adresse, un bouton qui appelle
`POST /api/verification/request-code`, puis un champ à six chiffres qui appelle
`verify-code`. Ce parcours existe déjà à l'identique dans le flux d'envoi
anonyme ; **l'ouvrir et en reprendre la forme** plutôt que de le réinventer.

**Dépôt.** `POST /shares/:id/contributions` avec le prénom, puis la réutilisation
du téléversement par morceaux de `UploadPage` vers la route de contribution,
puis `complete`. Recharger l'album.

Si `collection.isOpen` est faux, ne rien afficher de tout ça : une phrase disant
depuis quand la collecte est close.

- [ ] **Step 3: Le groupement dans la liste**

`FileList` accepte une propriété optionnelle `contributions`. Quand elle est
fournie, les fichiers sont groupés par contribution, chaque groupe précédé d'une
ligne « 40 photos de Sophie · 12 septembre ». Sans elle, le rendu actuel ne
change pas d'un pixel — c'est la même liste que tous les transferts utilisent.

Nouvelles clés, dans les deux langues : `share.collection.contributed-by`,
`share.collection.anonymous`, `share.collection.closed-since`,
`share.collection.add-files`, `share.collection.identity.title`.

- [ ] **Step 4: Vérifier en direct**

Serveurs de dev sur 3333 et 8080, Mailpit sur 8025.

1. Créer une collecte depuis le compte admin.
2. Ouvrir son adresse dans un contexte **sans cookie** : l'album s'affiche, vide,
   avec le dépôt proposé.
3. Déposer en tant que visiteur : prénom, adresse, code lu dans Mailpit, deux
   fichiers. L'album les affiche, attribués au prénom donné.
4. Déposer une seconde fois sous un autre prénom : **l'adresse n'a pas changé**
   et l'album contient les deux contributions, distinctes et étiquetées.
5. Le « tout télécharger » rend une archive contenant les fichiers des deux.
6. Sur une collecte protégée par mot de passe, il est demandé avant de voir quoi
   que ce soit, et une seule fois pour lire comme pour déposer.

- [ ] **Step 5: Compiler, linter, commiter**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint 'src/**/*.tsx' 'src/**/*.ts'
```

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/src frontend/src
git commit -F - <<'MSG'
Make the collection's address both the album and the drop

One link meant one page, and a contributor could see none of what the
others had already put in — the point of pooling photos after a trip
being largely that everyone leaves with everyone's.

So the transfer's own page carries the dropzone when the transfer is a
collection, and the file list groups by contribution, because "40 photos
from Sophie" is the thing that makes an album legible and a pile of two
hundred files is not. A contributor identifies themselves first, through
the same one-time code an anonymous sender already goes through.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

### Task 6: La page du propriétaire

**Files:**
- Modify: `frontend/src/pages/account/reverseShares.tsx`
- Modify: `frontend/src/components/share/modals/showCreateReverseShareModal.tsx`
- Modify: `backend/src/reverseShare/dto/reverseShare.dto.ts`
- Modify: `frontend/src/i18n/translations/fr-FR.ts` et `en-US.ts`

**Interfaces:**
- Consomme : tout ce qui précède.
- Produit : rien.

- [ ] **Step 1: Le DTO du propriétaire**

`ReverseShareDTO` expose enfin `name` et `description` — aujourd'hui absents —
plus `collectionEndsAt`, l'expiration du conteneur, le nombre de contributions,
le nombre de fichiers, le poids total et les prénoms des contributeurs.

- [ ] **Step 2: Les deux horloges dans le formulaire**

Dans `showCreateReverseShareModal.tsx` :

- le champ d'expiration devient **deux** champs : « Collecte ouverte pendant » et
  « Album conservé après la fermeture », chacun avec son nombre et son unité, sur
  le modèle exact du champ actuel (`:262-275`) ;
- `maxUseCount` passe de `1` à `20` par défaut (`:115`) et son libellé devient
  « Nombre de dépôts autorisés » — le défaut à 1 tuait le scénario au premier
  ami ;
- corriger au passage `publicAccess: !!(getCookie(…) ?? true)` (`:119`), qui ne
  peut jamais valoir faux : `getCookie` rend la chaîne `"false"`, qui est vraie.
  La comparer explicitement à `"false"`.

- [ ] **Step 3: La page de gestion**

Chaque ligne devient une collecte : son nom, son adresse avec un bouton copier,
le nombre de contributeurs et leurs prénoms, le nombre de fichiers et le poids
total, l'état (*ouverte jusqu'au X* / *fermée, album gardé jusqu'au Y*), et un
lien vers l'album. L'accordéon d'identifiants bruts disparaît.

- [ ] **Step 4: Vérifier en direct**

1. Créer une collecte : les deux durées sont saisissables et le défaut de dépôts
   n'est plus 1.
2. Décocher « Accès public », enregistrer, rouvrir le formulaire : la case est
   **toujours décochée** — c'est le bogue du cookie.
3. Après deux contributions, la ligne affiche deux contributeurs, leurs prénoms,
   le total des fichiers et le poids.
4. Ouvrir l'album depuis cette page : aucun mot de passe n'est demandé au
   propriétaire, et il y est reconnu comme créateur.

- [ ] **Step 5: Compiler, linter, commiter**

```bash
cd "/Users/Majid/Documents/Dev/js:nodejs/fork-wetransfer"
git add backend/src frontend/src
git commit -F - <<'MSG'
Show a collection instead of a column of random ids

The owner's whole view of what people had sent was an accordion of
truncated share ids: no date, no count, no size, no name. It now says
what a collection is — who contributed, how much, until when it takes
deposits and until when the album lives.

The creation form gains the second clock and loses two defaults that
worked against it: a deposit limit of one, which killed the scenario at
the first friend, and a public-access checkbox that could never come
back unticked because the cookie holds the string "false", which is
truthy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
git push
```

---

## Couverture de la spec

| Section de la spec | Tâche |
|---|---|
| §3 Le point dur — `isCollection` et l'exception de verrou | Task 1 (colonne), Task 3 (exception) |
| §4 Le modèle de données | Task 1 |
| §5 Le parcours du contributeur | Task 5 |
| §6 Le parcours du propriétaire | Task 6 |
| §7 Les routes | Task 3 (dépôt), Task 5 (DTO du transfert), Task 6 (DTO du lien) |
| §8 Les deux horloges et l'archive | Task 2 (horloges, cron), Task 3 (archive) |
| §9 L'ancien chemin retiré | Task 4 |
| §10 Hors périmètre | non implémenté ; le `maxUseCount` et le bogue du cookie sont les deux exceptions, traités en Task 6 parce qu'ils sont dans le formulaire qu'on rouvre de toute façon |
| §11 Vérification, tests 1 à 3 | Task 2 step 1, Task 3 step 1 |
| §11 Vérifications 4 à 7 | Task 5 step 4, Task 6 step 4 |

**Écart assumé** : la lacune du chemin S3, qui ne vérifie pas `uploadLocked` du
tout, est constatée en Task 3 et reversée dans `docs/chantiers.md` sans être
corrigée. Elle préexiste à ce chantier et n'est pas sur son chemin.

## Ordre et dépendances

Strictement séquentiel. La tâche 1 ne compile pas seule et se commite avec la
tâche 2. La tâche 4 ne doit retirer l'ancien chemin qu'une fois le nouveau vert,
sans quoi il n'existe plus aucun moyen de déposer. Les tâches 5 et 6 sont
frontend et pourraient s'inverser, mais la 5 valide les routes de la 3 en
conditions réelles et vaut d'être faite d'abord.
