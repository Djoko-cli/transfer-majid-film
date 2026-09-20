<div align="center">
  <img src="frontend/public/img/logo.png" width="72"/>

  <h1>Transfer</h1>

  <p><strong>Partage de fichiers auto-hébergé façon WeTransfer — envoyez de gros fichiers via un lien, sans compte.</strong></p>

  <p><em><a href="README.en.md">Read this in English</a></em></p>
</div>

---

## De quoi s'agit-il

Transfer est un service de transfert de fichiers auto-hébergé : on dépose des fichiers, on obtient un lien, on définit une expiration, et c'est fait. Les expéditeurs anonymes sont vérifiés par un code à usage unique envoyé par e-mail avant tout envoi, ce qui permet de laisser la zone de dépôt grande ouverte sur la page d'accueil sans qu'elle ne devienne un relais à spam.

Ce projet est né comme un fork de [pingvin-share-x](https://github.com/smp46/pingvin-share-x), lui-même un fork de [Pingvin Share](https://github.com/stonith404/pingvin-share) — le système d'authentification, le panneau d'administration et le backend NestJS/Prisma descendent tous de ce projet, et il reste sous la licence originale BSD-2-Clause de Pingvin Share (voir [`LICENSE`](LICENSE)). Depuis ce fork, le frontend a été entièrement reconstruit autour d'une page d'accueil/upload unique (pas de site vitrine séparé), d'un design visuel « liquid glass » appliqué à toute l'application (authentification, compte, admin), et de quelques fonctionnalités backend (vérification par e-mail des envois anonymes, une permission « partages permanents » par utilisateur, le français comme langue par défaut) absentes du projet d'origine. Il est maintenu comme une instance personnelle auto-hébergée plutôt que comme un projet public généraliste — le README, la documentation et le processus de contribution reflètent ce choix.

## Fonctionnalités

- **Partage anonyme sans friction** — déposez des fichiers directement depuis la page d'accueil, sans inscription. Un code à usage unique envoyé par e-mail (via SMTP) vérifie les expéditeurs anonymes avant la création du transfert ; désactivable par instance.
- **Comptes, si vous le souhaitez** — les utilisateurs enregistrés sautent l'étape du code e-mail, disposent d'un historique de transferts, de liens de partage inversé (un lien « déposez vos fichiers ici » partageable qui permet à quelqu'un d'autre de *vous* envoyer des fichiers), et de plafonds de taille et d'expiration plus élevés ou illimités.
- **Liens expirants et sécurisés** — protection par mot de passe, limite du nombre de visites, lien court personnalisé, et fenêtre d'expiration plafonnée par instance (avec une option « partage permanent » accordable par un admin, utilisateur par utilisateur).
- **Envoi par e-mail** — envoyez optionnellement le lien du partage directement par e-mail à un ou plusieurs destinataires, avec une notification de téléchargement renvoyée à l'expéditeur.
- **Authentification** — comptes locaux, double authentification TOTP, LDAP, et OAuth/OIDC (Google, GitHub, Microsoft, Discord, ou tout fournisseur OIDC conforme via un connecteur générique).
- **Stockage** — disque local ou stockage objet compatible S3, avec analyse antivirus ClamAV optionnelle des envois.
- **Panneau d'administration** — gestion des utilisateurs et des transferts, et tous les réglages ci-dessus configurables depuis l'interface (ou via `config.yaml`/variables d'environnement — voir [`config.example.yaml`](config.example.yaml) pour la référence complète).
- **i18n** — français et anglais ; le jeu de traductions plus large hérité du projet d'origine a été retiré (voir [`locales.ts`](frontend/src/i18n/locales.ts)) plutôt que laissé à l'abandon sans maintenance.

## Installation

Chaque release construit et publie une image versionnée sur `ghcr.io/djoko-cli/transfer-majid-film` (un paquet privé — voir les [Releases](https://github.com/Djoko-cli/transfer-majid-film/releases) pour le changelog complet par version). `docker-compose.yml` récupère `:latest` par défaut :

1. Clonez ce dépôt.
2. `docker login ghcr.io` avec un token ayant accès aux paquets de ce dépôt.
3. Adaptez `docker-compose.yml` à votre configuration (ports, volumes, `TRUST_PROXY`), puis lancez :
   ```bash
   docker compose pull && docker compose up -d
   ```

Pour builder depuis les sources plutôt que de récupérer l'image (par exemple pour des modifications locales), utilisez `docker-compose.local.yml` :

```bash
docker compose -f docker-compose.local.yml up -d --build
```

L'application écoute sur le port mappé dans le fichier compose utilisé. Il n'y a pas de compte admin par défaut : le premier utilisateur à s'inscrire (`/auth/signUp`) devient automatiquement administrateur. Pour préprovisionner un admin à l'avance (par exemple pour un déploiement automatisé), définissez `initUser` dans `config.yaml` avant le premier démarrage — voir `config.example.yaml`.

Pour scanner les envois avec ClamAV, voir `docker-compose.dev.yml` pour un service ClamAV à ajouter à côté de l'application.

### Configuration

Tout ce qui se trouve dans `config.example.yaml` (général, apparence, limites de partage, vérification par e-mail, cache, SMTP, LDAP, OAuth, S3, pages légales, utilisateur admin initial) peut être défini de deux façons :

- **Depuis le panneau d'administration** (`/admin`) — le mode par défaut ; les valeurs sont stockées en base de données et prennent effet immédiatement.
- **Via `config.yaml`** — copiez `config.example.yaml`, modifiez-le, et montez-le dans le conteneur (voir la ligne de volume commentée dans les fichiers compose). Utile pour provisionner une nouvelle instance sans passer par l'interface.

### Développement local

```bash
# backend
cd backend
npm install
npx prisma db push
npx prisma db seed
npm run dev

# frontend (terminal séparé, une fois le backend lancé)
cd frontend
npm install
npm run dev
```

## Stack technique

- **Frontend** — Next.js (Pages Router), Mantine UI, TypeScript.
- **Backend** — NestJS, Prisma, SQLite par défaut.
- **Déploiement** — image Docker unique (build multi-étapes), exemples de reverse-proxy dans [`reverse-proxy/`](reverse-proxy).

## Licence

BSD 2-Clause, héritée de [Pingvin Share](https://github.com/stonith404/pingvin-share), dont le fichier [`LICENSE`](LICENSE) est conservé tel quel — copyright Elias Schneider, 2022.

La filiation est à deux étages et mérite d'être dite en entier : ce dépôt part de [pingvin-share-x](https://github.com/smp46/pingvin-share-x) (209 commits de smp46), qui part lui-même de [Pingvin Share](https://github.com/stonith404/pingvin-share) (762 commits d'Elias Schneider, plus ceux de ses contributeurs). La divergence avec pingvin-share-x date du 15 août 2026.
