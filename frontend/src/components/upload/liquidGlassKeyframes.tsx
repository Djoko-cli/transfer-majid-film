// Mantine's createStyles (built on emotion's scoped class-generation API)
// does not reliably turn a top-level `"@keyframes name": {...}` object key
// into an actual global @keyframes rule — verified empirically: with that
// pattern, `document.styleSheets` never contained the rule at all, so
// `animation-name: orbitFloat` / `glintTravel` referenced a keyframes block
// that didn't exist, and the animation silently did nothing (browsers treat
// an unresolvable animation-name as inert rather than erroring).
//
// A plain literal <style> tag sidesteps that serialization gap entirely —
// this is guaranteed-verbatim CSS text, not run through any object-styles
// pipeline. Rendered once (see SplitTransferLayout), it's just global CSS;
// BrandPanel's and GlintBorder's own createStyles calls still own the
// `animation: name …` declarations that reference these by name.
const LiquidGlassKeyframes = () => (
  <style>{`
@keyframes orbitFloat {
  0%   { transform: scale(1.08) translate(0%, 0%); }
  25%  { transform: scale(1.22) translate(9%, -6%); }
  50%  { transform: scale(1.36) translate(0%, -11%); }
  75%  { transform: scale(1.22) translate(-9%, -6%); }
  100% { transform: scale(1.08) translate(0%, 0%); }
}
@keyframes glintTravel {
  to { stroke-dashoffset: -1000; }
}
`}</style>
);

export default LiquidGlassKeyframes;
