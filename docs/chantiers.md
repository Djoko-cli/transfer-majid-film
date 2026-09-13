# Chantiers en attente

Ce qui a été étudié, chiffré, et délibérément pas fait. Chaque entrée porte
ses mesures pour que la décision puisse être reprise sans refaire l'enquête.

---

## 1. Sortir de Next.js 14 (sécurité)

**Pourquoi :** `14.2.35` est la **dernière 14.x jamais publiée**. La branche
est figée — plus aucun correctif de sécurité n'arrivera. Ce n'est pas un
retard de version, c'est une sortie de support.

**Ce qui menace réellement cette app**, après tri des 24 avis contre la
configuration réelle plutôt que contre la plage de versions :

| Famille d'avis | Verdict |
|---|---|
| RCE critique via l'optimiseur d'images (AVIF) | **hors sujet** — `images: { unoptimized: true }` |
| RCE critique sur serveurs Windows | **hors sujet** — déploiement Linux/Docker |
| ~10 avis App Router / Server Components / Server Actions | **hors sujet** — pas de dossier `app/`, Pages Router seul |
| Contournement de middleware en Pages Router *avec i18n* | **hors sujet** — i18n en userland (react-intl), pas le routage natif |
| SSRF et smuggling via `rewrites` | **hors sujet** — aucun `rewrites()`, seulement des `redirects()` |
| XSS `beforeInteractive`, SSRF WebSocket | **hors sujet** — non utilisés |
| Empoisonnement de cache sur redirections de middleware (low) | **plausible** |
| Confusion de cache sur corps de réponse (moderate ×2) | **plausible** |

Autrement dit : les deux critiques ne mordent pas ici, mais la dette
s'accumule sur une branche qui ne sera plus jamais corrigée.

**Le chantier est plus petit qu'il n'y paraît :** Next 16 déclare
`react: ^18.2.0 || ^19.0.0`. La montée de Next **n'oblige donc pas** à
toucher React ni Mantine.

**Le vrai obstacle est `next-pwa`** — dernière publication **août 2022**,
abandonné, et il enveloppe toute la configuration
(`module.exports = withPWA({...})`). C'est lui qui cassera, pas Next.

À noter : sa configuration actuelle est `runtimeCaching: NetworkOnly` sur
tout, c'est-à-dire un service worker qui ne met rien en cache. Il ne rend
aujourd'hui aucun service.

**Marche à suivre proposée :**

1. Monter en **15.5.24** d'abord (dernier correctif de la branche 15) plutôt
   que directement en 16 : ça ferme la quasi-totalité des avis pour un seul
   saut majeur au lieu de deux.
2. Trancher le sort de `next-pwa` au passage — le retirer (il ne cache rien)
   ou le remplacer par `@serwist/next`, son successeur maintenu. Le retirer
   est probablement la bonne réponse et simplifie le reste.
3. Tester sur la pile de dev, jamais directement en production.

---

## 2. Mantine 6 → 8 (facultatif, gros)

**Ce n'est pas nécessaire** : rien ne force cette montée, Mantine 6 n'a pas
d'avis de sécurité connu ici. À faire seulement pour sortir d'une version
qui ne recevra plus de composants ni de correctifs.

**Surface mesurée** — 108 fichiers `.tsx` dans `src/`, dont **101 importent
Mantine** :

| Ce qu'il faut toucher | Occurrences | Nature |
|---|---|---|
| `spacing=` → `gap=` | 61 | mécanique |
| `position=` → `justify=` | 50 | mécanique |
| `color="dimmed"` → `c=` | 51 | mécanique |
| `theme.fn.smallerThan` / `largerThan` | 35 | mécanique |
| `weight=` → `fw=` | 20 | mécanique |
| `styles={...}` | 18 | clés renommées, à vérifier composant par composant |
| `withinPortal` | 6 | défaut changé |
| `theme.fn.variant` / `rgba` | 5 | à traiter à la main |

Soit **~217 sites mécaniques** et une trentaine qui demandent réflexion.

**La bonne nouvelle :** `@mantine/emotion` (paquet officiel) **restaure
`createStyles` et la prop `sx`** — vérifié dans ses exports
(`create-styles`, `merge-sx`, `emotion-transform`). Les **53 `createStyles`**
et **47 `sx`** de ce dépôt survivent donc sans réécriture.

**Le vrai risque n'est pas le compilateur, c'est la mise en page.** Chacun de
ces 217 sites peut déplacer silencieusement quelque chose, et ce dépôt porte
beaucoup de géométrie mesurée à la main : le runway, l'arithmétique de
`MOBILE_BAND`, les hauteurs nominales de cartes, tout le système de verre.
Un `tsc` vert ne prouverait rien. Il faudrait une passe de vérification
visuelle complète, sur Simulateur iOS compris.

**Mantine 8 accepte React 18** (`^18.x || ^19.x`) — cette montée est donc
indépendante de React. Seul **Mantine 9 impose React 19** (`^19.2.0`).

---

## 3. React 18 → 19 (à ne pas envisager seul)

**React 19 n'est pas une décision indépendante.** Il entraîne les deux
chantiers ci-dessus avec lui :

- `next@14.2.35` déclare `react: ^18.2.0` → **impose Next 15+**
- `react-intl@6.8.9` déclare `^16.6.0 || 17 || 18` → **exclut React 19**, doit
  monter aussi
- Mantine 6 l'autorise nominalement (`>=16.8.0`) mais lui est antérieur —
  en pratique il faudrait Mantine 7 ou 8

**Conclusion :** faire React 19 revient à faire les chantiers 1, 2 **et** la
montée de `react-intl` en une seule fois. Pour un bénéfice quasi nul sur une
app Pages Router qui n'utilise ni Server Components, ni Server Actions, ni
`use()`, ni les Actions de formulaire.

**À faire seulement si** Mantine 9 devient nécessaire, ou si une dépendance
finit par exiger React 19. Pas avant.

---

## 4. Actions GitHub sur Node.js déprécié — **fait**

Réglé le 2026-09-13 dans `2b890d3`. Conservé ici pour mémoire du procédé :
lire les notes de chaque majeure avant de bumper plutôt que de supposer, et
vérifier après coup que l'avertissement a bien disparu des runs.
