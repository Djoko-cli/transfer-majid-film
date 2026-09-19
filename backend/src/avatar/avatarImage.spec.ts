import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { encodeAvatar, UndecodableAvatarError } from "./avatarImage.ts";

async function sourceJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 90, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

// Carree pour que le fit "cover" ne recadre rien : entree et sortie ont le
// meme ratio (1:1), rotation EXIF ou pas, donc le seul effet visible d'un
// .rotate() manquant ou present est la position du contenu, jamais une
// difference de recadrage qui viendrait brouiller la mesure.
const HALVES_SIZE = 100;

// Moitie gauche rouge, moitie droite bleue, taguee Orientation = 6 (rotation
// 90 degres horaire a l'affichage). Sans .rotate(), le decoupage gauche/droite
// (colonnes) reste tel quel. Avec, la rotation 90 degres horaire transforme ce
// decoupage vertical en decoupage haut/bas (lignes) : la colonne d'origine x
// devient la ligne y' = x de l'image affichee. C'est cette bascule que le test
// verifie, en echantillonnant un pixel choisi loin des deux limites (donc a
// l'abri du flou d'interpolation et des artefacts de bloc JPEG/WebP).
async function halvesJpegWithOrientation6(): Promise<Buffer> {
  const raw = Buffer.alloc(HALVES_SIZE * HALVES_SIZE * 3);
  for (let y = 0; y < HALVES_SIZE; y++) {
    for (let x = 0; x < HALVES_SIZE; x++) {
      const i = (y * HALVES_SIZE + x) * 3;
      if (x < HALVES_SIZE / 2) {
        raw[i] = 255; // rouge, moitie gauche
      } else {
        raw[i + 2] = 255; // bleu, moitie droite
      }
    }
  }
  return sharp(raw, { raw: { width: HALVES_SIZE, height: HALVES_SIZE, channels: 3 } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

test("sort un WebP carre de 512 px, quelle que soit la source", async () => {
  for (const [w, h] of [
    [3000, 2000],
    [800, 2400],
    [512, 512],
    [64, 64], // plus petite que la cible : agrandie, jamais laissee telle quelle
  ] as Array<[number, number]>) {
    const out = await encodeAvatar(await sourceJpeg(w, h));
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "webp", `${w}x${h}`);
    assert.equal(meta.width, 512, `${w}x${h}`);
    assert.equal(meta.height, 512, `${w}x${h}`);
  }
});

test("ne garde aucune metadonnee de la source", async () => {
  const withExif = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .withExif({ IFD0: { Copyright: "Majid", Software: "test" } })
    .jpeg()
    .toBuffer();

  const meta = await sharp(await encodeAvatar(withExif)).metadata();
  assert.equal(meta.exif, undefined);
});

test("applique l'orientation EXIF avant le recadrage", async () => {
  const out = await encodeAvatar(await halvesJpegWithOrientation6());
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

  // (384, 64) : a 128 px des deux limites (256, 256) dans les deux axes. Une
  // fois la rotation appliquee, la ligne y = 64 est dans la moitie haute
  // (ex-colonne gauche, rouge) quelle que soit la colonne. Sans rotation, ce
  // point resterait dans la moitie droite d'origine (bleue).
  const x = 384;
  const y = 64;
  const idx = (y * info.width + x) * info.channels;
  const [r, g, b] = [data[idx], data[idx + 1], data[idx + 2]];

  assert.ok(
    r > 150 && b < 100,
    `attendu un pixel rouge en (${x}, ${y}) apres rotation, obtenu rgb(${r}, ${g}, ${b})`,
  );
});

test("refuse un SVG", async () => {
  // sharp sait lire le SVG, et c'est precisement le probleme : un SVG est un
  // document a parseur, pas une image. Voir le commentaire dans avatarImage.ts.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
    "utf8",
  );
  await assert.rejects(() => encodeAvatar(svg), UndecodableAvatarError);
});

test("refuse ce qui n'est pas une image", async () => {
  await assert.rejects(
    () => encodeAvatar(Buffer.from("ceci n'est pas une image", "utf8")),
    UndecodableAvatarError,
  );
  await assert.rejects(() => encodeAvatar(Buffer.alloc(0)), UndecodableAvatarError);
});

test("refuse une bombe a decompression", async () => {
  // 9000 x 9000 = 81 Mpx, au-dela de limitInputPixels (50 Mpx), et quelques
  // dizaines de Ko seulement sur un aplat.
  const bombe = await sharp({
    create: { width: 9000, height: 9000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await assert.rejects(() => encodeAvatar(bombe), UndecodableAvatarError);
});
