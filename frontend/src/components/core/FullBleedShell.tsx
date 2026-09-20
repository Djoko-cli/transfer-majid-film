import { useRouter } from "next/router";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// The element the shell wants the photograph rendered into. Null wherever no
// shell is above — BrandPanel then draws in place, as it always did.
const BackdropSlotContext = createContext<HTMLElement | null>(null);
export const useBackdropSlot = () => useContext(BackdropSlotContext);

// Where a bar that must stay put while the content scrolls goes.
//
// Anchored WITHOUT `position: fixed` or `sticky`, which are the two things
// iOS Safari overrides. The document is parked and never moves, so a plain
// absolute box against this shell's own frame does not move either — and
// being neither fixed nor sticky, it keeps its blur under the status bar
// instead of being clipped and covered by an opaque colour fill.
const TopBarSlotContext = createContext<HTMLElement | null>(null);
export const useTopBarSlot = () => useContext(TopBarSlotContext);

const BottomBarSlotContext = createContext<HTMLElement | null>(null);
export const useBottomBarSlot = () => useContext(BottomBarSlotContext);

// The scroller itself, for the one thing a bar in a slot cannot work out on
// its own: whether the page under it has finished moving. The slots sit
// OUTSIDE the scroller (that is the whole point of them), so anything
// anchored there floats over content that scrolls beneath it, and a
// decoration that must not cover that content has to be able to ask. Null
// off the runway, like the slots, so a consumer's "no scroller" branch is
// also its "no runway" branch.
const RunwayScrollerContext = createContext<HTMLElement | null>(null);
export const useRunwayScroller = () => useContext(RunwayScrollerContext);

// The end of the SCROLLING content, as opposed to every slot above, which is
// anchored and stays put. A decoration portaled here travels with the page
// the way an ordinary last element would — which is the whole difference
// between the two, and the reason both exist: the footer must not move, and
// the photo credit must.
const PageEndSlotContext = createContext<HTMLElement | null>(null);
export const usePageEndSlot = () => useContext(PageEndSlotContext);

// The other half of the slot: who gets to say WHERE it is. The shell cannot
// place it itself — the app's own wrapper claims a full viewport of
// min-height and reserves a strip at its end for the floating footer, so a
// div appended after that wrapper starts below the fold and lands behind the
// bar. The one correct position is inside that wrapper, as its last child,
// which only the wrapper's own file can express.
const PageEndRegisterContext = createContext<
  ((element: HTMLElement | null) => void) | null
>(null);

/** Placed once, by the layout that owns the page's content box. */
export const PageEndSlot = () => {
  const register = useContext(PageEndRegisterContext);
  return <div ref={register ?? undefined} className="runway-page-end" />;
};

// Where the document is parked, in CSS px. Must match --runway-park in
// runway.style.tsx — the stylesheet lays the slots out around this number,
// the effect below only holds the scroll position on it.
//
// Why 120 and not the status bar's own height: the height is not readable.
// In a normal Safari tab env(safe-area-inset-top) is 0 even under
// viewport-fit=cover (measured on the device), and it differs by model
// anyway — 47px on a notch, 59px on a Dynamic Island, 62px on a 16 Pro.
// Parking further than any of them costs nothing: the backdrop reaches
// --runway-reach above the park, so the strip maps to photograph on every
// one of them.
export const RUNWAY_PARK_PX = 120;

// Must match --runway-bleed in runway.style.tsx. Exported because an
// anchored bottom bar carries this as padding, so anything measuring that
// bar's height has to subtract it to get the height a reader sees.
export const RUNWAY_BLEED_PX = 640;

// Must stay in lockstep with runway.style.tsx's own gate, which is why both
// spell out the same three tests. -webkit-touch-callout is iOS/iPadOS WebKit
// only; the coarse pointer keeps macOS Safari out even if it ever starts
// claiming the property; and the width matches Mantine's `sm` breakpoint,
// which is what every mobile branch in this app's layouts gates on — without
// it an iPad, or an iPhone turned landscape, would run the runway's geometry
// against the desktop layout branch.
export function isRunwayActive(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  return (
    CSS.supports("-webkit-touch-callout", "none") &&
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 767.98px)").matches
  );
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

