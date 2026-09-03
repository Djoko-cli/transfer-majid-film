<div align="center">
  <img src="frontend/public/img/logo.png" width="72"/>

  <h1>Transfer</h1>

  <p><strong>Self-hosted, WeTransfer-style file sharing — send large files with a link, no account required.</strong></p>

  <p><em><a href="README.md">Lire en français</a></em></p>
</div>

---

## What this is

Transfer is a self-hosted file transfer service: drop files, get a link, set an expiration, done. Anonymous senders are verified with a one-time e-mail code before anything uploads, so the drop zone can stay wide open on the landing page without turning into a spam relay.

It started as a fork of [Pingvin Share](https://github.com/stonith404/pingvin-share) — the auth system, admin panel, and NestJS/Prisma backend are all descended from that project, and it remains under Pingvin Share's original BSD-2-Clause license (see [`LICENSE`](LICENSE)). Since forking, the frontend has been rebuilt around a full landing/upload page (no separate marketing site), a "liquid glass" visual design carried through the entire app (auth, account, admin), and a handful of backend features (anonymous-upload email verification, a per-user "permanent shares" permission, French as the default locale) that don't exist upstream. It's maintained as a personal, self-hosted instance rather than a general-purpose public project — expect the README, docs, and contribution process to reflect that.

## Features

- **Frictionless anonymous sharing** — drop files straight from the landing page, no sign-up. A one-time e-mail code (sent over SMTP) verifies anonymous senders before their transfer is created; this can be turned off per instance.
- **Accounts, when you want them** — registered users skip the e-mail-code step, get a transfer history, reverse-share links (a shareable "drop files here" link that lets someone else send *you* files), and higher/unlimited size and expiration caps.
- **Expiring, secured links** — password protection, a visitor-count limit, a custom short link, and an expiration window capped per instance (with an optional "permanent share" override grantable per user by an admin).
- **E-mail delivery** — optionally e-mail the share link straight to one or more recipients, with a download notification back to the sender.
- **Authentication** — local accounts, TOTP two-factor, LDAP, and OAuth/OIDC (Google, GitHub, Microsoft, Discord, or any spec-compliant OIDC provider via a generic connector).
- **Storage** — local disk or S3-compatible object storage, with optional ClamAV scanning of uploads.
- **Admin panel** — user and transfer management, and every setting above configurable from the UI (or via `config.yaml`/environment variables — see [`config.example.yaml`](config.example.yaml) for the full reference).
- **i18n** — French and English; the wider translation set inherited from upstream was removed (see [`locales.ts`](frontend/src/i18n/locales.ts)) rather than left to go stale unmaintained.

## Setup

Each release builds and publishes a versioned image to `ghcr.io/djoko-cli/transfer-majid-film` (a private package — see [Releases](https://github.com/Djoko-cli/transfer-majid-film/releases) for the full changelog per version). `docker-compose.yml` pulls `:latest` by default:

1. Clone this repository.
2. `docker login ghcr.io` with a token that has access to this repo's packages.
3. Adjust `docker-compose.yml` for your setup (ports, volumes, `TRUST_PROXY`), then run:
   ```bash
   docker compose pull && docker compose up -d
   ```

To build from source instead of pulling (e.g. for local changes), use `docker-compose.local.yml`:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

The app listens on the port mapped in whichever compose file you used. There's no default admin account: the first user to sign up (`/auth/signUp`) is automatically made an admin. To pre-provision an admin instead (e.g. for an automated deploy), set `initUser` in `config.yaml` before first boot — see `config.example.yaml`.

To scan uploads with ClamAV, see `docker-compose.dev.yml` for a ClamAV service you can add alongside the app.

### Configuration

Everything under `config.example.yaml` (general, appearance, share limits, e-mail verification, cache, SMTP, LDAP, OAuth, S3, legal pages, initial admin user) can be set two ways:

- **From the admin panel** (`/admin`) — the default; values are stored in the database and take effect immediately.
- **Via `config.yaml`** — copy `config.example.yaml`, edit it, and mount it into the container (see the commented-out volume line in the compose files). Useful for provisioning a fresh instance without clicking through the UI.

### Local development

```bash
# backend
cd backend
npm install
npx prisma db push
npx prisma db seed
npm run dev

# frontend (separate terminal, once the backend is running)
cd frontend
npm install
npm run dev
```

## Tech stack

- **Frontend** — Next.js (Pages Router), Mantine UI, TypeScript.
- **Backend** — NestJS, Prisma, SQLite by default.
- **Deployment** — single Docker image (multi-stage build), reverse-proxy examples in [`reverse-proxy/`](reverse-proxy).

## License

BSD 2-Clause, inherited from the upstream [Pingvin Share](https://github.com/stonith404/pingvin-share) project. See [`LICENSE`](LICENSE).
