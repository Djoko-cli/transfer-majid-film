import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";

// Sans dépendance NestJS, volontairement : c'est ce qui rend ce module
// exécutable tel quel par `node --test`, sans framework ni transpilation.
export class UnsafeAvatarUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// Tout ce qui n'a rien à faire au bout d'une requête sortante déclenchée par un
// tiers. 169.254/16 mérite une mention : c'est là que vivent les métadonnées
// d'instance chez tous les hébergeurs, et c'est la cible canonique d'un SSRF.
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    const value = ipv4ToInt(address);
    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }

  if (family === 6) {
    const normalised = address.toLowerCase();

    // Une IPv4 déguisée reste une IPv4 : ::ffff:127.0.0.1 et ::ffff:7f00:1
    // désignent la même boucle locale, et seule la première forme se repère à
    // l'œil. Les deux sont ramenées à leur adresse v4.
    const dotted = normalised.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPublicAddress(dotted[1]);
    const hex = normalised.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPublicAddress(
        [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
      );
    }

    if (normalised === "::" || normalised === "::1") return false;

    const head = parseInt(normalised.split(":")[0] || "0", 16);
    if ((head & 0xfe00) === 0xfc00) return false; // fc00::/7  unique local
    if ((head & 0xffc0) === 0xfe80) return false; // fe80::/10 lien local
    if ((head & 0xff00) === 0xff00) return false; // ff00::/8  multicast
    return true;
  }

  return false;
}

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeAvatarUrlError("URL malformée");
  }
  if (url.protocol !== "https:")
    throw new UnsafeAvatarUrlError(`protocole refusé : ${url.protocol}`);
  if (url.username || url.password)
    throw new UnsafeAvatarUrlError("identifiants dans l'URL");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host))
    throw new UnsafeAvatarUrlError(`adresse non publique : ${host}`);

  return url;
}

// Passé dans les options de `https.request`, ce résolveur fait la vérification
// à l'instant où la socket utilise l'adresse. C'est ce qui ferme la reliaison
// DNS : un contrôle fait sur un `lookup` séparé, puis suivi d'un `connect`,
// laisse une fenêtre où le nom résout vers une adresse publique pendant le test
// et vers 127.0.0.1 pendant la connexion.
// Fabriqué plutôt qu'écrit en dur pour que le résolveur soit remplaçable dans
// les tests : c'est ce morceau-là qui ferme la reliaison DNS, il ne peut pas
// être la seule pièce non couverte du module.
export function makeGuardedLookup(resolve: typeof dnsLookup = dnsLookup) {
  return ((
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address?: any, family?: number) => void,
) => {
  resolve(hostname, options, (err: any, address: any, family?: number) => {
    if (err) return callback(err);
    const resolved: LookupAddress[] = Array.isArray(address)
      ? address
      : [{ address, family } as LookupAddress];
    for (const entry of resolved) {
      if (!isPublicAddress(entry.address))
        return callback(
          new UnsafeAvatarUrlError(
            `${hostname} résout vers une adresse non publique : ${entry.address}`,
          ) as NodeJS.ErrnoException,
        );
    }
    callback(null, address, family);
  });
}) as any;
}

export const guardedLookup = makeGuardedLookup();
