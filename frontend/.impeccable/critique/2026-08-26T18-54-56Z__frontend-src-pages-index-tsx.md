---
target: frontend/src/pages/index.tsx
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-26T18-54-56Z
slug: frontend-src-pages-index-tsx
---
Method: dual-agent (A: opus general-purpose · B: general-purpose)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Card hides 332–519px of content (incl. the CTA) behind an internal scroll with no scrollbar, fade, or shadow cue |
| 2 | Match System / Real World | 2 | "15.0 GB" / "524.3 KB" render with English units and decimal points inside a `lang="fr-FR"` document — should be "15 Go" / "524,3 Ko" |
| 3 | User Control and Freedom | 1 | Per-file delete button can render entirely outside the card with a realistic filename (measured below — genuine new P0); OTP modal aborts silently on Escape |
| 4 | Consistency and Standards | 3 | The glass system is coherent on desktop but abandoned entirely for flat opaque on mobile; file-table column widths swing wildly with content |
| 5 | Error Prevention | 2 | Good pre-add size/duplicate checks, but a wrongly-added file can become unremovable (same P0 above) and 15GB can queue behind an OTP round-trip before a byte moves |
| 6 | Recognition Rather Than Recall | 2 | Expiration preview and pre-filled sender are good; the OTP forces a context-switch to email while the CTA itself is scrolled out of view |
| 7 | Flexibility and Efficiency | 3 | Real accelerators: whole-window drop, folder traversal, Ctrl+V-to-text-file, press-and-hold steppers, per-file retry, QR code. No ⌘↵ submit |
| 8 | Aesthetic and Minimalist Design | 2 | Empty state renders 20 controls across 7 groups before a single file exists — directly against the code's own comment that this content "only makes sense once files exist" |
| 9 | Error Recovery | 2 | Terminal failure state and per-file retry remain genuinely strong; but the size-limit rejection is a transient toast and the disabled CTA never explains why |
| 10 | Help and Documentation | 1 | No heading of any level exists on the page (`h1`/`h2`/`h3` count: 0); no privacy note, no "what happens to my files," nothing beyond one negative disclaimer |
| **Total** | | **20/40** | **Acceptable** (50%, bottom edge of the band) |

No heuristics marked n/a — this is a task-completion surface for anonymous first-time senders, so both Flexibility and Help/Documentation genuinely apply.

## Design Specificity Verdict

**LLM assessment**: The backdrop is genuinely specific — 21 real, credited majid.film productions with per-still responsive derivatives. But that specificity is wallpaper. Strip `BrandPanel` and swap the accent hue, and what's left is stock pingvin-share: the same generic name/message/expiration/password form any file-sharing product ships, with no vocabulary or feature from the actual craft (no master/selects/rushes framing, no thumbnail or duration in the file list, no watermark or download-tracking option). The one place the product's identity reaches functional UI — not just decoration — is the completion modal's thumbnail of the first shipped image.

**Deterministic scan**: `detect.mjs` returned **clean, exit 0** against the targeted upload and share surfaces. The live browser overlay found nothing structurally new: `tight-leading` (1021–1236 occurrences across all three inspected views) is confirmed the same false positive as every prior run — every sampled instance targets a Mantine/Emotion `<style>` tag's own CSS-source text content, not rendered copy. `clipped-overflow-container` (108, stable across all views) collapses to two real signatures: a `@property` keyframe style artifact (1×, same class of false positive), and 106× repetitions of a single `BrandPanel` carousel tile clipped by its own `overflow:hidden` — very plausibly the intended crop-to-frame behavior for a tiled photo wall rather than a bug, though intent can't be confirmed from the DOM alone. `flat-type-hierarchy` still fires once at the body level (12–20px, 1.7:1 ratio) — the same residual gap disclosed honestly since the typeset pass two cycles ago.

**One correction to Assessment A's own findings**: its minor observations list claims the "Lien"/"E-mail" mode toggle "is never used to change what actually happens — both branches submit identically." Direct backend inspection (`backend/src/share/share.service.ts:218-226`) shows this is only true when the recipients field is left empty: populating it in "E-mail" mode does trigger a real `sendMailToShareRecipients` call per address. The toggle's actual failure mode is narrower than claimed — it's not inert, it's silently inert only when the optional recipients field goes unused, which is easy to do since nothing marks it as the thing that makes the toggle matter.

## Overall Impression

