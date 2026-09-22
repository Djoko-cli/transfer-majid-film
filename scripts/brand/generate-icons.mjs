// Fabrique toutes les déclinaisons de l'icône du produit depuis une seule
// source, pour qu'il n'y ait jamais qu'un fichier à remplacer le jour où le
// logo change — et pour que douze tailles ne divergent pas en silence.
//
//   node scripts/brand/generate-icons.mjs <source> [--dry-run <dossier>]
//
// La source est idéalement un SVG (rendu net à chaque taille) ; un PNG carré
// d'au moins 1024 px fait l'affaire.
//
// Deux familles d'icônes, et elles ne se ressemblent pas :
//
//  - les icônes « normales » (favicon, apple-touch, PWA `any`) montrent le
//    logo bord à bord ;
//  - les icônes « maskable » sont recadrées par Android en cercle ou en
//    squircle, qui mord jusqu'à 10 % de chaque côté. Une icône déjà ronde et
//    pleine cadre y perdrait sa bordure — et le point en bas à droite, qui
//    est le premier à sortir du cadre. On les génère donc avec une marge,
//    sur un fond de la couleur de la marque.
//
// L'apple-touch-icon, lui, est posé sur un fond opaque : iOS ne gère pas la
// transparence sur l'écran d'accueil et la remplacerait par du noir.

// Chemin explicite vers le sharp du backend : ce script vit à la racine du
// dépôt, qui n'a pas de node_modules à lui, et node remonte les dossiers
// depuis le fichier — il ne trouverait rien. Plutôt que d'installer une
// seconde copie d'une bibliothèque native de 30 Mo pour un outil qu'on lance
// le jour où le logo change, on emprunte celle qui est déjà là.
import * as sharpNamespace from "../../backend/node_modules/sharp/dist/index.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const sharp = sharpNamespace.default ?? sharpNamespace;

// La couleur de fond des icônes opaques. Reprise de `theme_color` du
// manifeste, pour qu'un écran d'accueil iOS et une tuile Android montrent la
// même orange que l'application.
const MARQUE = "#ff7a00";

// `purpose: "any"` — le logo occupe tout le cadre.
const TAILLES_PWA = [48, 72, 96, 128, 144, 152, 192, 384, 512];

// Le favicon multi-résolutions. 16 et 32 sont ce que l'onglet utilise
// vraiment ; 48 sert aux raccourcis de bureau.
const TAILLES_FAVICON = [16, 32, 48];

async function rendre(source, taille, { fond = null, marge = 0 } = {}) {
  const utile = Math.round(taille * (1 - 2 * marge));
  const logo = await sharp(source, { density: 600 })
    .resize(utile, utile, { fit: "contain", background: "#00000000" })
    .png()
    .toBuffer();

  const base = sharp({
    create: {
      width: taille,
      height: taille,
      channels: 4,
      background: fond ?? "#00000000",
    },
  });

  return base.composite([{ input: logo, gravity: "center" }]).png().toBuffer();
}

async function main() {
  const [source, drapeau, cible] = process.argv.slice(2);
  if (!source) {
    console.error("usage: generate-icons.mjs <source.svg|png> [--dry-run <dossier>]");
    process.exit(1);
  }

  const sec = drapeau === "--dry-run";
  const racine = sec ? cible : "frontend/public/img";
  if (sec && !cible) {
    console.error("--dry-run attend un dossier de sortie");
    process.exit(1);
  }

  const meta = await sharp(source).metadata();
  const estVectoriel = extname(source).toLowerCase() === ".svg";
  console.log(
    `source : ${source} (${meta.width}×${meta.height}${estVectoriel ? ", vectorielle" : ""})`,
  );
  if (!estVectoriel && Math.min(meta.width, meta.height) < 1024)
    console.warn(
      `  ⚠ moins de 1024 px : les grandes tailles seront interpolées, pas nettes`,
    );
  if (meta.width !== meta.height)
    console.warn(`  ⚠ source non carrée : elle sera centrée, pas déformée`);

  await mkdir(join(racine, "icons"), { recursive: true });

  const ecrits = [];
  const ecrire = async (chemin, donnees) => {
    await writeFile(chemin, donnees);
    ecrits.push([chemin, donnees.length]);
  };

  // Le logo plein cadre, celui qu'affiche l'en-tête du site.
  await ecrire(join(racine, "logo.png"), await rendre(source, 512));

  // Les icônes PWA, bord à bord.
  for (const t of TAILLES_PWA)
    await ecrire(
      join(racine, "icons", `icon-${t}x${t}.png`),
      await rendre(source, t),
    );

  // Les maskable, avec leur marge de sécurité et leur fond opaque.
  for (const t of [192, 512])
    await ecrire(
      join(racine, "icons", `icon-maskable-${t}x${t}.png`),
      await rendre(source, t, { fond: MARQUE, marge: 0.1 }),
    );

  // iOS, fond opaque : la transparence y deviendrait du noir.
  await ecrire(
    join(racine, "icons", "apple-touch-icon.png"),
    await rendre(source, 180, { fond: MARQUE }),
  );

  // Le favicon, trois résolutions dans un seul .ico.
  const couches = await Promise.all(
    TAILLES_FAVICON.map((t) => rendre(source, t)),
  );
  await ecrire(join(racine, "favicon.ico"), await versIco(couches, TAILLES_FAVICON));

  for (const [chemin, poids] of ecrits)
    console.log(`  ${chemin.padEnd(52)} ${(poids / 1024).toFixed(1)} Ko`);
}

// Un .ico est un en-tête de 6 octets, puis une entrée de 16 octets par image,
// puis les images elles-mêmes. On y met des PNG tels quels, ce que tout ce
// qui a survécu à Internet Explorer 11 sait lire.
async function versIco(images, tailles) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0); // réservé
  entete.writeUInt16LE(1, 2); // 1 = icône
  entete.writeUInt16LE(images.length, 4);

  let decalage = 6 + images.length * 16;
  const entrees = [];
  for (let i = 0; i < images.length; i++) {
    const e = Buffer.alloc(16);
    e.writeUInt8(tailles[i] >= 256 ? 0 : tailles[i], 0);
    e.writeUInt8(tailles[i] >= 256 ? 0 : tailles[i], 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // réservé
    e.writeUInt16LE(1, 4); // plans
    e.writeUInt16LE(32, 6); // bits par pixel
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(decalage, 12);
    decalage += images[i].length;
    entrees.push(e);
  }

  return Buffer.concat([entete, ...entrees, ...images]);
}

await main();
