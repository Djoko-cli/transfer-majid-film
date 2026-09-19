import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldIngest } from "./avatar.fetch.ts";

test("ne recupere que si le compte n'a pas deja une photo", () => {
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, "https://x/a.png"), true);
  assert.equal(shouldIngest({ avatarUpdatedAt: new Date() }, "https://x/a.png"), false);
});

test("ne recupere pas sans URL", () => {
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, undefined), false);
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, ""), false);
});
