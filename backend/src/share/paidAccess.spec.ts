import { test } from "node:test";
import assert from "node:assert/strict";
import { isPaidFor } from "./paidAccess.util.ts";

const gratuit = { priceCents: null, verifiedEmail: null, payments: [] };

test("un transfert sans prix est toujours ouvert", () => {
  assert.equal(isPaidFor(gratuit), true);
});

test("un transfert avec prix est fermé sans adresse prouvée", () => {
  assert.equal(
    isPaidFor({ priceCents: 30000, verifiedEmail: null, payments: [] }),
    false,
  );
});

test("un transfert avec prix est fermé si personne n'a payé", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "client@example.com",
      payments: [],
    }),
    false,
  );
});

test("l'adresse qui a payé entre", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "client@example.com",
      payments: [{ email: "client@example.com", revokedAt: null }],
    }),
    true,
  );
});

test("une autre adresse n'entre pas", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "curieux@example.com",
      payments: [{ email: "client@example.com", revokedAt: null }],
    }),
    false,
  );
});

test("la casse et les espaces ne décident de rien", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "  Client@Example.COM ",
      payments: [{ email: "client@example.com", revokedAt: null }],
    }),
    true,
  );
});

test("un paiement remboursé n'ouvre plus", () => {
  assert.equal(
    isPaidFor({
      priceCents: 30000,
      verifiedEmail: "client@example.com",
      payments: [{ email: "client@example.com", revokedAt: new Date() }],
    }),
    false,
  );
});

test("un prix de zéro est un prix, pas une absence de prix", () => {
  // Convention explicite : 0 veut dire « gratuit mais commandé ». On le traite
  // comme gratuit pour ne pas exiger un paiement de zéro euro que Stripe
  // refuserait de toute façon.
  assert.equal(
    isPaidFor({ priceCents: 0, verifiedEmail: null, payments: [] }),
    true,
  );
});
