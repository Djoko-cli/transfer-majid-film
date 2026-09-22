// Fabrique toutes les déclinaisons de l'icône du produit depuis une seule
// source, pour qu'il n'y ait jamais qu'un fichier à remplacer le jour où le
// logo change — et pour que quinze tailles ne divergent pas en silence.
//
//   node scripts/brand/generate-icons.mjs [source] [--dry-run <dossier>]
//
// Sans argument, la source est scripts/brand/logo-source.png. Un SVG ferait
// aussi bien, et mieux : il resterait net à toutes les tailles.
//
// Trois familles d'icônes, et elles ne se ressemblent pas :
//
//  - les icônes « normales » (favicon, apple-touch, PWA `any`) montrent le
//    logo bord à bord ;
//  - les icônes « maskable » sont recadrées par Android en cercle ou en
//    squircle, qui mord jusqu'à 10 % de chaque côté. Une icône déjà ronde et
//    pleine cadre y perdrait sa bordure — et le point en bas à droite, qui
//    est le premier à sortir du cadre. On les génère donc avec une marge,
//    sur un fond de la couleur de la marque ;
//  - les toutes petites (16 et 32 px du favicon) perdent le point en bas à
//    droite, qui n'y ferait qu'un pixel et demi de bouillie. Voir
//    `retirerLePoint` plus bas.
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

const SOURCE_PAR_DEFAUT = "scripts/brand/logo-source.png";

// Le fond des icônes qui ne peuvent pas être transparentes. La crème du T,
// relevée dans le logo lui-même, et non l'orange de la marque : sur un fond
// orange, un disque orange disparaît — le cercle cesse d'être un cercle et
// le point s'évanouit avec lui. Sur la crème, la marque se lit exactement
// comme elle a été dessinée.
const FOND_OPAQUE = "#faf0e4";

// `purpose: "any"` — le logo occupe tout le cadre.
const TAILLES_PWA = [48, 72, 96, 128, 144, 152, 192, 384, 512];

// Le favicon multi-résolutions. 16 et 32 sont ce que l'onglet utilise
// vraiment ; 48 sert aux raccourcis de bureau.
const TAILLES_FAVICON = [16, 32, 48];

// En dessous de ce seuil, le point disparaît — décision du propriétaire.
const SEUIL_DU_POINT = 48;

// Où chercher le point dans le cadre, en fraction de la largeur. Exprimé
// ainsi plutôt qu'en pixels pour survivre à un changement de résolution.
const GRAINE_DU_POINT = 0.925;

/**
 * Rend une copie de la source sans son point, ou `null` s'il n'y en a pas.
 *
 * Par diffusion depuis un pixel du point plutôt que par un rectangle deviné :
 * on efface exactement sa composante connexe, et rien d'autre. Deux gardes
 * rendent l'opération sûre pour un futur logo — si la graine tombe sur du
 * transparent, il n'y a pas de point ; si la diffusion déborde sur plus d'un
 * vingtième de l'image, c'est qu'elle a atteint le cercle, et on refuse
 * plutôt que de rendre une icône mutilée.
 */
async function retirerLePoint(source) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const opaque = (i) => data[i * C + 3] > 16;

  const graine =
    Math.round(W * GRAINE_DU_POINT) + Math.round(H * GRAINE_DU_POINT) * W;
  if (!opaque(graine)) return null;

  const vu = new Uint8Array(W * H);
  const pile = [graine];
  vu[graine] = 1;
  let n = 0;

  while (pile.length) {
    const i = pile.pop();
    n++;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = nx + ny * W;
      if (vu[j] || !opaque(j)) continue;
      vu[j] = 1;
      pile.push(j);
    }
  }

  if (n > W * H * 0.05)
    throw new Error(
      `la diffusion a couvert ${n} pixels : elle a atteint le cercle, pas seulement le point`,
    );

  const sortie = Buffer.from(data);
  for (let i = 0; i < W * H; i++) if (vu[i]) sortie[i * C + 3] = 0;

  return { buffer: sortie, raw: { width: W, height: H, channels: C }, n };
}

