// The routes the full-bleed runway is mounted on — see
// components/core/FullBleedShell.tsx.
//
// Deliberately a list rather than "every page in the default layout": these
// are the twelve "one card" routes, where the page is a single centred card
// of bounded height over the photograph. They are the ones the arrangement
// was designed for, and the ones whose closed height sums this session
// already re-derived (SplitTransferLayout, AuthGlassLayout).
//
// Left out on purpose:
//   - /admin/*, which has its own AppShell with its own navigation and no
//     Footer at all, so there is nothing for the runway's two bar slots to
//     hold. It needs its own treatment, not this one.
//
// Matched against Next's `router.pathname`, i.e. the route pattern with its
// dynamic segments still in brackets — not the resolved URL — so these
// strings are compared exactly and no path parsing is needed.
const RUNWAY_ROUTES = new Set([
  // SplitTransferLayout
  "/",
  "/share/[shareId]",
  "/share/[shareId]/edit",
  // AuthGlassLayout
  "/auth/signIn",
  "/auth/signUp",
  "/auth/totp/[loginToken]",
  "/auth/resetPassword",
  "/auth/resetPassword/[resetPasswordToken]",
  "/auth/verify/[token]",
  "/auth/verify/info",
  "/contact",
  "/upload/[reverseShareToken]",
  // Plain documents in the default layout. No card and no photograph, but
  // the runway was never only about the photograph: it is what lets the
  // header's glass run under the status bar and the footer's under the
  // toolbar instead of both stopping at a flat strip. That shell should be
  // the same on every page of the app, which is the whole point of a shell.
  "/imprint",
  "/terms",
  "/privacy",
  "/upload",
  "/404",
  "/error",
  // GlassPageBackdrop pages. These have a photograph behind the glass, so
  // they are where the uniform shell is actually visible rather than a
  // one-value-in-255 difference — and they only work here because
  // GlassPageBackdrop now carries its scrim into the backdrop slot with the
  // photograph instead of leaving it behind in a fixed box.
  "/account",
  "/account/received",
  "/account/reverseShares",
  "/account/shares",
  "/share/[shareId]/downloads",
]);

// Where a pinch is refused. NOT the same list, deliberately. Zoom is refused
// because the runway derives every dimension from 100dvh and from a document
// held at a fixed scroll position, and a pinch moves the visual viewport
// underneath all of that — reported from the device as the layout
// scrabbling. That is a fair trade on a card that has nothing to magnify,
// and a bad one on a page of legal text, which is exactly what someone
// zooms. Keeping the two lists apart is what lets the shell be uniform
// without the reading pages paying for it.
const ZOOM_LOCKED_ROUTES = new Set([
  "/",
  "/share/[shareId]",
  "/share/[shareId]/edit",
  "/auth/signIn",
  "/auth/signUp",
  "/auth/totp/[loginToken]",
  "/auth/resetPassword",
  "/auth/resetPassword/[resetPasswordToken]",
  "/auth/verify/[token]",
  "/auth/verify/info",
  "/contact",
  "/upload/[reverseShareToken]",
]);

export const isZoomLockedRoute = (pathname: string) =>
  ZOOM_LOCKED_ROUTES.has(pathname);

export const isRunwayRoute = (pathname: string) => RUNWAY_ROUTES.has(pathname);

export default RUNWAY_ROUTES;
