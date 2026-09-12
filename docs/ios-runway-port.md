# Porter le « runway » iOS depuis Review — barres ancrées

**Pour qui :** la session Claude Code dédiée à Transfer.
**Objectif :** la photographie apparaît sous la barre d'état et sous la barre
d'outils de Safari iOS, **en gardant la navbar et le footer ancrés** exactement
là où ils sont aujourd'hui.
**Statut :** l'arrangement cible est **choisi et livré sur Review**, et les deux
moitiés (barre haute ancrée, barre basse ancrée) sont **mesurées**. Ce document
donne les nombres, pas des hypothèses.

Transfer lu au commit `975b218`. Toutes les citations `fichier:ligne` ont été
vérifiées dans le code réel. Implémentation de référence dans l'autre repo,
`fork-freeframe` (Review), au commit `03e05fd` :
`apps/web/components/shared/full-bleed-shell.tsx` et le bloc `.runway-*` de
`apps/web/app/globals.css`.

---

## 0. Le résultat en une phrase

**« Ancré » n'a jamais eu besoin de `position: fixed`.** `fixed` et `sticky` sont
les deux seules constructions que Safari iOS détourne. Mais si le document est
garé et ne bouge plus jamais, **une boîte `absolute` ordinaire ne bouge pas non
plus** — et n'étant ni fixe ni collante, elle garde son flou sous la barre
d'état au lieu d'être découpée puis recouverte d'un aplat opaque.

Donc pour Transfer, **l'arrangement visuel ne change pas du tout**. Les barres
restent où elles sont, immobiles, le contenu passe derrière. Seul leur *schéma
de positionnement* change : `fixed` → `absolute` dans un document garé.

---

## 1. La découverte qui change le diagnostic

**Le coupable n'est probablement ni la navbar ni le footer. C'est BrandPanel.**

`frontend/src/components/upload/BrandPanel.tsx:286-308` :

```ts
// base (desktop)
{ position: "absolute", inset: 0, overflow: "hidden",
  backgroundColor: theme.colors.dark[8] }   // #030303
// sous le breakpoint "sm"
[theme.fn.smallerThan("sm")]: { position: "fixed", inset: 0, height: "100dvh" }
```

Sur mobile, **la photo elle-même** est une boîte `fixed` touchant les quatre
bords, à la taille exacte du viewport, avec une `background-color` quasi-noire
explicite. C'est à la fois la forme la plus forte du déclencheur de remplissage
**et** la seule propriété que l'échantillonneur de WebKit lit — puisqu'il ignore
explicitement les images.

La bande noire est donc très probablement `#030303` prélevé sur la photo, pas
une couleur dérivée des barres. **Première conversion à faire : `.panel`.**

Même bug une seconde fois pour les pages « document » :
`frontend/src/components/core/GlassPageBackdrop.tsx:16-28` —
`position: fixed; inset: 0; z-index: -1`.

---

## 2. Les faits WebKit (établis, ne pas re-débattre)

Issus de la source WebKit et confirmés sur l'appareil pendant le travail sur
Review.

1. **Toute couche `fixed` ou `sticky` de la frame principale est découpée au
   viewport de mise en page**, quels que soient `top`, `height`, `lvh`, ou un
   décalage négatif. WebKit a un test de non-régression exactement là-dessus.
   *Une barre fixe ne peut donc jamais peindre sous la barre d'état.*

2. Une boîte `fixed`/`sticky` à peu près aussi large que le viewport et touchant
   un bord fait insérer par WKWebView une **vue native opaque** (« Fixed color
   extension fill ») **au-dessus** du contenu web, de la taille de l'inset,
   colorée en échantillonnant la boîte — **l'échantillonneur saute les images**.

3. Au repos (`scrollY === 0`), la bande sous la barre d'état correspond à
   `y < 0` du document — hors document — où seule la **couleur** de fond racine
   est peinte. Vérifié : `html` en vert a rendu les bandes vertes ; une
   `background-image` n'a rien fait.

4. `env(safe-area-inset-*)` vaut **0** dans un onglet Safari normal, même avec
   `viewport-fit=cover`. Mesures : `innerHeight` 695, `100lvh` 735, écran 852,
   barre d'état 59, barre d'outils déployée 98, rétractée 58.

5. **Ce qui peut peindre dans ces bandes :** le contenu ordinaire — ni `fixed`,
   ni `sticky` — d'un document déjà défilé d'au moins la hauteur de la bande.

