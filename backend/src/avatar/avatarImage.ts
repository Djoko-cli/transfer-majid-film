import * as sharpNamespace from "sharp";

// Cale d'interopérabilité, et elle n'est pas décorative. Ce fichier est chargé
// de deux façons : compilé en CommonJS par `tsc` pour le serveur, et lu tel
// quel comme module ES par le runner de tests de Node. `import sharp from
// "sharp"` marche sous le second et casse sous le premier — `esModuleInterop`
// n'est pas activé dans ce dépôt, et l'activer lève 58 erreurs ailleurs — en
// émettant `sharp_1.default`, qui vaut `undefined` pour un module CommonJS
// exportant une fonction. L'échec était masqué : le `catch` plus bas le
// traduisait en « ce fichier n'est pas une image ».
const sharp: typeof import("sharp").default =
  (sharpNamespace as unknown as { default?: typeof import("sharp").default })
    .default ?? (sharpNamespace as unknown as typeof import("sharp").default);

// Sans dépendance NestJS, comme avatarUrl.guard.ts et pour la même raison.
export class UndecodableAvatarError extends Error {}

// Ce que la sortie fait, et pourquoi il n'existe pas de chemin « stocker tel
// quel » :
//  - le type est prouvé par le décodage, jamais cru sur parole d'un en-tête que
//    l'appelant contrôle ;
//  - ce qui sort est une image que sharp a écrite, donc un fichier piégé ne
//    survit pas au passage ;
//  - `.rotate()` (sans argument) applique l'orientation EXIF puis la jette,
//    avant le recadrage carré : sans lui une photo prise au téléphone en
//    portrait arriverait couchée ;
//  - toutes les métadonnées sautent, coordonnées GPS comprises, ce qui est le
//    comportement voulu pour une image qu'un compte expose de lui-même ;
//  - `limitInputPixels` borne la bombe à décompression : une image de 100 Ko
//    qui se déplie en 81 Mpx est refusée avant d'être allouée.
const SIDE = 512;
const QUALITY = 82;
const MAX_INPUT_PIXELS = 50_000_000;

// sharp sait lire le SVG, et on ne veut pas de cette porte. Un SVG n'est pas
// une image, c'est un document XML rendu par un moteur complet : il peut
// reference des ressources externes, ce qui rouvre par la bande le SSRF que le
// validateur d'URL ferme a l'autre bout, et il pese sur un parseur bien plus
// large que celui d'un PNG. Aucune photo de profil n'a besoin d'etre
// vectorielle.
//
// Ce Set n'est qu'un filet de secours, pas la barrière : il n'est consulté
// qu'après `image.metadata()`, qui a déjà fait tourner le parseur qu'on
// voulait éviter. Pour un SVG, libvips choisit l'opération `svgload`, dont la
// fonction d'en-tête appelle `rsvg_handle_new_from_data` — le document XML est
// intégralement parsé par librsvg avant même que `format` soit connu, donc
// avant que ce Set ne soit atteint. La barrière voulue est `looksLikeMarkup`
// ci-dessous, qui refuse par signature d'octets avant de construire
// l'instance sharp — un filtre binaire, pas un parseur, et donc pas une
// garantie d'exhaustivité : il connaît la signature gzip et le BOM UTF-8
// parce qu'un premier passage les avait manqués (un SVG précédé d'un BOM, ou
// compressé en SVGZ, traversait tel quel et ne se faisait refuser qu'ici,
// après que librsvg avait déjà tourné), pas parce que la liste est
// désormais complète. Toute autre façon d'habiller un SVG pour ce reniflage
// retombe sur ce Set — après coup.
const REFUSED_FORMATS = new Set(["svg"]);

// Signature gzip (RFC 1952) : un SVG peut arriver compressé (SVGZ), même
// magie que n'importe quel `.gz`. sharp le décompresse et le décode comme un
// SVG normal derrière le même `svgload` — donc le même contournement que le
// reniflage textuel ci-dessous doit fermer, avant même de regarder le
// contenu décompressé. Aucun des formats qu'on accepte par ailleurs (PNG,
// JPEG, WebP, GIF, TIFF, AVIF) n'est jamais gzippé en entrée : un refus ici
// est donc sans faux positif sur eux.
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

// Renifle le début du buffer, avant même de construire l'instance sharp —
// donc avant que libvips ne choisisse un décodeur et, pour un SVG (compressé
// ou non), avant que librsvg ne parse quoi que ce soit.
//  - Un flux gzip (SVGZ compris) commence par les deux octets `1F 8B` : voir
//    GZIP_MAGIC_0/1 ci-dessus.
//  - Un document XML commence par `<` — `<svg`, `<?xml`, `<!DOCTYPE` — une
//    fois sauté un éventuel BOM UTF-8 (`EF BB BF`, valide en tête d'un
//    document XML) puis les espaces ASCII usuels en tête d'un document texte.
function looksLikeMarkup(bytes: Buffer): boolean {
  if (bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1)
    return true;

  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;

  for (; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0c)
      continue;
    return byte === 0x3c; // '<'
  }
  return false;
}

export async function encodeAvatar(bytes: Buffer): Promise<Buffer> {
  // Doit précéder tout appel à sharp : c'est le seul contrôle qui s'exécute
  // avant que le document soit donné à un parseur, SVG (compressé ou non) en
  // tête. Voir `looksLikeMarkup` et le commentaire de `REFUSED_FORMATS`
  // ci-dessus.
  if (looksLikeMarkup(bytes))
    throw new UndecodableAvatarError("format refusé : document XML/markup");

  try {
    // Une seule instance, décodée une seule fois : `limitInputPixels` ne borne
    // ainsi qu'un décodage, pas deux, et la bombe à décompression est
    // contrainte par le seul appel qui reste plutôt que par un premier qui
    // masquerait un second mal câblé.
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });

    // Filet de secours seulement (voir REFUSED_FORMATS ci-dessus) : à ce
    // stade `metadata()` a déjà fait tourner le décodeur, SVG compris.
    const { format } = await image.metadata();
    if (!format || REFUSED_FORMATS.has(format))
      throw new UndecodableAvatarError(`format refusé : ${format ?? "inconnu"}`);

    return await image
      // Sans argument : applique l'orientation EXIF puis la jette. Sans lui,
      // une photo prise au téléphone en portrait arrive couchée.
      .rotate()
      // `attention` laisse sharp choisir la région saillante plutôt que le
      // centre géométrique : gratuit, et ça rattrape les portraits décentrés.
      .resize(SIDE, SIDE, { fit: "cover", position: "attention" })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch (error) {
    if (error instanceof UndecodableAvatarError) throw error;
    // Une erreur de programmation (import cassé, appel invalide, TypeError
    // sur un objet qui n'a pas la forme attendue) n'est pas une image
    // illisible : elle doit remonter telle quelle jusqu'au 500 qu'elle
    // mérite, pas se déguiser en 400 « fichier illisible ». C'est exactement
    // ce déguisement qui a caché le bug d'import de `sharp` derrière un
    // message plausible et faux.
    if (error instanceof TypeError || error instanceof ReferenceError)
      throw error;
    throw new UndecodableAvatarError(
      error instanceof Error ? error.message : String(error),
    );
  }
}