The product's best-built mechanics — upload retry, reduced-motion handling, SSR/hydration discipline — are still genuinely strong and this run didn't find regressions in any of them. But this pass looked harder at things earlier cycles didn't reach (real filenames instead of short test ones, a full heading-structure check, contrast measured against the actual rotating photo rather than a flat swatch), and surfaced a new, concrete P0: with a realistic filename, the per-file delete button can render entirely outside the card, on a table with no horizontal-scroll wrapper at all. Combined with the CTA-clipping issue — the same root cause this session already fixed once, whose specific visual treatment (a dark sticky panel) was then explicitly rejected and reverted — the product currently has two distinct ways for its two primary actions (remove a wrong file, submit the form) to become unreachable on ordinary content.

## What's Working

1. **Upload failure handling is better than most commercial products.** Three retries with backoff, an honest terminal state rather than infinite silent retry, server-driven chunk resume, per-file manual retry, and a byte counter that correctly excludes failed files from "uploaded so far."
2. **WCAG 2.2.2 on the carousel is done properly, not just partially.** The rotation `setInterval` itself — not just the CSS transition — is gated on `prefers-reduced-motion` and backed by a real pause control (`BrandPanel.tsx:340-353`). Most implementations only gate the animation and leave the jump-cut running; this one was clearly found and fixed deliberately.
3. **SSR/hydration discipline throughout.** The `mounted` gate on the expiration preview and the shuffle-before-render gate on the carousel (so the eager `loading` attribute never races the wrong slide) are the kind of correctness most teams ship broken.

## Priority Issues

**[P0] The per-file delete button can render entirely outside the card with a realistic filename**
- **Why it matters**: `frontend/src/components/upload/FileList.tsx` has no `table-layout: fixed`, no explicit column widths, and — unlike the share page's own `FileList.tsx`, which wraps its table in a scrollable `overflowX: auto` box — no horizontal-scroll container at all. Under default table layout, a long filename (a filmmaker's export names routinely run 30-50+ characters) forces the table wider than the card; the actions column, including the only way to remove a wrongly-added file, gets pushed past `SplitTransferLayout`'s outer `overflow: hidden` boundary and becomes genuinely unreachable, not just hidden behind a scrollbar. Short test filenames (the kind most manual testing uses) never trigger this, which is exactly why it survived this many passes.
- **Fix**: add `table-layout: fixed` with explicit column widths (roughly 60/22/18), and on the name cell add `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` with the full name available via the existing `HoverTip` component, matching the treatment the share-page `FileList.tsx` already has.
- **Suggested command**: `/impeccable harden`

