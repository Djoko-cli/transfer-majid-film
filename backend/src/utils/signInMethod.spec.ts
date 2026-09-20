import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAnySignInMethod } from "./signInMethod.util.ts";

const base = {
  hasPassword: false,
  isLdap: false,
  linkedProviders: [] as string[],
  passwordDisabled: false,
  enabledProviders: [] as string[],
};

test("un mot de passe suffit tant que le formulaire est ouvert", () => {
  assert.equal(hasAnySignInMethod({ ...base, hasPassword: true }), true);
});

test("un compte LDAP passe par le meme formulaire, donc compte aussi", () => {
  assert.equal(hasAnySignInMethod({ ...base, isLdap: true }), true);
});

test("disablePassword ferme le mot de passe ET le LDAP", () => {
  assert.equal(
    hasAnySignInMethod({ ...base, hasPassword: true, passwordDisabled: true }),
    false,
  );
  assert.equal(
    hasAnySignInMethod({ ...base, isLdap: true, passwordDisabled: true }),
    false,
  );
});

test("un lien vers un fournisseur actif est une porte", () => {
  assert.equal(
    hasAnySignInMethod({
      ...base,
      passwordDisabled: true,
      linkedProviders: ["oidc"],
      enabledProviders: ["oidc"],
    }),
    true,
  );
});

test("un lien vers un fournisseur eteint n'en est pas une", () => {
  // ProviderGuard refuse la route quand `oauth.<nom>-enabled` est faux : le
  // lien existe toujours en base, mais il n'ouvre plus rien. C'est le cas
  // qui verrouille sans prevenir, puisque la page de compte continue
  // d'afficher le compte comme associe.
  assert.equal(
    hasAnySignInMethod({
      ...base,
      passwordDisabled: true,
      linkedProviders: ["oidc"],
      enabledProviders: ["github"],
    }),
    false,
  );
});

test("aucune porte du tout", () => {
  assert.equal(hasAnySignInMethod({ ...base }), false);
  assert.equal(
    hasAnySignInMethod({ ...base, linkedProviders: ["google"] }),
    false,
  );
});

test("un fournisseur actif sauve un compte sans mot de passe meme formulaire ouvert", () => {
  assert.equal(
    hasAnySignInMethod({
      ...base,
      linkedProviders: ["github"],
      enabledProviders: ["github", "oidc"],
    }),
    true,
  );
});
