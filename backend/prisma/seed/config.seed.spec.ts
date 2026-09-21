import { test } from "node:test";
import assert from "node:assert/strict";
import { configVariables } from "./config.variables.ts";

test("tout réglage obscured est aussi secret", () => {
  // `list()` sert GET /api/configs SANS aucun garde et filtre sur `secret`,
  // pas sur `obscured` (config.service.ts:567, config.controller.ts:35-37).
  // Les onze réglages obscured d'aujourd'hui portent tous secret: true, donc
  // rien ne sort. C'est un couplage, pas une garantie : ce test est ce qui le
  // rend garanti.
  const fautifs: string[] = [];

  for (const [categorie, variables] of Object.entries(configVariables)) {
    for (const [nom, variable] of Object.entries(variables as object)) {
      const v = variable as { obscured?: boolean; secret?: boolean };
      if (v.obscured && !v.secret) fautifs.push(`${categorie}.${nom}`);
    }
  }

  assert.deepEqual(fautifs, []);
});