// Honoured for the one animation this component starts itself — the return
// to the top of the page. Read at call time rather than cached, because the
// setting can change while a tab is open.
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Lets one photograph own the whole screen — the strips iOS Safari keeps for
 * its status bar and toolbar included.
 *
 * What was proven on the device before this existed, both in the Review app
 * this is ported from and again here against Transfer's own markup. A normal
 * Safari tab lays the page out in the rect BETWEEN the bars. At rest, the
 * strip under the status bar corresponds to document y < 0 — outside the
 * document — and WebKit paints it with the document's background COLOUR
 * only. Measured directly here: tinting `body` turned both strips that
 * colour, tinting `html` turned them that colour once `body` was
 * transparent, and tinting the photograph's own box did nothing at all.
 *
 * Every position:fixed or sticky layer is clipped to the layout viewport,
 * whatever its top or height, and one that touches an edge gets an opaque
 * native colour fill laid OVER it, sized to the strip — WKWebView's "Fixed
 * color extension fill". So no pinned layer can ever reach those strips.
 *
 * What CAN reach them: ordinary content of the scrolled document, once the
 * document has scrolled by at least the strip's height.
 *
 * So this component arranges exactly that, once, and then never lets the
 * document move again:
 *
 *   - the document is made taller than the screen by a fixed amount and
 *     parked at scrollY = --runway-park, so both strips map to real document
 *     pixels;
 *   - the photograph is an ordinary absolute layer spanning the park plus
 *     one screen plus a bleed — never fixed, never sticky — so it is
 *     stationary by construction and never earns a colour fill;
 *   - everything the page actually shows lives in an inner scroller the
 *     exact size of the layout viewport. Scrolling happens there. The
 *     document itself does not scroll, so the photograph does not either.
 *
 * Only on iOS Safari on a phone. Everywhere else the same markup collapses
 * to what it was: a viewport-fixed backdrop and the page in normal flow (see
 * .runway-* in runway.style.tsx, where every wrapper is `display: contents`
 * outside the gate). The document is kept at the park by the effect below —
 * the one thing a stylesheet cannot do.
 */
