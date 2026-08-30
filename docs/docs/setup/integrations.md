---
id: integrations
---

# Integrations

## ClamAV

ClamAV is used to scan shares for malicious files and remove them if found.

Please note that ClamAV needs a lot of [resources](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements).

### Docker

If you are already running ClamAV elsewhere, you can specify the `CLAMAV_HOST` environment variable to point to that instance.

Else you have to add the ClamAV container to the Transfer Docker Compose stack:

1. Add the ClamAV container to the Docker Compose stack and start the container. Don't set `network_mode` on the `transfer` service (or any value other than the default) — only Compose's own auto-created network runs the DNS server that resolves the `clamav` hostname below to that container; `transfer` would never be able to reach it otherwise, no matter how long ClamAV itself takes to start. The volume matters too: without it, every container restart re-downloads the entire virus database from scratch (several hundred MB) instead of just the day's diff, and `transfer` will correctly report ClamAV as unreachable for as long as that download is still in progress.

```diff
services:
  transfer:
    image: ghcr.io/djoko-cli/transfer-majid-film:latest
    ...
+   depends_on:
+     clamav:
+       condition: service_healthy

+  clamav:
+    restart: unless-stopped
+    image: clamav/clamav
+    volumes:
+      - ./clamav-db:/var/lib/clamav

```

2. Docker will wait for ClamAV to report healthy before starting Transfer — up to 6 minutes on a first boot (the image's own built-in healthcheck grace period, to cover the initial full database download); a few seconds on every boot after, once the volume above has a database on it already.
3. The Transfer logs should now log "ClamAV is active and connected". If they instead say "ClamAV is not active or unreachable" once that window has passed, check `docker compose logs clamav` for what freshclam is doing — a NAS firewall or restricted outbound internet access blocking ClamAV's update mirrors will keep it stuck in that same "still downloading" state indefinitely.

### Stand-Alone

1. Install ClamAV
2. Specify the `CLAMAV_HOST` environment variable for the backend and restart the Transfer backend.
