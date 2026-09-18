// The routes the full-bleed runway is mounted on — see
// components/core/FullBleedShell.tsx.
//
// Every page of the app, now. It began as the twelve "one card" routes the
// arrangement was designed for, and grew to the whole app on the grounds
// that a shell is only a shell if it is the same everywhere: the runway is
// what lets the header's glass run under the status bar and the footer's
// under the toolbar, and there is no page where that should not be true.
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
  // /admin/*. Four of these five come in through getLayout and mount their
  // OWN FullBleedShell inside AdminLayout, because _app's <Shell> only
  // wraps the default-layout branch and never sees them. They are listed
  // here anyway for the one other thing in _app that reads this list:
  // ModalsProvider's lockScroll. Mantine's scroll lock sets position and
  // overflow on the body, which unparks the document — so opening any modal
  // in the admin panel would otherwise drop its whole surface out from
  // under the bars. /admin/intro has no getLayout and takes the ordinary
  // route through <Shell>.
  "/admin/intro",
  "/admin/brand",
  "/admin/shares",
  "/admin/users",
  "/admin/config/[category]",
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
]);

export const isZoomLockedRoute = (pathname: string) =>
  ZOOM_LOCKED_ROUTES.has(pathname);

export const isRunwayRoute = (pathname: string) => RUNWAY_ROUTES.has(pathname);

export default RUNWAY_ROUTES;
