import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicUrl,
  isPublicAddress,
  makeGuardedLookup,
  UnsafeAvatarUrlError,
} from "./avatarUrl.guard.ts";

test("accepte les adresses publiques", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"])
    assert.equal(isPublicAddress(ip), true, ip);
});

test("refuse toute adresse non publique", () => {
  const refusees = [
    "0.0.0.0",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.169.254", // metadonnees cloud : la cible classique
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1", // la meme, en forme hexadecimale
  ];
  for (const ip of refusees) assert.equal(isPublicAddress(ip), false, ip);
});

test("refuse ce qui n'est pas une adresse", () => {
  for (const s of ["", "localhost", "pas-une-ip"])
    assert.equal(isPublicAddress(s), false, s);
});

test("n'accepte que https", () => {
  assert.throws(() => assertPublicUrl("http://example.com/a.png"), UnsafeAvatarUrlError);
  assert.throws(() => assertPublicUrl("file:///etc/passwd"), UnsafeAvatarUrlError);
  assert.throws(() => assertPublicUrl("data:image/png;base64,AAAA"), UnsafeAvatarUrlError);
  assert.doesNotThrow(() => assertPublicUrl("https://example.com/a.png"));
});

test("refuse les identifiants dans l'URL", () => {
  assert.throws(
    () => assertPublicUrl("https://user:motdepasse@example.com/a.png"),
    UnsafeAvatarUrlError,
  );
});

test("refuse une URL malformee", () => {
  assert.throws(() => assertPublicUrl("pas une url"), UnsafeAvatarUrlError);
});

test("le resolveur refuse un nom qui pointe vers une adresse privee", (_, done) => {
  // La reliaison DNS est exactement ce cas : le nom est irreprochable, la
  // reponse ne l'est pas. Le refus doit venir du resolveur, pas de l'URL.
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) =>
    cb(null, "127.0.0.1", 4)) as any);
  lookup("rebind.example.com", {}, (err: Error | null) => {
    assert.ok(err instanceof UnsafeAvatarUrlError, "devrait refuser");
    done();
  });
});

test("le resolveur refuse si UNE SEULE des adresses rendues est privee", (_, done) => {
  // Avec `all: true`, dns.lookup rend un tableau. En accepter un seul element
  // sans verifier les autres serait le trou evident.
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) =>
    cb(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ])) as any);
  lookup("mixte.example.com", { all: true }, (err: Error | null) => {
    assert.ok(err instanceof UnsafeAvatarUrlError, "devrait refuser");
    done();
  });
});

test("le resolveur laisse passer une adresse publique", (_, done) => {
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) =>
    cb(null, "93.184.216.34", 4)) as any);
  lookup("example.com", {}, (err: Error | null, address?: string) => {
    assert.equal(err, null);
    assert.equal(address, "93.184.216.34");
    done();
  });
});

test("refuse une adresse litterale non publique dans l'URL", () => {
  assert.throws(() => assertPublicUrl("https://127.0.0.1/a.png"), UnsafeAvatarUrlError);
  assert.throws(() => assertPublicUrl("https://[::1]/a.png"), UnsafeAvatarUrlError);
  assert.throws(
    () => assertPublicUrl("https://169.254.169.254/latest/meta-data"),
    UnsafeAvatarUrlError,
  );
});
