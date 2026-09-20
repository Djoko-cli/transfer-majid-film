import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type * as https from "node:https";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_TIMEOUT_MS,
  makeAvatarFetcher,
  shouldIngest,
} from "./avatar.fetch.ts";
import { guardedLookup, UnsafeAvatarUrlError } from "./avatarUrl.guard.ts";

test("les valeurs par defaut sont celles de la spec : 3 redirections, 5 Mio, 5000 ms", () => {
  assert.equal(DEFAULT_MAX_REDIRECTS, 3);
  assert.equal(DEFAULT_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(DEFAULT_TIMEOUT_MS, 5_000);
});

// `https.request` a une signature très surchargée ; caster une fausse
// implémentation à ce type se fait toujours en deux temps, via `unknown`.
function asHttpsRequest(fn: RequestFn): typeof https.request {
  return fn as unknown as typeof https.request;
}

test("ne recupere que si le compte n'a pas deja une photo", () => {
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, "https://x/a.png"), true);
  assert.equal(shouldIngest({ avatarUpdatedAt: new Date() }, "https://x/a.png"), false);
});

test("ne recupere pas sans URL", () => {
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, undefined), false);
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, ""), false);
});

test("ne recupere pas si le compte est null", () => {
  // Le seul appelant restant (`OAuthService.signUp`) ne passe jamais `null` —
  // il construit un littéral `{ id, avatarUpdatedAt: null }` — mais le type
  // de `shouldIngest` l'accepte toujours, en défense en profondeur pour un
  // futur appelant qui relirait l'utilisateur via Prisma (`findFirst`/
  // `findUnique` rendent `User | null`), dans un dépôt qui compile en
  // `strictNullChecks: false` : rien ne signalerait alors à la compilation
  // que `user` peut être `null` ici. Sans ce contrôle, `user.avatarUpdatedAt`
  // lèverait une `TypeError` — sur un appel fait en `void`, ça devient une
  // promesse rejetée non gérée.
  assert.equal(shouldIngest(null, "https://x/a.png"), false);
});

test("ne recupere pas si le claim n'est pas une chaine", () => {
  // Un IdP hostile peut poser `picture: ["https://x/a.png"]` : le decodage
  // du jeton n'est pas valide au runtime, seul TypeScript croit que
  // `idTokenData.picture` est une `string`.
  const tableau = ["https://x/a.png"] as unknown as string;
  assert.equal(shouldIngest({ avatarUpdatedAt: null }, tableau), false);
});

// --- Faux client https, pour exercer makeAvatarFetcher sans connexion
// reseau. Reproduit juste assez de ClientRequest / IncomingMessage
// (EventEmitter + les methodes que avatar.fetch.ts appelle) pour piloter
// chaque scenario.

type FakeResponseSpec = {
  statusCode: number;
  headers?: Record<string, string>;
};

function fakeIncomingMessage(spec: FakeResponseSpec) {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    resume: () => void;
    destroy: () => void;
  };
  res.statusCode = spec.statusCode;
  res.headers = spec.headers ?? {};
  res.resume = () => {};
  res.destroy = () => {};
  return res;
}

function fakeClientRequest() {
  const req = new EventEmitter() as EventEmitter & {
    end: () => void;
    destroy: (error?: Error) => void;
    destroyed: boolean;
  };
  req.destroyed = false;
  req.end = () => {};
  req.destroy = () => {
    req.destroyed = true;
  };
  return req;
}

type RequestFn = (
  url: unknown,
  options: unknown,
  callback: (response: ReturnType<typeof fakeIncomingMessage>) => void,
) => ReturnType<typeof fakeClientRequest>;

// Repond `redirectCount` fois par une 302 vers la meme location, puis 200.
function makeRedirectChainRequest(redirectCount: number): RequestFn {
  let calls = 0;
  return (_url, _options, callback) => {
    calls++;
    const req = fakeClientRequest();
    const spec: FakeResponseSpec =
      calls <= redirectCount
        ? { statusCode: 302, headers: { location: "https://x/next" } }
        : { statusCode: 200 };
    queueMicrotask(() => {
      const res = fakeIncomingMessage(spec);
      callback(res);
      queueMicrotask(() => res.emit("end"));
    });
    return req;
  };
}

