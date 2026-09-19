import sharp from "sharp";

// Sans dépendance NestJS, comme avatarUrl.guard.ts et pour la même raison.
export class UndecodableAvatarError extends Error {}

// Ce que la sortie fait, et pourquoi il n'existe pas de chemin « stocker tel
// quel » :
//  - le type est prouvé par le décodage, jamais cru sur parole d'un en-tête que
//    l'appelant contrôle ;
//  - ce qui sort est une image que sharp a écrite, donc un fichier piégé ne
//    survit pas au passage ;
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
// vectorielle. Le format est lu avant tout traitement, donc avant tout
// rendu.
const REFUSED_FORMATS = new Set(["svg"]);

export async function encodeAvatar(bytes: Buffer): Promise<Buffer> {
  try {
    // Une seule instance, décodée une seule fois : `limitInputPixels` ne borne
    // ainsi qu'un décodage, pas deux, et la bombe à décompression est
    // contrainte par le seul appel qui reste plutôt que par un premier qui
    // masquerait un second mal câblé.
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });

    // Le format est lu avant tout traitement, donc avant tout rendu.
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
    throw new UndecodableAvatarError(
      error instanceof Error ? error.message : String(error),
    );
  }
}