async function rendre(entree, taille, { fond = null, marge = 0 } = {}) {
  const utile = Math.round(taille * (1 - 2 * marge));
  const logo = await sharp(entree.source, entree.options)
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
  const args = process.argv.slice(2);
  const iSec = args.indexOf("--dry-run");
  const cible = iSec === -1 ? null : args[iSec + 1];
  const source = (iSec === 0 ? null : args[0]) ?? SOURCE_PAR_DEFAUT;
  const racine = cible ?? "frontend/public/img";

  if (iSec !== -1 && !cible) {
    console.error("--dry-run attend un dossier de sortie");
    process.exit(1);
  }

  const meta = await sharp(source).metadata();
  const vectorielle = extname(source).toLowerCase() === ".svg";
  console.log(
    `source : ${source} (${meta.width}x${meta.height}${vectorielle ? ", vectorielle" : ""})`,
  );
  if (!vectorielle && Math.min(meta.width, meta.height) < 1024)
    console.warn("  attention : moins de 1024 px, les grandes tailles seront molles");
  if (meta.width !== meta.height)
    console.warn("  attention : source non carree, elle sera centree et non deformee");

  const complet = { source, options: { density: 600 } };
  const sansPoint = await retirerLePoint(source);
  const petit = sansPoint
    ? { source: sansPoint.buffer, options: { raw: sansPoint.raw } }
    : complet;
  console.log(
    sansPoint
      ? `point  : ${sansPoint.n} pixels retires en dessous de ${SEUIL_DU_POINT} px`
      : "point  : aucun detecte, toutes les tailles gardent la source telle quelle",
  );

  // En dessous du seuil, le point n'est plus qu'une bavure : on rend le
  // cercle seul.
  const pour = (t) => (t < SEUIL_DU_POINT ? petit : complet);

  await mkdir(join(racine, "icons"), { recursive: true });

  const ecrits = [];
  const ecrire = async (chemin, donnees) => {
    await writeFile(chemin, donnees);
    ecrits.push([chemin, donnees.length]);
  };

  // Le logo plein cadre, celui qu'affiche l'en-tete du site.
  const logo512 = await rendre(complet, 512);
  await ecrire(join(racine, "logo.png"), logo512);

  // La variante « sombre » est le meme fichier : un disque orange se lit sur
  // fond clair comme sur fond sombre. Elle etait deja un doublon au bit pres
  // avant ce script — ecrite ici plutot que copiee a la main, elle ne peut
  // plus diverger en silence. Logo.tsx bascule toujours entre les deux, et
  // le jour ou une vraie variante sombre existera, c'est ici qu'elle se
  // branchera.
  await ecrire(join(racine, "logo-dark.png"), logo512);

  // Les icones PWA, bord a bord.
  for (const t of TAILLES_PWA)
    await ecrire(
      join(racine, "icons", `icon-${t}x${t}.png`),
      await rendre(pour(t), t),
    );

  // Les maskable, avec leur marge de securite et leur fond opaque.
  for (const t of [192, 512])
    await ecrire(
      join(racine, "icons", `icon-maskable-${t}x${t}.png`),
      await rendre(complet, t, { fond: FOND_OPAQUE, marge: 0.1 }),
    );

  // iOS, fond opaque : la transparence y deviendrait du noir.
  await ecrire(
    join(racine, "icons", "apple-touch-icon.png"),
    await rendre(complet, 180, { fond: FOND_OPAQUE }),
  );

  // Le favicon, trois resolutions dans un seul .ico.
  const couches = [];
  for (const t of TAILLES_FAVICON) couches.push(await rendre(pour(t), t));
  await ecrire(join(racine, "favicon.ico"), versIco(couches, TAILLES_FAVICON));

  // Le site de documentation a sa propre copie, hors de public/.
  if (!cible) await ecrire("docs/static/img/logo.png", logo512);

  for (const [chemin, poids] of ecrits)
    console.log(`  ${chemin.padEnd(50)} ${(poids / 1024).toFixed(1)} Ko`);
}

// Un .ico est un en-tête de 6 octets, puis une entrée de 16 octets par image,
// puis les images elles-mêmes. On y met des PNG tels quels, ce que tout ce
// qui a survécu à Internet Explorer 11 sait lire.
function versIco(images, tailles) {
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