---

## 3. L'arrangement cible, tel que livré et mesuré sur Review

### 3.1 Les variables

| Variable | Valeur | Rôle |
|---|---|---|
| `--runway-park` | 120 px | où le document est garé (JS). Doit dépasser la barre d'état (47/59/62 selon le modèle). |
| `--runway-reach` | 96 px | de combien la photo **et** le conteneur de défilement démarrent au-dessus du viewport de mise en page. |
| `--runway-cover` | 160 px | jusqu'où la **photo** continue sous l'écran. Serré : c'est du grossissement. |
| `--runway-rise` | 640 px | de combien la boîte de la **bande haute** court au-dessus de la page. |
| `--runway-bleed` | 640 px | ce que la **page** réserve en bas, et jusqu'où court la bande basse. |

`rise` et `bleed` sont grands pour une seule raison : mettre la **fin des bandes
hors d'atteinte d'un glissement**. iOS étire un conteneur selon
`(1 − 1/(1 + 0,55·x/D))·D` pour `x` pixels de doigt. À 160 px de réserve, la fin
apparaissait après ~120 px de doigt. À 640, il en faut ~1780 sur un écran de 852.

### 3.2 La structure

```
.runway                      position: relative; height: park + 100dvh + bleed
├── .runway-backdrop         absolute; top: park − reach; height: reach + 100dvh + cover
│                            → la photo, boîte ordinaire, jamais fixed/sticky
├── .runway-bar-slot         absolute; top: park            (viewport 0)
│   └── <header class="runway-head">     ← LA BARRE HAUTE ANCRÉE
├── .runway-foot-slot        absolute; bottom: 0            (viewport dvh + bleed)
│   └── <footer>                          ← LA BARRE BASSE ANCRÉE
└── .runway-app              absolute; top: park − reach; height: reach + 100dvh + bleed
    │                        overflow-y: auto; overscroll-behavior: contain
    └── .runway-page         padding-top: reach + <hauteur barre haute>
                             padding-bottom: bleed + <hauteur barre basse>
```

Et du JS qui maintient `window.scrollY` à `park`, plus rien d'autre.

### 3.3 Les deux bandes, et pourquoi leurs formules diffèrent

**Bande haute** (`.runway-head`, livrée sur Review) :

```css
margin-top: calc(-1 * var(--runway-rise));
padding-top: calc(var(--runway-head-pad) + var(--runway-rise));
```

La marge négative remonte la boîte, le padding redescend le contenu d'autant :
le contenu se pose donc toujours au même endroit quelle que soit la course.
Dans un slot placé à `top: var(--runway-park)` (viewport 0), ça donne une boîte
qui démarre à viewport `−rise`.

**Bande basse** (mesurée, pas encore livrée sur Review) :

```css
/* slot */  position: absolute; bottom: 0; left: 0; right: 0; z-index: 20;
/* bande */ padding-bottom: calc(<pad> + var(--runway-bleed));
            /* PAS de margin-bottom négative */
```

> **Le piège :** la marge négative de `.runway-foot` existe pour *annuler* le
> padding dans le flux, afin que la page ne grandisse pas. Ancrée, il n'y a rien
> à annuler — et une marge basse négative sur une boîte calée par `bottom: 0` la
> pousserait hors de l'écran. **Padding seul.**

### 3.4 Les nombres mesurés

Viewport de mise en page simulé à 655 px, barre d'état 59, barre d'outils 98,
coordonnées locales au conteneur (indépendantes du park).

| | Barre haute | Barre basse |
|---|---|---|
| Boîte | −544 → 149 | 710 → 1391 |
| Repos du contenu | 108 | 739 |
| Marge par rapport à la barre système | **12 px** | **12 px** |
| Verre au-delà du bord d'écran | **581 px** | **542 px** |
| Immobile au défilement du contenu | ✅ | ✅ |
| Ajout à la course de défilement | **0** | **0** |

Course de défilement identique dans tous les cas (1584) : les slots sont
`absolute`, hors du conteneur de défilement, donc invisibles pour lui.

### 3.5 L'espaceur

Hors du flux, la hauteur des barres doit être rendue à la page. **Mesurer, ne
pas deviner** : la boîte d'une bande contient aussi la course (640 px) qui porte
son verre, qui n'est pas de la place à réserver.

