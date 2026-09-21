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
    data: { object: { payment_intent: "pi_1" } },
  } as never);
  assert.deepEqual(out, { kind: "refunded", paymentIntentId: "pi_1" });
});

test("un événement qui ne nous concerne pas ne donne rien", () => {
  const out = interpretStripeEvent({
    type: "customer.created",
    data: { object: {} },
  } as never);
  assert.equal(out, null);
});