**[P0] The submit button sits below an unmarked internal scroll — this is a known regression, not a fresh find**
- **Why it matters**: `SplitTransferLayout.tsx`'s `.card` caps height and scrolls internally with no scrollbar, shadow, or fade — measured at 239-519px of hidden content depending on viewport and form state, including on a 1920×1080 display. This is the exact issue fixed earlier this session with a sticky, blurred dark footer — which was then explicitly rejected on sight ("le rectangle noir... enlève-le") and reverted. The underlying problem is real and independently re-confirmed by this fresh audit; the specific visual solution tried for it wasn't wanted.
- **Fix**: needs a different treatment than last time, not a re-application of the same one. Two options worth considering instead of a solid-color sticky panel: a `mask-image` fade at the card's bottom edge (fades the content itself rather than sitting a colored slab over it, so nothing new is "added" visually) toggled off once fully scrolled; or restructuring the empty/populated states to be short enough that the card doesn't need internal scroll at typical viewport heights in the first place (this pairs with Assessment A's broader question of whether the form needs to be fully visible before a file is even dropped).
- **Suggested command**: `/impeccable layout`

**[P1] Contrast is nondeterministic because it's computed against a rotating photo, and the focus ring can nearly disappear**
- **Why it matters**: measured against a mid-tone slide region: placeholder text at 2.06:1 (varies up to ~2.94:1 depending on the slide), the dropzone description (already using this session's hardened "dimmed" treatment) at 3.21:1 — still under the 4.5:1 text floor, and the credit link at ~1.7:1. Most strikingly, the **keyboard focus ring computes to 1.25:1** against a mid-tone slide, failing the 3:1 UI-component floor — a keyboard user's focus indicator visibly strengthens and weakens as the carousel rotates underneath it.
- **Fix**: raise the card's own tint to ≥0.82 alpha (the blur already carries the aesthetic effect; opacity is what buys legibility) and lift placeholder/link contrast to match. Give the focus ring a two-tone treatment (a white inner ring plus a colored outer glow) so at least one half always contrasts regardless of what's behind it.
- **Suggested command**: `/impeccable harden`

**[P1] Mobile drops both the product's identity and basic ergonomics**
- **Why it matters**: at 375×812 the photo — the one thing that makes this majid.film's product and not generic pingvin-share — collapses to a 240px band scrolled past in one flick and never seen again; the glass treatment is abandoned for flat opaque; and the CTA sits ~411px below the fold, roughly half the page's height. Touch targets measured under the WCAG 2.2 AA 24×24 floor: the carousel pause control (22×22) and expiration steppers (24×18).
- **Fix**: keep the photo as a fixed backdrop with the card as a scrolling sheet over it rather than letting it scroll away; sticky the CTA to the mobile viewport bottom; raise icon controls to a real 44×44 hit area via padding while keeping the smaller glyph inside.
- **Suggested command**: `/impeccable adapt`

**[P2] The "Lien" mode still hard-requires an email and OTP, and the toggle's real effect is easy to miss**
- **Why it matters**: `senderEmail` is required for every anonymous sender regardless of which mode is selected — a visitor who picks "Lien" (implying no email involved) is still walked through supplying one and fetching a code. Separately (see the correction above), the mode toggle's only real backend effect is whether the optional recipients field gets populated — when it's left empty, "E-mail" mode behaves identically to "Lien" with nothing to show for the choice.
- **Fix**: start the upload immediately on submit and run OTP verification concurrently, gating only the final `completeShare` call on the verified code, so files move while the user checks their inbox instead of before. Separately, make the recipients field visually load-bearing when "E-mail" mode is selected (e.g. required with at least one entry) so the toggle's choice always has a visible consequence.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Jordan (first-timer)**: Lands on 20 controls with zero headings anywhere on the page and no explanation of what happens to the files. The CTA is off-screen by default at every tested viewport, rendered `disabled` with no indication of what would enable it. The last line read before committing is a pure-downside disclaimer, with no reassurance anywhere on the surface.

**Sam (accessibility-dependent)**: No heading of any level to navigate by — "Téléverser des fichiers" is styled text, not a heading. The focus ring computes to 1.25:1 and visibly fluctuates with the carousel. Every backdrop photo is `alt=""` while its caption credits the work by name, so a screen reader announces an orphaned "SOVAZ, 2023" with no indication it labels an image. The OTP modal closes silently on Escape with no announcement of the aborted state.

**Casey (mobile)**: The CTA sits 411px below the fold with only two files staged. The photography — the entire point of departure from generic file-sharing tools — is a 240px band scrolled past permanently. The dropzone still advertises "Ctrl+V" on a device with no Ctrl key.

## Minor Observations

- The completion modal's header/body padding (250px combined) surrounds roughly 150px of actual content in a 480px modal — reads as a rendering fault rather than intentional balance.
- The folder-upload button sits absolutely positioned *inside* the dropzone's own hit region, opening a different file picker than the drop target it visually sits on top of.
- Forcing `prefers-color-scheme: light` still renders the app fully dark — the light branches throughout `glassFormTheme.ts` and `SplitTransferLayout.tsx` appear unreachable for anonymous visitors on this surface.
- `never_expires` only renders when `maxExpiration.value == 0`, so most visitors never see that a permanent share is even possible.
- Both stepper chevrons render at a 12px glyph size against a 24×18px control — visually near-invisible on the glass field.

## Questions to Consider

- What if the backdrop stopped being wallpaper and became the payload — the moment a file lands, cross-fading from the portfolio to the visitor's own first frame, so the photo behind the glass is the thing actually being sent?
- What if there were no form at all until after the upload started? Name derives from the files, expiration has a house default, and the email is only needed by the time `completeShare` runs — drop, bytes move immediately, and the card becomes a progress surface that asks "who's this for?" while the transfer is in flight. Nearly every cognitive-load failure and the emotional valley at the anonymous-notice disclaimer both collapse if the form stops being a gate.
- The same fact told forward instead of as a warning — "we'll email you the link, it expires in 3 days" instead of "you won't be able to delete this or see its views" — costs nothing and reads completely differently at the highest-stakes moment on the page. Worth just trying the rewrite directly?
