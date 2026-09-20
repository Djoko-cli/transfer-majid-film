// One question, asked from two places that must not answer it differently:
// after this change, can this account still get in?
//
// It is asked when someone unlinks an OAuth provider (oauth.service.ts) and
// when an administrator flips an authentication setting for the whole
// instance (config.service.ts). Both are ordinary, reasonable-looking
// actions that can leave an account — or every administrator at once — with
// no door left. Keeping the rule in one pure function is what stops the two
// callers from disagreeing about what a usable door is.

export type SignInMethods = {
  /** The account has a local password hash. `null` is a real state here. */
  hasPassword: boolean;
  /** An LDAP account authenticates through the same password form. */
  isLdap: boolean;
  /** Providers this account is actually linked to. */
  linkedProviders: string[];
  /** `oauth.disablePassword` — instance-wide, not per account. */
  passwordDisabled: boolean;
  /** Providers whose `oauth.<name>-enabled` is on right now. */
  enabledProviders: string[];
};

/**
 * True when at least one way in survives.
 *
 * `passwordDisabled` closes the password form for everyone, and it takes
 * LDAP with it: AuthService.signIn returns before reaching either when the
 * setting is on, so an LDAP account is no more able to sign in than a local
 * one. A linked provider only counts while that provider is enabled —
 * ProviderGuard refuses the route otherwise, so a link to a switched-off
 * provider is not a door, it is a memory of one.
 */
export function hasAnySignInMethod(methods: SignInMethods): boolean {
  if (!methods.passwordDisabled && (methods.hasPassword || methods.isLdap))
    return true;

  return methods.linkedProviders.some((provider) =>
    methods.enabledProviders.includes(provider),
  );
}
