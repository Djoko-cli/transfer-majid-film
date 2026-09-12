import { useRouter } from "next/router";
import {
  createContext,
  ReactNode,
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
const FullBleedShell = ({ children }: { children: ReactNode }) => {
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
  const appRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <div className="runway">
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
      <div ref={appRef} className="runway-app">
        <div className="runway-page">
          <BackdropSlotContext.Provider value={active ? backdropSlot : null}>
            <TopBarSlotContext.Provider value={active ? topSlot : null}>
              <BottomBarSlotContext.Provider value={active ? bottomSlot : null}>
                {children}
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
