import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class OAuthGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provider = request.params.provider;
    // signedCookies, not cookies: this is the one thing standing between
    // "the browser that started this flow is the one finishing it" and
    // "whoever knows `state`". `state` isn't a secret held only by that
    // browser — it rides in the plaintext callback URL right alongside
    // `code`, the exact channel (proxy logs, browser-history sync, a
    // Referer header) a leak travels through — so an unsigned cookie set
    // to that same value proves nothing: anyone who captured that URL
    // already has everything needed to also send a `Cookie` header equal
    // to it themselves, no browser involved. A signed cookie can't be
    // forged that way — its value is genuinely unknown until the server
    // that generated `state` also hands it a valid signature over it, and
    // that only ever happens in the Set-Cookie response to the original
    // /auth redirect, a message a URL-only leak never carries. This is
    // also what genericOidc.provider.ts's PKCE code_verifier lookup
    // ultimately relies on: it's keyed by this same `state`, so anyone who
    // could get past this check with a leaked URL alone would retrieve the
    // verifier too — PKCE would authenticate the exchange for the wrong
    // party without this guard actually gatekeeping on browser possession.
    return (
      request.query.state === request.signedCookies[`oauth_${provider}_state`]
    );
  }
}
