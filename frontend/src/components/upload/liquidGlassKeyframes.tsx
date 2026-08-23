// Mantine's createStyles (built on emotion's scoped class-generation API)
// does not reliably turn a top-level `"@keyframes name": {...}` object key
// into an actual global @keyframes rule — verified empirically: with that
// pattern, `document.styleSheets` never contained the rule at all, so
// `animation-name: gentleZoom` / `glintTravel` referenced a keyframes block
// that didn't exist, and the animation silently did nothing (browsers treat
// an unresolvable animation-name as inert rather than erroring).
//
// A plain literal <style> tag sidesteps that serialization gap entirely —
// this is guaranteed-verbatim CSS text, not run through any object-styles
// pipeline. Rendered once (see SplitTransferLayout), it's just global CSS;
// BrandPanel's and GlintBorder's own createStyles calls still own the
// `animation: name …` declarations that reference these by name.
//
// @property is here for the same reason: registering --glint-angle as a
// typed <angle> is what lets the browser smoothly interpolate it through
// @keyframes at all — an unregistered custom property can only ever snap
// between values, which would make the conic-gradient in GlintBorder jump
// instead of rotate.
//
// dangerouslySetInnerHTML rather than a plain `{`…`}`} text child: the
// @property syntax string ('<angle>') contains literal angle brackets, and
// a JSX text child gets HTML-entity-escaped in the server-rendered markup
// but not when React later reconciles it client-side — a genuine content
// mismatch, not just noise, since browsers decode those entities back to
// '<angle>' when parsing the server HTML in the first place. Raw innerHTML
// assignment is identical on both sides because there's no escaping step.
const CSS = `
@property --glint-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes gentleZoom {
  from { transform: scale(1); }
  to   { transform: scale(1.07); }
}
@keyframes glintSpin {
  from { --glint-angle: 0deg; }
  to   { --glint-angle: 360deg; }
}
@keyframes buttonShimmer {
  from { background-position: 200% 0; }
  to   { background-position: -100% 0; }
}
@keyframes buttonWaitingPulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--pulse-glow-color, transparent); }
  50%      { box-shadow: 0 0 14px 3px var(--pulse-glow-color, transparent); }
}
`;

const LiquidGlassKeyframes = () => (
  <style dangerouslySetInnerHTML={{ __html: CSS }} />
);

export default LiquidGlassKeyframes;
