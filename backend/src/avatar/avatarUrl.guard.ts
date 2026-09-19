import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";

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
// Aucune entrée ci-dessous n'utilise bits=0, et il ne faut pas en ajouter une
// sans revoir le calcul du masque : en JavaScript, décaler un nombre 32 bits de
// 32 ne décale pas (le décalage est pris modulo 32), donc `0xffffffff << 32`
// vaut `0xffffffff` — un masque plein, pas vide.
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24], // relais 6to4 anycast (RFC 3068)
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

// Déplie une adresse IPv6 déjà validée par `net.isIP` en 8 groupes de 16 bits,
// ou `null` si la forme n'est pas exploitable. La classification qui suit
// travaille sur ces groupes, jamais sur le texte : une même adresse a
// plusieurs écritures valides (`::1`, `0::1`, `0:0:0:0:0:0:0:1`), et seule la
// valeur binaire est fiable pour tester un préfixe.
function expandIpv6(address: string): number[] | null {
  let addr = address.toLowerCase();

  // Une IPv4 littérale ne peut apparaître qu'en toute fin d'adresse (après le
  // dernier ':'), et représente les 32 derniers bits — deux groupes de 16
  // bits à calculer, pas un texte à comparer à part.
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".");
    if (octets.length !== 4) return null;
    const bytes = octets.map(Number);
    if (bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) return null;
    const high = ((bytes[0] << 8) | bytes[1]).toString(16);
    const low = ((bytes[2] << 8) | bytes[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const sides = addr.split("::");
  if (sides.length > 2) return null; // "::" ne peut compresser qu'une seule fois

  const head = sides[0] === "" ? [] : sides[0].split(":");
  const tail8 = sides.length === 2 ? (sides[1] === "" ? [] : sides[1].split(":")) : null;

  let groups: string[];
  if (tail8 === null) {
    groups = head; // pas de "::" : les 8 groupes doivent être écrits explicitement
  } else {
    const missing = 8 - head.length - tail8.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail8];
  }
  if (groups.length !== 8) return null;

  const values = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return values.some((v) => Number.isNaN(v)) ? null : values;
}

// Compare les `bits` premiers bits de deux adresses dépliées en groupes de 16
// bits. `bits` tombe souvent au milieu d'un groupe (7, 10) : seule la portion
// utile de ce groupe-là est masquée.
function matchesIpv6Prefix(groups: number[], prefix: number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; i < prefix.length && remaining > 0; i++) {
    const width = Math.min(16, remaining);
    const mask = width === 16 ? 0xffff : (0xffff << (16 - width)) & 0xffff;
    if ((groups[i] & mask) !== (prefix[i] & mask)) return false;
    remaining -= width;
  }
  return true;
}

type BlockedV6Prefix = {
  prefix: number[];
  bits: number;
  // Les deux derniers groupes portent une IPv4 embarquée : plutôt que de
  // refuser tout le préfixe en bloc, on ramène ces 32 bits en adresse v4 et on
  // rejoue la même décision sur elle. Le NAT64 d'une IPv4 publique doit
  // passer ; celui d'une IPv4 privée, non — un refus sec des deux confondrait
  // le transport et la destination.
  delegateToIpv4?: boolean;
};

const BLOCKED_V6: BlockedV6Prefix[] = [
  { prefix: [0, 0, 0, 0, 0, 0, 0, 0], bits: 96 }, // ::/96 : non spécifiée, boucle locale, IPv4-compatible dépréciée
  { prefix: [0xfc00, 0, 0, 0, 0, 0, 0, 0], bits: 7 }, // fc00::/7 unique local
  { prefix: [0xfe80, 0, 0, 0, 0, 0, 0, 0], bits: 10 }, // fe80::/10 lien local
  { prefix: [0xfec0, 0, 0, 0, 0, 0, 0, 0], bits: 10 }, // fec0::/10 site-local déprécié
  { prefix: [0xff00, 0, 0, 0, 0, 0, 0, 0], bits: 8 }, // ff00::/8 multicast
  { prefix: [0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], bits: 32 }, // 2001:db8::/32 documentation
  { prefix: [0x0100, 0, 0, 0, 0, 0, 0, 0], bits: 64 }, // 100::/64 trou noir (RFC 6666)
  { prefix: [0, 0, 0, 0, 0, 0xffff, 0, 0], bits: 96, delegateToIpv4: true }, // ::ffff:0:0/96 v4-mappée
  { prefix: [0x0064, 0xff9b, 0, 0, 0, 0, 0, 0], bits: 96, delegateToIpv4: true }, // 64:ff9b::/96 NAT64 (RFC 6052)
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
    const groups = expandIpv6(address);
    if (!groups) return false; // illisible malgré isIP : on refuse par prudence

    for (const rule of BLOCKED_V6) {
      if (!matchesIpv6Prefix(groups, rule.prefix, rule.bits)) continue;
      if (!rule.delegateToIpv4) return false;

      // Les deux derniers groupes (32 bits) portent l'IPv4 embarquée.
      const embedded = [
        groups[6] >> 8,
        groups[6] & 0xff,
        groups[7] >> 8,
        groups[7] & 0xff,
      ].join(".");
      return isPublicAddress(embedded);
    }
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
// Typé en `net.LookupFunction` (et non inféré en `any`) parce que c'est
// exactement la valeur que la tâche 5 passera à `https.request` : une mauvaise
// prise à cette frontière-là se paierait en silence.
export function makeGuardedLookup(resolve: typeof dnsLookup = dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, options, (err, address, family) => {
      if (err) return callback(err, "", 0);

      const resolved: LookupAddress[] = Array.isArray(address)
        ? address
        : [{ address, family } as LookupAddress];

      // dns.lookup avec `all: true` peut rendre [] sans erreur. Aucune adresse
      // non publique n'y est jointe, mais laisser passer un résultat vide en
      // silence est justement le genre d'état qu'un garde ne doit pas tolérer.
      if (resolved.length === 0)
        return callback(
          new UnsafeAvatarUrlError(`${hostname} n'a rendu aucune adresse`) as NodeJS.ErrnoException,
          "",
          0,
        );

      for (const entry of resolved) {
        if (!isPublicAddress(entry.address))
          return callback(
            new UnsafeAvatarUrlError(
              `${hostname} résout vers une adresse non publique : ${entry.address}`,
            ) as NodeJS.ErrnoException,
            "",
            0,
          );
      }
      callback(null, address, family);
    });
  };
}

export const guardedLookup = makeGuardedLookup();
