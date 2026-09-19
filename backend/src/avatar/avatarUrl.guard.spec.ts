import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicUrl,
  isPublicAddress,
  makeGuardedLookup,
  UnsafeAvatarUrlError,
} from "./avatarUrl.guard.ts";

test("accepte les adresses publiques", () => {
  const acceptees = [
    "93.184.216.34",
    "8.8.8.8",
    "172.32.0.1", // juste au-dessus de 172.16.0.0/12
    "223.255.255.255", // juste en-dessous de 224.0.0.0/4
    "100.128.0.1", // juste au-dessus de 100.64.0.0/10
    "198.20.0.1", // juste au-dessus de 198.18.0.0/15
    "2606:2800:220:1:248:1893:25c8:1946",
    "64:ff9b::808:808", // NAT64 de 8.8.8.8 : l'adresse embarquee est publique
  ];
  for (const ip of acceptees) assert.equal(isPublicAddress(ip), true, ip);
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
    "192.88.99.1", // relais 6to4 anycast
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "0::1", // ::1, ecrite autrement
    "0:0:0:0:0:0:0:1", // ::1, forme non compressee
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "fec0::1", // site-local deprecie
    "::ffff:127.0.0.1",
    "::ffff:7f00:1", // la meme, en forme hexadecimale
    "0:0:0:0:0:ffff:127.0.0.1", // la meme, forme non compressee
    "0:0:0:0:0:ffff:10.0.0.5", // v4-mappee, cible privee
    "::127.0.0.1", // ipv4-compatible depreciee
    "64:ff9b::a00:5", // NAT64 de 10.0.0.5 : l'adresse embarquee est privee
    "2001:db8::1", // documentation
    "100::1", // trou noir RFC 6666
    "2002:0a00:0001::1", // 6to4 (2002::/16) : encapsule 10.0.0.1, mais bloque en bloc, sans decodage
    "2002:c633:6401::1", // 6to4 encapsulant une adresse publique (198.51.100.1) : bloque quand meme
    "2001::1", // Teredo (2001:0000::/32)
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", // Teredo, forme non compressee
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

test("le resolveur refuse un tableau vide", (_, done) => {
  // Avec `all: true`, dns.lookup peut rendre [] sans erreur. Aucune adresse
  // non publique n'y est jointe, mais laisser passer ce resultat en silence
  // est justement le genre d'etat qu'un garde ne doit pas laisser filer.
  const lookup = makeGuardedLookup(((h: string, o: any, cb: any) => cb(null, [])) as any);
  lookup("vide.example.com", { all: true }, (err: Error | null) => {
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
