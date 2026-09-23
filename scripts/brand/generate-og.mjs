// Fabrique frontend/public/img/og-image.png — la vignette que montrent les
// messageries et les réseaux quand on colle un lien Transfer.
//
//   node scripts/brand/generate-og.mjs
//
// L'image précédente avait été dessinée hors du dépôt : la refaire voulait
// dire la redessiner. Son gabarit vit maintenant à côté, en HTML
// (og-image.html), et ce script le rend.
//
// Le gabarit est rendu depuis un fichier autonome, pas depuis le serveur de
// développement : le logo et les fontes y sont incrustés en base64 juste
// avant le rendu. Sans ça, fabriquer la vignette exigerait qu'un serveur
// tourne sur le bon port, ce qui est une dépendance absurde pour une image
// qu'on régénère deux fois par an.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const executer = promisify(execFile);

const GABARIT = "scripts/brand/og-image.html";
const FONTES = "frontend/public/fonts/rubik";

// Une vignette par version du logo, chacune à côté de ses icônes : celle
// que Meta.tsx annonce suit le réglage « Logo sans ombrage » de la console
// d'admin. Les logos sont ceux que generate-icons.mjs vient d'écrire, déjà
// à la bonne teinte — ce script est à lancer après lui.
const VARIANTES = [
  {
    logo: "frontend/public/img/logo.png",
    sortie: "frontend/public/img/og-image.png",
  },
  {
    logo: "frontend/public/img/flat/logo.png",
    sortie: "frontend/public/img/flat/og-image.png",
  },
];

// Les dimensions qu'attendent Open Graph et Twitter, et que Meta.tsx
// annonce en dur dans ses balises. Les changer ici sans les changer là-bas
// ferait mentir la page à propos de sa propre image.
const LARGEUR = 1200;
const HAUTEUR = 630;

const NAVIGATEURS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

async function trouverNavigateur() {
  for (const chemin of NAVIGATEURS) {
    try {
      await readFile(chemin);
      return chemin;
    } catch {
      /* suivant */
    }
  }
  throw new Error(
    "aucun navigateur trouvé pour le rendu — installez Chrome, ou rendez\n" +
      `${GABARIT} à la main en 1200×630 pour chaque logo de VARIANTES`,
  );
}

async function enBase64(chemin) {
  return (await readFile(chemin)).toString("base64");
}

async function main() {
  const navigateur = await trouverNavigateur();
  const gabarit = await readFile(GABARIT, "utf8");
  for (const variante of VARIANTES) await rendre(navigateur, gabarit, variante);
}

async function rendre(navigateur, gabarit, { logo, sortie }) {
  let html = gabarit;

  // Le logo et les trois graisses de Rubik, incrustés : le fichier rendu ne
  // demande plus rien au réseau.
  html = html.replace(
    'src="/img/logo.png"',
    `src="data:image/png;base64,${await enBase64(logo)}"`,
  );
  for (const graisse of [400, 500, 600])
    html = html.replace(
      `url("/fonts/rubik/rubik-${graisse}-latin.woff2")`,
      `url("data:font/woff2;base64,${await enBase64(
        `${FONTES}/rubik-${graisse}-latin.woff2`,
      )}")`,
    );

  const temporaire = join(tmpdir(), `og-transfer-${process.pid}.html`);
  await writeFile(temporaire, html);

  try {
    await executer(navigateur, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      // Sans ça, un écran Retina rendrait une image de 2400 px de large.
      "--force-device-scale-factor=1",
      `--window-size=${LARGEUR},${HAUTEUR}`,
      `--screenshot=${sortie}`,
      // Laisse aux fontes le temps d'être décodées avant la capture.
      "--virtual-time-budget=4000",
      `file://${temporaire}`,
    ]);
  } finally {
    await unlink(temporaire).catch(() => {});
  }

  const poids = (await readFile(sortie)).length;
  console.log(
    `${sortie} — ${LARGEUR}×${HAUTEUR}, ${(poids / 1024).toFixed(0)} Ko, rendu par ${navigateur.split("/").pop()}`,
  );
}

await main();
