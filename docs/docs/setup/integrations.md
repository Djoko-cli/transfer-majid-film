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

1. Add the ClamAV container to the Docker Compose stack and start the container. `transfer` and `clamav` need to share an actual Compose-managed network — only those run the embedded DNS server that resolves the `clamav` hostname below to that container; if `transfer` has `network_mode: bridge` (or any other explicit `network_mode`), it's opted out of that entirely and can never reach `clamav` by name, no matter how long ClamAV itself takes to start. The `networks:` block below is one way to get that DNS back without inheriting Compose's own auto-generated `<project>_default` network name — pin whatever name you'd rather see in `docker network ls` instead. The volume matters too: without it, every container restart re-downloads the entire virus database from scratch (several hundred MB) instead of just the day's diff, and `transfer` will correctly report ClamAV as unreachable for as long as that download is still in progress.

```diff
services:
  transfer:
    image: ghcr.io/djoko-cli/transfer-majid-film:latest
    ...
+   networks:
+     - transfer
+   depends_on:
+     clamav:
+       condition: service_healthy

+  clamav:
+    restart: unless-stopped
+    image: clamav/clamav
+    networks:
+      - transfer
+    volumes:
+      - ./clamav-db:/var/lib/clamav

+networks:
+  transfer:
+    name: transfer
+    driver: bridge
```

2. Docker will wait for ClamAV to report healthy before starting Transfer — up to 6 minutes on a first boot (the image's own built-in healthcheck grace period, to cover the initial full database download); a few seconds on every boot after, once the volume above has a database on it already.
3. The Transfer logs should now log "ClamAV is active and connected". If they instead say "ClamAV is not active or unreachable" once that window has passed, check `docker compose logs clamav` for what freshclam is doing — a NAS firewall or restricted outbound internet access blocking ClamAV's update mirrors will keep it stuck in that same "still downloading" state indefinitely.

### Stand-Alone

Also the right path if you already run ClamAV for something else (a Synology package's own bundled antivirus, for example) and don't want a second instance.

1. Install ClamAV, or confirm the existing instance is reachable: `clamdscan` needs `clamd` listening on an actual TCP port, not only a Unix socket restricted to whatever else already uses it — check its config (commonly `clamd.conf`, `TCPSocket`/`TCPAddr` directives) or ask whatever manages it.
2. Specify the `CLAMAV_HOST` (and `CLAMAV_PORT` if not the default `3310`) environment variable for the backend and restart the Transfer backend. Skip the `clamav`/`networks` blocks above entirely — nothing here needs them if `transfer` is reaching an instance outside this Compose stack.

Sharing an instance also already running other, unrelated work is a real tradeoff, not just a config question: a burst of large-file scans from Transfer can slow down whatever else depends on that same `clamd`'s CPU/memory, and if that other thing's own lifecycle restarts or reconfigures it outside your control, Transfer's scanning goes down with no direct link back to why.
