import { InternalServerErrorException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cache } from "cache-manager";
import * as crypto from "crypto";
import type { Algorithm } from "jsonwebtoken";
import * as jmespath from "jmespath";
import { nanoid } from "nanoid";
import { ConfigService } from "../../config/config.service";
import { OAuthCallbackDto } from "../dto/oauthCallback.dto";
import { OAuthSignInDto } from "../dto/oauthSignIn.dto";
import { ErrorPageException } from "../exceptions/errorPage.exception";
import { OAuthProvider, OAuthToken } from "./oauthProvider.interface";

export abstract class GenericOidcProvider implements OAuthProvider<OidcToken> {
  protected discoveryUri: string;
  private configuration: OidcConfigurationCache;
  private jwk: OidcJwkCache;
  private logger: Logger = new Logger(
    Object.getPrototypeOf(this).constructor.name,
  );

  protected constructor(
    protected name: string,
    protected keyOfConfigUpdateEvents: string[],
    protected config: ConfigService,
    protected jwtService: JwtService,
    protected cache: Cache,
  ) {
    this.discoveryUri = this.getDiscoveryUri();
    this.config.addListener("update", (key: string) => {
      if (this.keyOfConfigUpdateEvents.includes(key)) {
        this.deinit();
        this.discoveryUri = this.getDiscoveryUri();
      }
    });
  }

  protected getRedirectUri(): string {
    return `${this.config.get("general.appUrl")}/api/oauth/callback/${
      this.name
    }`;
  }

  async getConfiguration(): Promise<OidcConfiguration> {
    if (!this.configuration || this.configuration.expires < Date.now()) {
      await this.fetchConfiguration();
    }
    return this.configuration.data;
  }

  async getJwk(): Promise<OidcJwk[]> {
    if (!this.jwk || this.jwk.expires < Date.now()) {
      await this.fetchJwk();
    }
    return this.jwk.data;
  }

