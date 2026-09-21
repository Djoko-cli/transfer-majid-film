import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretStripeEvent } from "./stripeEvent.util.ts";

test("une session complétée et payée devient un paiement", () => {
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: 30000,
        currency: "eur",
        customer_details: { email: "Client@Example.com" },
        payment_intent: "pi_1",
        metadata: { shareId: "abc" },
      },
    },
  } as never);

  assert.deepEqual(out, {
    kind: "paid",
    shareId: "abc",
    email: "client@example.com",
    amountCents: 30000,
    currency: "eur",
    checkoutSessionId: "cs_test_1",
    paymentIntentId: "pi_1",
  });
});

test("une session complétée mais impayée ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_2",
        payment_status: "unpaid",
        metadata: { shareId: "abc" },
      },
    },
  } as never);
  assert.equal(out, null);
});

test("une session sans shareId ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_3",
        payment_status: "paid",
        amount_total: 100,
        currency: "eur",
        customer_details: { email: "a@b.co" },
        metadata: {},
      },
    },
  } as never);
  assert.equal(out, null);
});

test("un remboursement devient une révocation", () => {
  const out = interpretStripeEvent({
    type: "charge.refunded",
    created: 1790000000,
    data: { object: { payment_intent: "pi_1" } },
  } as never);
  assert.deepEqual(out, {
    kind: "refunded",
    paymentIntentId: "pi_1",
    eventCreatedAt: new Date(1790000000 * 1000),
  });
});

test("un remboursement sans date est traité comme frais", () => {
  // Stripe met toujours `created`, mais une charge utile forgée à la main
  // n'en a pas. Le prudent, c'est de le croire récent : on insistera pour le
  // rattacher à son paiement plutôt que de l'abandonner tout de suite.
  const avant = Date.now();
  const out = interpretStripeEvent({
    type: "charge.refunded",
    data: { object: { payment_intent: "pi_2" } },
  } as never);
  assert.equal(out?.kind, "refunded");
  const date = (out as { eventCreatedAt: Date }).eventCreatedAt.getTime();
  assert.ok(date >= avant && date <= Date.now());
});

test("une session payée sans montant ne donne rien", () => {
  // Number(undefined) vaut NaN : sans garde, l'INSERT échouerait et Stripe
  // rapporterait l'événement en boucle.
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_4",
        payment_status: "paid",
        currency: "eur",
        customer_details: { email: "a@b.co" },
        metadata: { shareId: "abc" },
      },
    },
  } as never);
  assert.equal(out, null);
});

test("une session payée à zéro centime ne donne rien", () => {
  // Number(null) vaut 0 : sans garde, un accès complet serait accordé pour
  // un paiement de rien.
  const out = interpretStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_5",
        payment_status: "paid",
        amount_total: 0,
        currency: "eur",
        customer_details: { email: "a@b.co" },
        metadata: { shareId: "abc" },
      },
    },
  } as never);
  assert.equal(out, null);
});

test("un événement qui ne nous concerne pas ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "customer.created",
    data: { object: {} },
  } as never);
  assert.equal(out, null);
});