// Redirige indefiniment vers la meme `location` (les tests s'arretent des la
// premiere garde qui refuse cette location).
function makeSingleRedirectRequest(location: string): RequestFn {
  return (_url, _options, callback) => {
    const req = fakeClientRequest();
    queueMicrotask(() => {
      const res = fakeIncomingMessage({
        statusCode: 302,
        headers: { location },
      });
      callback(res);
      queueMicrotask(() => res.emit("end"));
    });
    return req;
  };
}

test("passe guardedLookup au client https, sans que rien ne l'ecrase", async () => {
  let capturedOptions: { lookup?: unknown } | undefined;
  const requestFn: RequestFn = (_url, options, callback) => {
    capturedOptions = options as { lookup?: unknown };
    const req = fakeClientRequest();
    queueMicrotask(() => {
      const res = fakeIncomingMessage({ statusCode: 200 });
      callback(res);
      queueMicrotask(() => res.emit("end"));
    });
    return req;
  };

  const fetch = makeAvatarFetcher({ request: asHttpsRequest(requestFn) });
  await fetch(new URL("https://x/a.png"));
  assert.equal(capturedOptions?.lookup, guardedLookup);
});

test("suit une chaine de redirections jusqu'a la limite, refuse la suivante", async () => {
  const okFetch = makeAvatarFetcher({
    request: asHttpsRequest(makeRedirectChainRequest(3)),
    maxRedirects: 3,
  });
  await assert.doesNotReject(okFetch(new URL("https://x/a.png")));

  const tooLongFetch = makeAvatarFetcher({
    request: asHttpsRequest(makeRedirectChainRequest(4)),
    maxRedirects: 3,
  });
  await assert.rejects(
    tooLongFetch(new URL("https://x/a.png")),
    (error: unknown) =>
      error instanceof UnsafeAvatarUrlError &&
      /trop de redirections/.test((error as Error).message),
  );
});

test("le nombre de redirections par defaut est celui de la spec (3), sans le surcharger", async () => {
  // N'injecte que `request` : `maxRedirects` doit venir de
  // `DEFAULT_MAX_REDIRECTS`, pas d'une valeur passee par le test.
  const okFetch = makeAvatarFetcher({
    request: asHttpsRequest(makeRedirectChainRequest(3)),
  });
  await assert.doesNotReject(okFetch(new URL("https://x/a.png")));

  const tooLongFetch = makeAvatarFetcher({
    request: asHttpsRequest(makeRedirectChainRequest(4)),
  });
  await assert.rejects(
    tooLongFetch(new URL("https://x/a.png")),
    (error: unknown) =>
      error instanceof UnsafeAvatarUrlError &&
      /trop de redirections/.test((error as Error).message),
  );
});

test("refuse une redirection vers http://", async () => {
  const fetch = makeAvatarFetcher({
    request: asHttpsRequest(makeSingleRedirectRequest("http://x/a.png")),
  });
  await assert.rejects(
    fetch(new URL("https://x/a.png")),
    (error: unknown) =>
      error instanceof UnsafeAvatarUrlError &&
      /protocole refus/.test((error as Error).message),
  );
});

test("refuse une redirection vers une adresse non publique", async () => {
  const fetch = makeAvatarFetcher({
    request: asHttpsRequest(makeSingleRedirectRequest("https://127.0.0.1/a.png")),
  });
  await assert.rejects(
    fetch(new URL("https://x/a.png")),
    (error: unknown) =>
      error instanceof UnsafeAvatarUrlError &&
      /adresse non publique/.test((error as Error).message),
  );
});