  async getAuthEndpoint(state: string) {
    const configuration = await this.getConfiguration();
    const endpoint = configuration.authorization_endpoint;

    const nonce = nanoid();
    await this.cache.set(
      `oauth-${this.name}-nonce-${state}`,
      nonce,
      1000 * 60 * 5,
    );

    // PKCE (RFC 7636). `client_secret` alone already authenticates this
    // client as *a* legitimate one, but it's one fixed value shared by
    // every authorization attempt — it does nothing to bind a given
    // authorization code to the request that requested it. A code that
    // leaks between the redirect and the token exchange (a referrer
    // header, a proxy log, a browser-history sync) is redeemable by
    // anyone who has it. PKCE closes that: the verifier lives only in
    // this cache entry and this callback's exchange, so a stolen code is
    // useless without it. Same cache/TTL shape as the nonce above,
    // because it has the same lifetime — created here, consumed once by
    // getToken for this same `state`, never needed again.
    //
    // Sent unconditionally, with no capability check against the
    // provider's discovery document: RFC 6749 §3.1/§3.2 require both the
    // authorization and token endpoints to ignore parameters they don't
    // recognize, so a provider without PKCE support simply won't look at
    // `code_challenge` and this is a no-op against it, while one that
    // does support it gets the protection by default.
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    await this.cache.set(
      `oauth-${this.name}-verifier-${state}`,
      codeVerifier,
      1000 * 60 * 5,
    );
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    return (
      endpoint +
      "?" +
      new URLSearchParams({
        client_id: this.config.get(`oauth.${this.name}-clientId`),
        response_type: "code",
        scope:
          this.name == "oidc"
            ? this.config.get(`oauth.oidc-scope`)
            : "openid email profile",
        redirect_uri: this.getRedirectUri(),
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString()
    );
  }

  async getToken(query: OAuthCallbackDto): Promise<OAuthToken<OidcToken>> {
    const configuration = await this.getConfiguration();
    const endpoint = configuration.token_endpoint;

    // The `state` here already passed OAuthGuard's check against the
    // `oauth_${provider}_state` cookie set alongside it in getAuthEndpoint,
    // so it's the same attempt this verifier was cached for. Deleted right
    // away since, like the code itself, it's one-time-use — a retried or
    // replayed callback for the same `state` must not find it still there.
    // Its absence (cache eviction, an old link opened twice) isn't treated
    // as an error: it just means the exchange proceeds without
    // `code_verifier`, exactly as it did before PKCE existed here, and the
    // provider's own response tells the real story if it required one.
    const verifierKey = `oauth-${this.name}-verifier-${query.state}`;
    const codeVerifier = await this.cache.get<string>(verifierKey);
    await this.cache.del(verifierKey);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.get(`oauth.${this.name}-clientId`),
        client_secret: this.config.get(`oauth.${this.name}-clientSecret`),
        grant_type: "authorization_code",
        code: query.code,
        redirect_uri: this.getRedirectUri(),
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }).toString(),
    });
    const token = (await res.json()) as OidcToken;
    return {
      accessToken: token.access_token,
      expiresIn: token.expires_in,
      idToken: token.id_token,
      refreshToken: token.refresh_token,
      tokenType: token.token_type,
      rawToken: token,
    };
  }

  async getUserInfo(
    token: OAuthToken<OidcToken>,
    query: OAuthCallbackDto,
    claim?: string,
    roleConfig?: {
      path?: string;
      generalAccess?: string;
      adminAccess?: string;
    },
  ): Promise<OAuthSignInDto> {
    const idTokenData = await this.decodeIdToken(token.idToken);

    if (!idTokenData) {
      this.logger.error(
        `Can not get ID Token from response ${JSON.stringify(token.rawToken, undefined, 2)}`,
      );
      throw new InternalServerErrorException();
    }

    const key = `oauth-${this.name}-nonce-${query.state}`;
    const nonce = await this.cache.get(key);
    await this.cache.del(key);
    if (nonce !== idTokenData.nonce) {
      this.logger.error(
        `Invalid nonce. Expected ${nonce}, but got ${idTokenData.nonce}`,
      );
      throw new ErrorPageException("invalid_token");
    }

    const username = claim
      ? idTokenData[claim]
      : idTokenData.preferred_username ||
        idTokenData.name ||
        idTokenData.nickname;

    let isAdmin: boolean;

    if (roleConfig?.path) {
      // A path to read roles from the token is configured
      let roles: string[] = [];
      try {
        const rolesClaim = jmespath.search(idTokenData, roleConfig.path);
        if (Array.isArray(rolesClaim)) {
          roles = rolesClaim;
        }
      } catch {
        this.logger.warn(
          `Roles not found at path ${roleConfig.path} in ID Token ${JSON.stringify(
            idTokenData,
            undefined,
            2,
          )}`,
        );
      }

      if (
        roleConfig.generalAccess &&
        !roles.includes(roleConfig.generalAccess)
      ) {
        // Role for general access is configured and the user does not have it
        this.logger.error(
          `User roles ${roles} do not include ${roleConfig.generalAccess}`,
        );
        throw new ErrorPageException("user_not_allowed");
      }
      if (roleConfig.adminAccess) {
        // Role for admin access is configured
        isAdmin = roles.includes(roleConfig.adminAccess);
      }
    }

    if (!username) {
      this.logger.error(
        `Can not get username from ID Token ${JSON.stringify(
          idTokenData,
          undefined,
          2,
        )}`,
      );
      throw new ErrorPageException("cannot_get_user_info", undefined, [
        `provider_${this.name}`,
      ]);
    }

    if (idTokenData.email && idTokenData.email_verified === false) {
      throw new ErrorPageException("email_not_verified", "/auth/signIn", [
        `provider_${this.name}`,
      ]);
    }

    return {
      provider: this.name as any,
      email: idTokenData.email,
      providerId: idTokenData.sub,
      providerUsername: username,
      ...(isAdmin !== undefined && { isAdmin }),
      idToken: `${this.name}:${token.idToken}`,
    };
  }

  protected abstract getDiscoveryUri(): string;

  // 5s, not the runtime's own multi-minute default: fetchJwk is now on the
  // live sign-in path (decodeIdToken calls it, directly or via findJwk, on
  // every callback whose kid isn't already cached) - a provider whose
  // jwks_uri merely stalls (accepts the connection, never answers; a real,
  // common failure mode) would otherwise hang that request for as long as
  // Node's own socket timeout, rather than failing the one sign-in
  // attempt actually affected. fetchConfiguration was already reachable
  // before this session's changes (via getAuthEndpoint/getToken), but
  // gets the identical guard for the identical reason.
  private async fetchConfiguration(): Promise<void> {
    const res = await fetch(this.discoveryUri, {
      signal: AbortSignal.timeout(5000),
    });
    const expires = res.headers.has("expires")
      ? new Date(res.headers.get("expires")).getTime()
      : Date.now() + 1000 * 60 * 60 * 24;
    this.configuration = {
      expires,
      data: (await res.json()) as OidcConfiguration,
    };
  }

  private async fetchJwk(): Promise<void> {
    const configuration = await this.getConfiguration();
    const res = await fetch(configuration.jwks_uri, {
      signal: AbortSignal.timeout(5000),
    });
    const expires = res.headers.has("expires")
      ? new Date(res.headers.get("expires")).getTime()
      : Date.now() + 1000 * 60 * 60 * 24;
    this.jwk = {
      expires,
      data: (await res.json())["keys"],
    };
  }

  private deinit() {
    this.discoveryUri = undefined;
    this.configuration = undefined;
    this.jwk = undefined;
  }

  // The key the token's header names (`kid`), tried against whatever JWKS
  // is already cached first, then against one forced re-fetch if that
  // misses — a provider is free to rotate its signing keys at any time,
  // and the normal getJwk() cache (up to 24h, or whatever its own
  // `expires` header says) could easily still be serving yesterday's set
  // when a token signed with a brand-new key arrives. Only one retry:
  // this is about a legitimate rotation landing between two natural
  // cache refreshes, not a reason to hammer the provider's jwks_uri on
  // every sign-in from a kid that's simply wrong.
  private async findJwk(kid?: string): Promise<OidcJwk | undefined> {
    const cached = (await this.getJwk()).find((jwk) => jwk.kid === kid);
    if (cached) return cached;

    await this.fetchJwk();
    return this.jwk.data.find((jwk) => jwk.kid === kid);
  }

  // Verifies the ID token is what it claims to be — signed by this
  // provider's own key, for this client, not expired — rather than just
  // reading whatever claims a caller handed the redirect URI. Until
  // 2026-09-07 this only ever called jwtService.decode(), which performs
  // no verification at all (it's a base64 unpack, nothing more): the JWKS
  // this class already fetches via getJwk() was retrieved and cached but
  // never actually used for anything. Anyone able to place a request into
  // this callback flow with a forged or replayed ID token in the response
  // (a malicious or compromised "OIDC provider" the admin configured, a
  // network position between this server and the real token endpoint, or
  // a token legitimately issued by the same provider for a *different*
  // client application) would have had every claim in it - email,
  // preferred_username, and any role claim a roleConfig.path reads for
  // admin access - accepted as fact.
  //
  // node:crypto imports a JWK (RSA, EC, or OKP/EdDSA - whatever the
  // provider actually uses) directly, no extra dependency needed for
  // that step; jsonwebtoken (already a dependency via @nestjs/jwt) does
  // the actual RFC 7519 verification once handed that key as a PEM
  // public key: signature, `exp`/`nbf`, and — passed explicitly here,
  // since jsonwebtoken only checks what it's told to — `iss` against the
  // provider's own discovery document and `aud` against this app's own
  // client_id, both mandated by OpenID Connect Core 1.0 §3.1.3.7 and
  // both a forged-locally token could otherwise satisfy for free.
  //
  // `algorithms` is pinned to this ID token's own header alg, but ONLY
  // once that alg is confirmed present in the provider's own advertised
  // id_token_signing_alg_values_supported — never taken from the token
  // header on faith. Skipping that check is exactly the classic "alg
  // confusion" hole: an attacker-supplied header claiming `HS256` handed
  // to a verifier that trusts it would have jsonwebtoken treat this same
  // RSA *public* key (public, and thus already known to any attacker) as
  // an HMAC *secret* — something anyone can compute a valid signature
  // with, since the "secret" being verified against is never actually
  // secret at all in that scenario.
  private async decodeIdToken(idToken: string): Promise<OidcIdToken> {
    if (!idToken) return undefined;

    // One try/catch around the whole pipeline, not just the two steps
    // that already had their own: findJwk() alone can reach the network
    // (a cold cache, or a kid miss forcing fetchJwk's one retry) with
    // nothing catching a failure there before this existed — a stalled or
    // unreachable jwks_uri (now bounded to 5s, see fetchJwk's own
    // comment, but still a real failure to handle) would otherwise
    // propagate as a raw, uncaught error instead of the same
    // ErrorPageException every other failure in this flow degrades to.
    // ErrorPageException itself is re-thrown as-is - it's already the
    // right, specific outcome (e.g. the algorithm-not-supported check
    // just below), not a fresh error to relabel.
    try {
      const decoded = this.jwtService.decode(idToken, { complete: true }) as {
        header: { kid?: string; alg?: string };
      } | null;
      const alg = decoded?.header?.alg;

      const configuration = await this.getConfiguration();
      if (
        !alg ||
        !configuration.id_token_signing_alg_values_supported?.includes(alg)
      ) {
        this.logger.error(
          `ID Token uses algorithm "${alg}", which ${this.name} does not advertise as supported`,
        );
        throw new ErrorPageException("invalid_token");
      }

      const jwk = await this.findJwk(decoded.header.kid);
      if (!jwk) {
        this.logger.error(
          `No JWK matching kid "${decoded.header.kid}" found for ${this.name}`,
        );
        throw new ErrorPageException("invalid_token");
      }

      const publicKey = crypto
        .createPublicKey({
          key: jwk as unknown as crypto.JsonWebKey,
          format: "jwk",
        })
        .export({ type: "spki", format: "pem" }) as string;

      // Some multi-tenant providers (Microsoft's /common, /organizations,
      // /consumers endpoints - confirmed live against
      // login.microsoftonline.com/common's own discovery document)
      // publish an `issuer` that is itself a template,
      // "https://login.microsoftonline.com/{tenantid}/v2.0", rather than
      // one concrete value - "common" doesn't commit to a single tenant,
      // so the discovery document can't either. Every real token issued
      // through it has that segment filled with the signer's own tenant
      // GUID, never the literal string "{tenantid}". jsonwebtoken's own
      // issuer check is exact string equality, so handing it this
      // template verbatim (as this code did for its first few hours)
      // meant it could never match a real token - Microsoft sign-in
      // simply failed outright for anyone using the "common"/multi-
      // tenant setting, reproduced live against Microsoft's own endpoint,
      // not a hypothetical. Detected generically - any single "{...}"
      // placeholder segment, not hardcoded to Microsoft's own "tenantid"
      // spelling - since this class is shared by Google and any generic
      // OIDC provider too, and nothing about the placeholder syntax
      // itself is Microsoft-specific. This just accepts whatever real
      // value occupies the templated segment, which is exactly what
      // trusting an admin's own choice of "common" over one fixed tenant
      // already means: this check was never meant to restrict which
      // tenant can sign in (Azure AD's own app registration does that),
      // only to confirm the issuer has the expected shape for *some*
      // tenant. jsonwebtoken's own `issuer` option is a strict
      // string/string[] match with no wildcard support, so a templated
      // issuer is checked by hand against the token's real `iss`, after
      // verifyAsync has already confirmed everything else (signature,
      // exp/nbf, audience) - passing `issuer: undefined` to skip its
      // own, too-strict check for exactly this one case.
      const placeholder = configuration.issuer.match(/\{[^{}]+\}/);
      const verified = await this.jwtService.verifyAsync<OidcIdToken>(idToken, {
        publicKey,
        algorithms: [alg as Algorithm],
        issuer: placeholder ? undefined : configuration.issuer,
        audience: this.config.get(`oauth.${this.name}-clientId`),
      });

      if (placeholder) {
        const escapeRegex = (s: string) =>
          s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const [before, after] = [
          configuration.issuer.slice(0, placeholder.index),
          configuration.issuer.slice(placeholder.index + placeholder[0].length),
        ];
        const pattern = new RegExp(
          `^${escapeRegex(before)}[^/]+${escapeRegex(after)}$`,
        );
        if (!pattern.test(verified.iss)) {
          this.logger.error(
            `ID Token issuer "${verified.iss}" does not match ${this.name}'s templated issuer "${configuration.issuer}"`,
          );
          throw new ErrorPageException("invalid_token");
        }
      }

      return verified;
    } catch (e) {
      if (e instanceof ErrorPageException) throw e;
      this.logger.error(
        `ID Token verification failed for ${this.name}: ${e.message}`,
      );
      throw new ErrorPageException("invalid_token");
    }
  }
}

export interface OidcCache<T> {
  expires: number;
  data: T;
}

export interface OidcConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  response_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported?: string[];
  claims_supported?: string[];
  frontchannel_logout_supported?: boolean;
  end_session_endpoint?: string;
}

export interface OidcJwk {
  e: string;
  alg: string;
  kid: string;
  use: string;
  kty: string;
  n: string;
}

export type OidcConfigurationCache = OidcCache<OidcConfiguration>;

export type OidcJwkCache = OidcCache<OidcJwk[]>;

export interface OidcToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  id_token: string;
}

export interface OidcIdToken {
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  email: string;
  email_verified?: boolean;
  name: string;
  nickname: string;
  preferred_username: string;
  nonce: string;
}
