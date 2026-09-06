// A minimal per-key async mutex, entirely in-process. This app runs as a
// single Node process against SQLite (see docker-compose.yml's one
// `transfer` service, no clustering, no worker threads) — an in-memory
// map is the whole story here; nothing needs to coordinate across
// separate processes or hosts.
//
// Built as a promise chain rather than a locking library: each new
// caller for a key attaches its work as a `.then()` on the previous
// caller's (already-settled) promise, so calls for the SAME key run
// strictly one at a time, in arrival order, while calls for different
// keys never wait on each other at all.
const chains = new Map<string, Promise<void>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(key) ?? Promise.resolve();
  const result = prior.then(fn);

  // The chain only needs to know a slot is occupied and when it frees up
  // — never the outcome. Swallowing here (not on `result`, which the
  // caller still receives un-swallowed below) is what stops one caller's
  // rejection from wedging every later caller for the same key.
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, settled);

  // Drop the entry once nothing after us is waiting on it, so this map
  // doesn't grow forever across a long-lived process — every user who
  // has ever signed in or changed a password would otherwise leave a
  // permanent entry.
  settled.finally(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });

  return result;
}

// Every call site that needs this lock is really asking for the same
// thing: run this against one user's password/session state without a
// concurrent request for that same user interleaving — see auth.service.ts's
// signIn (password branch), resetPassword, updatePassword, and
// user.service.ts's update(). A dedicated helper keeps that one intent
// visible at each call site instead of four copies of the same
// key-prefixing convention.
export function withUserCredentialsLock<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withLock(`user-credentials:${userId}`, fn);
}