Sur Review : `barRef.offsetHeight − rise` → `693 − 640 = 53`, republié dans
`--runway-bar-h` par un `ResizeObserver`. **Transfer a déjà exactement cet
idiome** pour son footer (`Footer.tsx:118-134` publie `--footer-height`), donc
le pattern est familier — mais attention, `offsetHeight` inclura désormais la
course : il faut la soustraire.

### 3.6 La seconde moitié, souvent oubliée

Review échantillonne la photo active dans un canvas 8×8 et écrit la moyenne
assombrie sur `document.documentElement.style.backgroundColor`. Raison : dès que
le document quitte son park — rubber-band, clavier, verrou de scroll d'une
modale — Safari repeint les bandes avec **la couleur du document**. Sans ce
repli, chaque sortie du park redonne une bande noire.

Chez Transfer les stills sont **same-origin**, donc le canvas ne peut pas être
tainted : plus simple à porter qu'ici.

---

## 4. Ce qu'est Transfer, et ce que la conversion coûte

### 4.1 Le conteneur de défilement, c'est le DOCUMENT

Aucun conteneur de défilement interne. Pas d'`overflow: hidden` sur `html`/
`body`. Pas d'`AppShell` (seulement en admin, `AdminLayout.tsx:30`). Seule règle
globale : `overscrollBehaviorY: "none"` (`styles/global.style.tsx:23-25`).

### 4.2 La page publique est calibrée à 100dvh… mais elle défile

`SplitTransferLayout.tsx:138` compose une somme fermée :
`60 (padding) + 40 (spacer) + bande + var(--footer-height) + var(--cookie-notice-clearance) = 100dvh`.
Au repos, rien ne défile.

**Mais** `SplitTransferLayout.tsx:202-206` donne à `.card` en mobile
`{ height: "auto", maxHeight: "none" }`, et son commentaire (`:198-201`) le dit :
*« the whole page scrolls here instead of the card scrolling internally »*. Aucun
plafond ailleurs pour absorber ça (les seuls `maxHeight` du frontend :
`AuthGlassLayout:119,141`, `SplitTransferLayout:173,204`, `AdminNavBar:82` ;
`FileList` et `TransferCard` n'en ont aucun).

> **Dès que l'utilisateur sélectionne des fichiers, le DOCUMENT défile.** Le
> conteneur de défilement interne est donc **obligatoire** : convertir seulement
> les barres ne suffit pas.

### 4.3 Les barres sont réellement statiques

- **Navbar** — `Header.tsx:58-63` : `fixed; top/left/right: 0; z-index: 100`,
  hauteur constante 60 (`HEADER_HEIGHT`, `:29`), `blur(18px) saturate(160%)`.
  **Ne bouge jamais** : aucun listener de scroll dans tout le frontend.
- **Footer** — `Footer.tsx:163-171` : Mantine `<Footer fixed>`, même verre.
  Position immuable, **hauteur variable** : un `ResizeObserver` publie
  `--footer-height` (`:118-134`), lue par cinq autres boîtes.

Les deux convertissent donc sans différence visible.

### 4.4 Les sommes fermées à re-dériver

C'est le vrai travail d'adaptation. Quatre termes, documentés comme
interdépendants dans leurs propres commentaires :
`SplitTransferLayout.tsx:109-138` et `AuthGlassLayout.tsx:99`.

Avec les barres ancrées hors du conteneur, la « bande visible » n'est plus
`100dvh − 60 − 40 − footer − notice` mais la hauteur de contenu du
`.runway-page`, qui vaut déjà `100dvh` moins ses paddings. **Les paddings
remplacent la soustraction** — c'est une simplification, pas une complication,
mais il faut la faire explicitement et re-vérifier `MOBILE_MENU_SPACER_HEIGHT`
et les deux `transform: translateY(-20px)` qui en dépendent.

### 4.5 Le shell

- Un seul `_app.tsx` enveloppe les 25 routes non-admin (`:252-312`), deux
  branches. Un wrapper s'insère en un seul point.
- **Aucun fichier CSS dans le repo.** Tout est emotion via le cache Mantine
  (`key: "mantine", prepend: true`). Deux précédents d'injection de CSS brut
  existent (`liquidGlassKeyframes.tsx`, `AdminLayout.tsx:52`) mais **aucun n'est
  monté dans `_app`** — le runway devra créer son point de montage.
- **Viewport meta** (`_app.tsx:204-207`) :
  `"minimum-scale=1, initial-scale=1, width=device-width"`. `viewport-fit=cover`
  **absent**, et c'est une balise *globale* aux 29 routes.
- Thème forcé en dark au runtime (`_app.tsx:142-147`), mais ~7 fichiers gardent
  des branches `colorScheme === "dark" ? … : …` vivantes.

### 4.6 Portée

29 routes, **15 affichent la photographie** via trois wrappers montant le même
BrandPanel : `SplitTransferLayout` (3), `AuthGlassLayout` (9),
`GlassPageBackdrop` (5). L'admin est un monde séparé (pas de photo, pas de
`--footer-height`, `AppShell`) — le laisser tranquille.