test("rejette un corps qui depasse maxBytes, et detruit la requete", async () => {
  let capturedReq: ReturnType<typeof fakeClientRequest> | undefined;
  const requestFn: RequestFn = (_url, _options, callback) => {
    const req = fakeClientRequest();
    capturedReq = req;
    queueMicrotask(() => {
      const res = fakeIncomingMessage({ statusCode: 200 });
      callback(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.alloc(5));
        queueMicrotask(() => res.emit("end"));
      });
    });
    return req;
  };

  const fetch = makeAvatarFetcher({ request: asHttpsRequest(requestFn), maxBytes: 4 });
  await assert.rejects(fetch(new URL("https://x/a.png")), /trop lourde/);
  assert.equal(capturedReq?.destroyed, true);
});

test(
  "rejette par echeance un pair qui ne repond jamais",
  { timeout: 2_000 },
  async () => {
    let capturedReq: ReturnType<typeof fakeClientRequest> | undefined;
    const requestFn: RequestFn = (_url, _options, _callback) => {
      const req = fakeClientRequest();
      capturedReq = req;
      // Ne repond jamais : ni `callback(response)`, ni evenement "timeout"
      // cote socket. Ce test n'existe que pour prouver que c'est notre
      // propre echeance qui tranche, independamment de l'option `timeout`
      // d'inactivite de https.request — qu'un faux transport ne declenche
      // jamais tout seul, et qu'un pair hostile qui parle de temps en temps
      // ne declenche jamais non plus en vrai.
      return req;
    };

    const fetch = makeAvatarFetcher({ request: asHttpsRequest(requestFn), timeoutMs: 30 });
    await assert.rejects(fetch(new URL("https://x/a.png")), /d.lai d.pass/);
    assert.equal(capturedReq?.destroyed, true);
  },
);

test(
  "l'evenement 'timeout' du socket regle aussi la promesse, pas seulement l'echeance absolue",
  { timeout: 2_000 },
  async () => {
    let capturedReq: ReturnType<typeof fakeClientRequest> | undefined;
    const requestFn: RequestFn = (_url, _options, _callback) => {
      const req = fakeClientRequest();
      capturedReq = req;
      // `timeoutMs` est fixe a une heure plus bas : l'echeance absolue ne
      // peut pas gagner la course pendant la duree du test. C'est
      // l'evenement `"timeout"` ci-dessous — celui que `net.Socket` emet
      // quand expire l'option `timeout` de `https.request` — qui doit a lui
      // seul regler la promesse.
      queueMicrotask(() => req.emit("timeout"));
      return req;
    };

    const fetch = makeAvatarFetcher({
      request: asHttpsRequest(requestFn),
      timeoutMs: 60 * 60 * 1000,
    });
    await assert.rejects(fetch(new URL("https://x/a.png")), /d.lai d.pass/);
    assert.equal(capturedReq?.destroyed, true);
  },
);

// Repond `redirectCount` fois par une 302 vers la meme location, puis 200 —
// en consommant `delayMs` de temps reel avant chaque reponse, pour simuler
// une chaine de sauts qui prend du temps.
function makeSlowRedirectChainRequest(redirectCount: number, delayMs: number): RequestFn {
  let calls = 0;
  return (_url, _options, callback) => {
    calls++;
    const req = fakeClientRequest();
    const spec: FakeResponseSpec =
      calls <= redirectCount
        ? { statusCode: 302, headers: { location: "https://x/next" } }
        : { statusCode: 200 };
    setTimeout(() => {
      const res = fakeIncomingMessage(spec);
      callback(res);
      queueMicrotask(() => res.emit("end"));
    }, delayMs);
    return req;
  };
}

test(
  "l'echeance ne se rearme pas a chaque saut de redirection",
  { timeout: 5_000 },
  async () => {
    // 4 requetes (3 redirections + la reponse finale), chacune consommant
    // 80 ms de temps reel avant de repondre : environ 320 ms au total, au
    // dela du budget de 200 ms fixe une seule fois a l'entree. Aucun saut
    // pris isolement ne depasse ce budget (80 ms < 200 ms a chaque fois) :
    // seule une echeance qui traverse vraiment les sauts peut le detecter.
    const fetch = makeAvatarFetcher({
      request: asHttpsRequest(makeSlowRedirectChainRequest(3, 80)),
      timeoutMs: 200,
    });
    await assert.rejects(fetch(new URL("https://x/a.png")), /d.lai d.pass/);
  },
);
