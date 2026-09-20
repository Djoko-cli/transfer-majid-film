import { test } from "node:test";
import assert from "node:assert/strict";
import { redactObscured } from "./obscuredValue.util.ts";

test("un réglage ordinaire garde sa valeur", () => {
  const out = redactObscured({
    obscured: false,
    value: "smtp.example.com",
    defaultValue: "",
  });
  assert.equal(out.value, "smtp.example.com");
  assert.equal(out.isSet, true);
});

test("un réglage ordinaire vide retombe sur son défaut", () => {
  const out = redactObscured({ obscured: false, value: null, defaultValue: "25" });
  assert.equal(out.value, "25");
});

test("un secret posé ne sort jamais, mais se déclare posé", () => {
  const out = redactObscured({
    obscured: true,
    value: "sk_live_tres_secret",
    defaultValue: "",
  });
  assert.equal(out.value, null);
  assert.equal(out.isSet, true);
});

test("un secret non posé se déclare non posé", () => {
  const out = redactObscured({ obscured: true, value: null, defaultValue: "" });
  assert.equal(out.value, null);
  assert.equal(out.isSet, false);
});

test("un secret dont la valeur est une chaîne vide est non posé", () => {
  // `update()` écrit null pour "", mais une base héritée peut porter "".
  const out = redactObscured({ obscured: true, value: "", defaultValue: "" });
  assert.equal(out.isSet, false);
});