---

## 5. Les huit pièges (vérifiés, pas supposés)

1. **Le verrou de scroll des modales Mantine détruit le park.**
   `@mantine/hooks@6.0.21` `getLockStyles` injecte
   `body { touch-action: none; overflow: hidden !important; position: relative !important }`.
   `useScrollLock` capture `scrollTop.current = window.scrollY` dans `lockScroll`
   mais **ne le relit jamais** dans `unlockScroll` — la restauration est du code
   mort. 29 points d'appel, dont `showCompletedUploadModal` à la fin de **chaque**
   upload réussi (`UploadPage.tsx:713-721`), et surtout `/share/[shareId]` où une
   modale de mot de passe **non-fermable** reste ouverte tout l'écran.
   *Options : `lockScroll={false}` sur les modales publiques, re-park dans un hook
   de déverrouillage, ou accepter la bande le temps de la modale.*

2. **Le routeur Pages de Next scrolle la mauvaise chose.**
   `Link` / `router.push` font `window.scrollTo(0, 0)` à chaque navigation client
   (`scroll: true` par défaut ; aucun `scroll={false}`, aucun `scrollRestoration`
   dans le repo). Le park saute à chaque clic **et** le conteneur interne n'est
   jamais remis en haut. Les barres sont pleines de `Link`.

3. **Le menu mobile est portalisé sur `document.body`** (`Header.tsx:600-656`),
   donc il échappe à tout wrapper inséré dans `_app` et continuera à résoudre son
   `top: 60` contre le viewport de mise en page. Le déplacer dans le runway, ou
   corriger son `top` du park.

4. **Transfer est une vraie PWA installable** (`next-pwa` actif hors dev,
   `manifest.json`, `"display": "standalone"`). En standalone il n'y a **pas de
   barres**, mais `-webkit-touch-callout` et `pointer: coarse` matchent toujours.
   Prévoir `@media (display-mode: standalone)` pour désactiver le runway.

5. **Décalage entre les deux portes.** Review gate sur la *capacité* ; toute la
   mise en page mobile de Transfer gate sur la *largeur*
   (`theme.fn.smallerThan("sm")`, `mantine.style.ts` ne surcharge pas les
   breakpoints → `sm` = 768 px). Un **iPhone en paysage** (852-874 px) et **tout
   iPad** activeraient le runway avec la branche de mise en page *desktop*.

6. **`viewport-fit=cover` est une balise globale** (`_app.tsx:204-207`) :
   l'ajouter touche les 29 routes, dans une app qui n'a **aucun** padding
   safe-area. Soit par route comme Review, soit ajouter les paddings partout.

7. **`@media print`** : `/terms`, `/privacy`, `/imprint` rendent du Markdown de
   longueur non bornée à travers le même shell. Sans bloc d'annulation, ils
   s'impriment sur **une seule feuille** (WebKit n'imprime que la tranche visible
   d'une boîte `overflow` à hauteur fixe). Review a dû l'ajouter.

8. **Clavier et focus.** Le park de Review se met entièrement en retrait tant
   qu'un champ de saisie a le focus (`isTypingTarget` → `return`), parce que
   Safari scrolle le document pour soulever le champ ; et il re-park sur
   `focusout` **différé d'un tour**, sinon passer d'un champ à l'autre fait
   sauter le formulaire. Transfer a des formulaires partout.

Deux de plus, spécifiques aux barres ancrées :

9. **Le conteneur de défilement a besoin de `scroll-padding`** égal aux
   insets, sinon tout ce que le navigateur révèle tout seul — tabulation,
   `scrollIntoView`, ancres, VoiceOver, recherche dans la page — atterrit
   derrière une barre.

