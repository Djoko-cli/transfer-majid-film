// The routes the full-bleed runway is mounted on — see
// components/core/FullBleedShell.tsx.
//
// Deliberately a list rather than "every page in the default layout": these
// are the twelve "one card" routes, where the page is a single centred card
// of bounded height over the photograph. They are the ones the arrangement
// was designed for, and the ones whose closed height sums this session
// already re-derived (SplitTransferLayout, AuthGlassLayout).
//
// Left out on purpose, for now:
//   - the five GlassPageBackdrop pages (/account/*, /share/[id]/downloads),
//     which are ordinary long documents rather than one card;
//   - the three legal pages, which render Markdown of unbounded length and
//     bring the print question with them (the runway's content lives in a
//     fixed-height overflow box, and WebKit prints only the visible slice of
//     one — runway.style.tsx carries the @media print unwind for when they
//     do join);
//   - /admin/*, which has its own AppShell, no photograph, and no
//     --footer-height.
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
]);

export const isRunwayRoute = (pathname: string) => RUNWAY_ROUTES.has(pathname);

export default RUNWAY_ROUTES;
