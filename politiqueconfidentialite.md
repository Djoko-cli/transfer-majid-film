*Dernière mise à jour : 31 août 2026*

## Qui est responsable de vos données ?

Majid Rivière, éditeur de transfer.majid.film (voir les [mentions légales](/imprint)), adresse postale de l'éditeur — à renseigner depuis la console d'administration. Pour toute question ou pour exercer vos droits, contactez [transfer@majid.film](mailto:transfer@majid.film).

## Quelles données sont collectées ?

**Si vous créez un compte**
- Nom d'utilisateur et adresse e-mail
- Mot de passe, stocké sous forme hachée (jamais en clair)
- Si vous activez la double authentification (TOTP) : un secret cryptographique, indépendant de votre mot de passe
- Si vous vous connectez par clé d'accès (passkey) via Pocket ID : cette authentification est gérée par une instance Pocket ID également auto-hébergée par l'éditeur

**Quand vous créez un partage**
- Les fichiers envoyés, et leur contenu — qui peut lui-même comporter des données personnelles selon ce que vous choisissez de partager ; vous en restez seul responsable
- Le nom et la description du partage, si vous les renseignez
- Les adresses e-mail des destinataires, si vous partagez par e-mail plutôt que par lien
- Votre propre adresse e-mail, si vous envoyez un partage sans être connecté et que vous la renseignez, pour vous transmettre le lien

**Cookies déposés**

| Cookie | Rôle | Durée |
|---|---|---|
| `access_token` | Vous garde connecté | 3 mois |
| `refresh_token` | Renouvelle votre connexion | Durée de session configurée (3 mois par défaut) |
| `trusted_device` | Évite de redemander un code de double authentification sur un appareil reconnu | 30 jours |
| `anon_share_token` | Le temps de vérifier votre e-mail avant un envoi anonyme | Session (jeton valable 4 h) |
| `share_<id>_token` | Retient l'accès à un partage protégé par mot de passe | Session |
| `oauth_<fournisseur>_state` | Sécurise la connexion via un fournisseur externe (anti-CSRF) | Session |
| `language` | Retient votre langue préférée | 1 an |
| `mantine-color-scheme` | Thème d'affichage | Session |
| `reverse-share.public-access` | Retient un réglage lors de la création d'un lien de dépôt (réservé aux administrateurs) | Session |
| `reverse_share_token` | Identifie le lien de dépôt utilisé pendant votre envoi | Session |

Aucun de ces cookies n'est utilisé à des fins publicitaires ou de mesure d'audience — transfer.majid.film n'intègre aucun outil d'analyse ou de suivi tiers. Ce sont des cookies strictement nécessaires au fonctionnement du service ou liés à vos préférences, ce qui ne nécessite pas de bandeau de consentement au sens de la réglementation applicable (recommandations de la CNIL).

## Pourquoi ces données sont-elles traitées ?

- Fournir le service : créer votre compte, transmettre vos partages aux bonnes personnes
- Sécuriser votre compte (double authentification, appareils de confiance)
- Vous envoyer les e-mails liés à votre usage du service : lien de partage, notifications de téléchargement ou d'expiration si elles sont activées, réinitialisation de mot de passe
- Détecter les fichiers malveillants avant de conserver un partage (analyse antivirus)

## Sur quelle base légale ?

L'exécution du service que vous demandez (créer un compte, envoyer ou recevoir un partage), pour l'essentiel de ces traitements ; l'intérêt légitime de l'éditeur pour la sécurité (analyse antivirus, protection des comptes).

## À qui ces données sont-elles transmises ?

- À personne à des fins commerciales ou publicitaires : ce service ne revend ni ne partage vos données à ces fins, et n'intègre aucun outil d'analyse tiers.
- Le contenu de vos partages n'est accessible qu'aux personnes disposant du lien (et, si vous l'avez défini, du mot de passe) — l'éditeur n'y accède pas dans le cadre normal du service.
- Si vous partagez par e-mail ou recevez une notification, l'envoi passe par le service d'e-mail configuré pour le domaine transfer.majid.film.
- Pocket ID, utilisé pour la connexion par clé d'accès, est une instance auto-hébergée par l'éditeur sur la même infrastructure — vos données n'en sortent donc pas.
- À ce jour, l'ensemble des fichiers et données reste stocké sur l'infrastructure personnelle de l'éditeur, sans stockage cloud tiers. Cela pourrait évoluer si un stockage compatible S3 était mis en place à l'avenir ; cette page serait alors mise à jour en conséquence.

## Combien de temps ces données sont-elles conservées ?

- Les fichiers d'un partage sont supprimés dès l'expiration de ce partage (3 jours après sa création par défaut, 30 jours maximum, selon le choix de l'expéditeur), sans délai de conservation supplémentaire.
- Un compte utilisateur est conservé tant qu'il reste actif. Vous pouvez le supprimer à tout moment depuis votre espace de compte.
- Une session de connexion dure 3 mois par défaut, sauf déconnexion manuelle.

## Vos droits

Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition sur vos données. La plupart de ces actions sont directement disponibles depuis votre espace de compte (modification du profil, suppression du compte). Pour toute autre demande, contactez [transfer@majid.film](mailto:transfer@majid.film). Vous disposez également du droit d'introduire une réclamation auprès de la CNIL ([cnil.fr](https://www.cnil.fr)).

## Sécurité

Les mots de passe sont hachés, jamais stockés en clair. Les fichiers envoyés sont analysés par un antivirus (ClamAV), lui aussi auto-hébergé. L'ensemble du service tourne sur une infrastructure personnelle, sans sous-traitant cloud à ce jour.

## Modifications de cette politique

Cette politique peut être mise à jour pour refléter une évolution du service (par exemple l'ajout d'un stockage tiers). La date de dernière mise à jour figure en haut de cette page.