const FullBleedShell = ({
  children,
  lockZoom = true,
}: {
  children: ReactNode;
  lockZoom?: boolean;
}) => {
  // Whether the runway's own geometry is actually in force. The slots below
  // are handed out ONLY when it is: off iOS every wrapper here is
  // `display: contents`, so a bar portalled into a slot would land in normal
  // flow as a static element and add its own height to the page — measured,
  // before this gate existed, as exactly 157px of new scroll on every
  // desktop and Android viewport (the header's 60 plus the footer's 97).
  // Null slots mean Header, Footer and BrandPanel all render exactly where
  // they always did.
  //
  // State set in an effect rather than read during render: the test is
  // client-only, and the server render must agree with the client's first
  // pass.
  const [active, setActive] = useState(false);
  useEffect(() => setActive(isRunwayActive()), []);

  const [backdropSlot, setBackdropSlot] = useState<HTMLElement | null>(null);
  const [topSlot, setTopSlot] = useState<HTMLElement | null>(null);
  const [bottomSlot, setBottomSlot] = useState<HTMLElement | null>(null);
  const [pageEndSlot, setPageEndSlot] = useState<HTMLElement | null>(null);
  const appRef = useRef<HTMLDivElement | null>(null);
  // Mirrored into state as well as the ref: the effects below want it without
  // re-rendering, the context above has to re-render its consumers when it
  // arrives. One callback ref feeds both rather than two refs on one element.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const setAppNode = useCallback((node: HTMLDivElement | null) => {
    appRef.current = node;
    setScroller(node);
  }, []);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isRunwayActive()) return;

    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    let deferred: number | undefined;

    const park = () => {
      // Safari scrolls the document to lift a focused field above the soft
      // keyboard. Fighting that would put the field back under the keyboard;
      // the park is restored on blur instead.
      if (isTypingTarget(document.activeElement)) return;
      const y = window.scrollY;
      if (Math.abs(y - RUNWAY_PARK_PX) <= 0.5) return;

      // A main-frame scroll TOWARD the top can only be one thing here. Every
      // drag lands in the inner scroller, which contains its own overscroll,
      // so nothing in the page moves the document that way — except iOS's
      // own scroll-to-top gesture, the tap on the status bar. Forwarded to
      // the scroller that actually holds the page, or the gesture would be
      // silently dead.
      const app = appRef.current;
      if (y < RUNWAY_PARK_PX && app && app.scrollTop > 0) {
        app.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }

      // "instant" rather than the default "auto": a smooth re-park would
      // animate the whole photograph back into place on every stray scroll.
      window.scrollTo({ top: RUNWAY_PARK_PX, left: 0, behavior: "instant" });
    };

    // `focusout` fires BEFORE the next element takes focus, so at that
    // instant document.activeElement is <body> and park's typing guard does
    // not hold. Tapping straight from one field to the next would therefore
    // re-park the document out from under the keyboard, drop the form by the
    // height of the runway, and let Safari lift it again — a visible jump on
    // forms, which this app has everywhere. One turn later the new field is
    // focused and the guard is correct. Deferring also covers the paths
    // where relatedTarget is null, which reading the event would have
    // missed.
    const parkSoon = () => {
      window.clearTimeout(deferred);
      deferred = window.setTimeout(park, 0);
    };

    // Next's Pages router scrolls the WINDOW to 0 on every client
    // navigation (scroll: true is the default and nothing here opts out),
    // which unparks the document and makes the whole photograph jump before
    // the park pulls it back. It also never touches the inner scroller, so
    // a new page could open already scrolled to wherever the last one was
    // left. Both are handled in one place, on the same event.
    const onRouteChange = () => {
      const app = appRef.current;
      if (app) app.scrollTop = 0;
      park();
    };
    router.events.on("routeChangeComplete", onRouteChange);

    park();
    window.addEventListener("scroll", park, { passive: true });
    window.addEventListener("pageshow", park);
    window.addEventListener("resize", park);
    window.addEventListener("orientationchange", park);
    document.addEventListener("focusout", parkSoon);
    window.visualViewport?.addEventListener("resize", park);
    return () => {
      router.events.off("routeChangeComplete", onRouteChange);
      window.clearTimeout(deferred);
      window.removeEventListener("scroll", park);
      window.removeEventListener("pageshow", park);
      window.removeEventListener("resize", park);
      window.removeEventListener("orientationchange", park);
      document.removeEventListener("focusout", parkSoon);
      window.visualViewport?.removeEventListener("resize", park);
    };
  }, [router.events]);

  // Refuses to start a one-finger pan while the scroller has nothing to
  // scroll — which removes the last movement left on this surface.
  //
  // .runway-page is deliberately one pixel taller than the scroller (see
  // runway.style.tsx) so that .runway-app is always a scroll container:
  // overscroll-behavior only applies to one, and WebKit only builds a
  // scrolling node for a box with real scrollable overflow. Without that
  // pixel a drag at rest falls through to the parked document, which has
  // 760px of range, and the park yanks the whole photograph back. The pixel
  // is worth it — but it is still a pixel of real, one-way travel, and what
  // a finger notices is not the distance, it is that the surface answers and
  // then refuses. That small catch was reported from the device.
  //
  // touch-action is resolved by intersecting the values along the ancestor
  // chain, so refusing the pan here refuses it for the document too: the
  // pixel cannot be travelled and the park cannot be reached.
  //
  // `none` rather than `pinch-zoom`. This started as pinch-zoom precisely to
  // keep two-finger zoom alive, but the runway now refuses zoom outright
  // (see .runway's touch-action in runway.style.tsx and the gesture handlers
  // below), so the distinction no longer buys anything and the weaker value
  // would only suggest a capability this surface does not have.
  //
  // Deliberately conservative — only 0 or 1px counts as "nothing to scroll".
  // Getting it wrong the other way would refuse to scroll a page that
  // genuinely needs it, which is not worth risking for this.
  // Belt and braces with .runway's touch-action. iOS Safari has a long
  // history of honouring touch-action inconsistently for zoom specifically —
  // and it has ignored the viewport meta tag's user-scalable=no outright
  // since iOS 10, which is the approach most answers still recommend and the
  // reason it does not appear here. These WebKit-only gesture events are the
  // one lever that has always worked.
  //
  // Bound to the runway element, NOT to the document, so this refuses exactly
  // what the stylesheet refuses and nothing more. That distinction is not
  // theoretical: /share/[shareId] is a runway route, and the file preview it
  // opens — an <img>, a <video>, an <audio> — is a Mantine modal, which
  // portals into document.body (ModalBase defaults withinPortal: true) and is
  // therefore NOT inside .runway. The stylesheet already left it alone; a
  // document-level listener did not, and killed pinch-zoom on an image
  // preview, which is the one place on these routes where someone genuinely
  // wants to zoom. Gesture events bubble, so a pinch anywhere inside the
  // runway still reaches this; one inside a portalled modal does not.
  //
  // Non-passive listeners, necessarily: a passive listener cannot
  // preventDefault, which is the entire point.
  useEffect(() => {
    if (!isRunwayActive() || !lockZoom) return;
    const runway = runwayRef.current;
    if (!runway) return;
    const block = (e: Event) => e.preventDefault();
    const events = ["gesturestart", "gesturechange", "gestureend"];
    for (const type of events)
      runway.addEventListener(type, block, { passive: false });
    return () => {
      for (const type of events) runway.removeEventListener(type, block);
    };
  }, [lockZoom]);

  useEffect(() => {
    if (!isRunwayActive()) return;
    const app = appRef.current;
    const page = pageRef.current;
    if (!app) return;

    const sync = () => {
      const range = app.scrollHeight - app.clientHeight;
      app.style.touchAction = range <= 1 ? "none" : "";
    };
    sync();

    // No feedback loop to guard against: touch-action changes no geometry, so
    // nothing this writes can re-trigger the observer that called it.
    const observer = page ? new ResizeObserver(sync) : null;
    if (page && observer) observer.observe(page);
    // Height transitions (the advanced-options disclosure) settle after the
    // observer has already fired on the intermediate sizes; this catches the
    // final one.
    document.addEventListener("transitionend", sync, true);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      app.style.touchAction = "";
      observer?.disconnect();
      document.removeEventListener("transitionend", sync, true);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      ref={runwayRef}
      className={`runway${lockZoom ? " runway-no-zoom" : ""}`}
    >
      <div className="runway-backdrop" aria-hidden="true">
        <div
          ref={setBackdropSlot}
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        />
      </div>
      {/* Before the scroller in the DOM so a bar rendered here comes first in
          reading and tab order, and above it in paint order by z-index rather
          than by document position. Empty and zero-height unless a page fills
          it — see useTopBarSlot. */}
      <div ref={setTopSlot} className="runway-bar-slot" />
      <div ref={setAppNode} className="runway-app">
        <div ref={pageRef} className="runway-page">
          <BackdropSlotContext.Provider value={active ? backdropSlot : null}>
            <TopBarSlotContext.Provider value={active ? topSlot : null}>
              <BottomBarSlotContext.Provider value={active ? bottomSlot : null}>
                <RunwayScrollerContext.Provider
                  value={active ? scroller : null}
                >
                  <PageEndRegisterContext.Provider value={setPageEndSlot}>
                    <PageEndSlotContext.Provider
                      value={active ? pageEndSlot : null}
                    >
                      {children}
                    </PageEndSlotContext.Provider>
                  </PageEndRegisterContext.Provider>
                </RunwayScrollerContext.Provider>
              </BottomBarSlotContext.Provider>
            </TopBarSlotContext.Provider>
          </BackdropSlotContext.Provider>
        </div>
      </div>
      <div ref={setBottomSlot} className="runway-foot-slot" />
    </div>
  );
};

export default FullBleedShell;
