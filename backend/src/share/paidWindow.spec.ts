import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccessUntil, nextExpiration } from "./paidWindow.util.ts";

const JOUR = 86400;

test("la fenêtre part du paiement", () => {
  const paidAt = new Date("2026-01-01T12:00:00Z");
  const out = computeAccessUntil(paidAt, 30 * JOUR);
  assert.equal(out.toISOString(), "2026-01-31T12:00:00.000Z");
});

test("une expiration plus lointaine que la fenêtre ne bouge pas", () => {
  const expiration = new Date("2026-06-01T00:00:00Z");
  const accessUntil = new Date("2026-01-31T00:00:00Z");
  assert.equal(nextExpiration(expiration, accessUntil), null);
});

test("une expiration plus proche recule jusqu'à la fenêtre", () => {
  const expiration = new Date("2026-01-03T00:00:00Z");
  const accessUntil = new Date("2026-01-31T00:00:00Z");
  assert.equal(
    nextExpiration(expiration, accessUntil)?.toISOString(),
    "2026-01-31T00:00:00.000Z",
  );
});

test("un transfert permanent ne recule pas", () => {
  // L'epoch est la convention du dépôt pour « n'expire jamais » — voir
  // generateShareToken, qui compare avec moment(expiration).isSame(0).
  const permanent = new Date(0);
  const accessUntil = new Date("2026-01-31T00:00:00Z");
  assert.equal(nextExpiration(permanent, accessUntil), null);
});