10. **Le tap sur la barre d'état pour remonter est mort** : il agit sur la frame
    principale, qui est garée. Review le renvoie au conteneur interne en
    détectant un départ vers le haut avant de re-garer.

---

## 6. Ce qui n'est PAS un risque (pour ne pas y perdre une session)

- **Les dropdowns portalisés de Mantine suivent déjà un conteneur interne.**
  Popover (donc Menu, Select, Tooltip) passe par `useFloatingAutoUpdate` →
  `autoUpdate` de floating-ui, dont `ancestorScroll: true` attache un listener à
  chaque ancêtre scrollable. `ActionAvatar`, `NavbarShareMenu` et la barre de
  langue fonctionneront sans rien faire.

- **La sensibilité à la hauteur du document est *inversée*, pas héritée.**
  `Header.tsx:176-195` raconte qu'un changement de hauteur en haut du document
  « perturbait visiblement la position de scroll ». Avec le runway, `.runway` a
  une hauteur **constante**, indépendante du contenu : le problème disparaît.

- **`html { overscroll-behavior-y: none }` existe déjà**
  (`global.style.tsx:23-25`), ajouté précisément parce que la photo `fixed` ne
  suit pas le rubber-band. Une fois la photo dé-fixée, **cette règle devient
  probablement inutile** — elle coûte le pull-to-refresh sur toute l'app. (Review
  a scopé son équivalent en `html:has(.runway)`.) Ce qu'il faut en revanche :
  `overscroll-behavior: contain` **sur le nouveau conteneur interne**.

---

## 7. Ordre de travail suggéré

1. **`.panel` d'abord** (§1). `fixed` → `absolute` dans le runway. C'est ce qui
   supprime la bande. Vérifier sur l'appareil **avant** de toucher aux barres.
2. Le runway lui-même dans `_app.tsx` : `.runway` + backdrop + conteneur interne,
   avec les barres encore `fixed`. Re-dériver les sommes fermées (§4.4).
3. Ancrer la navbar (slot haut + `runway-head`).
4. Ancrer le footer (slot bas, **padding seul, pas de marge négative** — §3.3).
5. La teinte du fond de document (§3.6).
6. Les pièges §5 un par un, chacun vérifié sur l'appareil.
7. `GlassPageBackdrop` et `AuthGlassLayout` en dernier.

---

## 8. Méthode de vérification (celle qui a marché)

Rien de tout ça ne se reproduit sur un Mac.

1. **Mesurer en coordonnées du conteneur**, pas du viewport — c'est indépendant
   de l'endroit où le document est garé, donc vérifiable dans un navigateur de
   bureau en simulant la géométrie iOS (injecter les règles du bloc `@supports`
   comme règles ordinaires, avec le viewport en px fixe).
2. **Toujours faire un contrôle règle-désactivée** : mesurer la même chose avec
   la correction neutralisée, pour prouver qu'on corrige ce qu'on croit.
3. **Vérifier que la course de défilement ne bouge pas** après chaque changement
   de géométrie : `scrollHeight − clientHeight` avant/après. Une boîte qui
   déborde son parent **vers le bas** allonge la zone défilable, marge négative
   ou pas — ça a coûté 655 px de faux défilement sur Review avant d'être mesuré.
   Vers le haut, c'est gratuit (l'origine du défilement est le sommet).
4. **Faire tester sur l'appareil par Majid** à chaque étape. Les quatre premières
   hypothèses de Review étaient fausses et seul le téléphone l'a dit.

---

## 9. Questions ouvertes pour Majid

La question d'architecture est **tranchée** : barres ancrées, navbar et footer.
Restent :

1. Quelles routes : les 12 routes « une carte » seulement, ou toute la branche
   par défaut de `_app` (ce qui embarque les 5 pages `GlassPageBackdrop` à
   défilement long et les 3 pages légales) ?
2. Que fait-on du verrou de scroll des modales, en particulier de la modale de
   mot de passe non-fermable de `/share/[shareId]` (§5.1) ?
3. `viewport-fit=cover` en global ou par route (§5.6) ?
4. Le runway est-il désactivé dans la PWA installée (§5.4) ?
5. Que fait-on sur iPhone en paysage et sur iPad, où les deux portes divergent
   (§5.5) ?
