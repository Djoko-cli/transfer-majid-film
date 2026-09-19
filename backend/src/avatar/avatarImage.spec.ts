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
