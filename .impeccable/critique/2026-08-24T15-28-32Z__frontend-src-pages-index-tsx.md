---
target: mon site (frontend/src/pages/index.tsx)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-24T15-28-32Z
slug: frontend-src-pages-index-tsx
---
Method: dual-agent (A: abf92d816532ff419 · B: aec47b9c81cc2f715)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Silent retry-after-5s on a failed upload chunk gives no "retrying…" signal — progress bar just stalls. |
| 2 | Match System / Real World | 3 | Warm, native French copy throughout, undercut by the share page's only heading being a raw share ID when no name was set. |
| 3 | User Control and Freedom | 3 | Completion modal is `closeOnClickOutside:false`/`closeOnEscape:false` — defensible for a one-time link, still a forced modal. |
| 4 | Consistency and Standards | 3 | Two adjacent icons both effectively mean "edit" (add/remove files vs. edit info) with no shape difference, only color + tooltip. |
| 5 | Error Prevention | 3 | Solid: yup validation, duplicate-file detection, pre-upload size checks. |
| 6 | Recognition Rather Than Recall | 1 | Blank "Nom" column on every default-mode share + icon-only action buttons force recall over recognition, on both the owner's and the recipient's surfaces. |
| 7 | Flexibility and Efficiency | 2 | No bulk actions or shortcuts on "Mes partages"; paste-to-upload/folder-upload exist but nothing accelerates managing many transfers. |
| 8 | Aesthetic and Minimalist Design | 4 | Standout — see Strengths. |
| 9 | Error Recovery | 2 | Named, human error modals for removed/not-found/restricted shares; but a wrong password dead-ends with no "contact the sender" path. |
| 10 | Help and Documentation | 1 | No help/FAQ anywhere in the product; advanced options (restrict-to-recipients, max views) have no inline explanation. |
| **Total** | | **25/40** | **Acceptable** |

Heuristics 7 and 10 apply cleanly to the owner's "operate" surfaces (upload, Mes partages) and are scored there; on the public share page alone — a single-purpose "persuade" page with one obvious action — they'd read as n/a. The table above rolls up at site level since the operate surfaces are in scope.

**Rating band**: 20–27/40 = Acceptable — significant improvements needed before users are consistently happy, but the foundation (see Aesthetic score) is real.

## Design Specificity Verdict

**LLM assessment**: Genuinely product-specific, not a re-skinned template. `BrandPanel.tsx` hardcodes 21 real, named productions with per-project responsive avif/webp derivatives, a client-only Fisher-Yates shuffle to dodge SSR hydration flicker, a Ken-Burns zoom timed against the slide-transition duration, and a `majid.film`-credited caption with `pointer-events` scoped so it never blocks the glass card above it — implementation effort no generic SaaS template carries. The glass-card system (`glassFormTheme`, `GlintBorder`, `liquidGlassKeyframes`) commits fully to its "liquid glass" concept rather than a token gesture, and the copy is warm and French-native ("Content de vous revoir," not "Welcome back"). Where it goes generic: `/account` is an undifferentiated settings form (acceptable — settings should be boring), but the completion modal, password-prompt modal, and "Mes partages" table fall back to stock Mantine patterns with none of the product's own visual voice. The craft is real but concentrated in the decorative/emotional surfaces, not the surfaces the owner actually uses to manage transfers day to day.

**Deterministic scan**: `detect.mjs` found **zero rule violations** on the markup source (`frontend/src/pages`, `frontend/src/components`, exit code 0) — no generic-template anti-patterns mechanically detected, which corroborates the specificity verdict above. The live browser injection found more, but the overwhelming majority is a **false positive**: `tight-leading` fired 463 times across the three pages checked, every single instance attributed to a `<style>` tag itself (a Mantine/Emotion CSS-in-JS injection point, never rendered), not to any real on-screen text — an artifact of how the detector walks the CSSOM, not a real density problem.

Two findings survive that scrutiny and are worth keeping:
- **`flat-type-hierarchy`** on all three pages — the live type scale spans only a 1.7–2.0:1 ratio (e.g. 11.2/12/14/16/22px on Mes partages). That's a real, narrow scale, and it lines up with the LLM assessment's read that the operate surfaces feel visually undifferentiated.
- **`clipped-overflow-container`** — 1 instance each on the home and share pages, but **106 instances of one single class** (`div.mantine-1ymorha`) on "Mes partages." Assessment B flagged this is very likely one real layout pattern (an overflow wrapper clipping a positioned child, e.g. a tooltip) repeated once per table-row icon rather than 106 independent bugs — but it's a genuine structural finding worth a visual check, not noise like the leading false positive.

`dark-glow` (one zero-offset accent-color box-shadow on the home page body) and `layout-transition` (a `width` transition, also home page) are most likely the intentional shimmer/glint effects already built and separately praised in the LLM pass — noted for completeness, not treated as defects.

## Overall Impression

The emotional/decorative layer of this product — the photography, the glass, the motion — is executed with real craft and a point of view; nothing about it reads as a template. But the two surfaces that carry the most actual weight — the page a recipient judges the transfer's legitimacy on, and the table the owner uses to manage every transfer they've ever sent — both default to showing an opaque ID and nothing else. The single biggest opportunity is closing that gap: the product already knows how to make something feel considered, it just hasn't pointed that same care at its own data.

## What's Working

1. **BrandPanel's photography system** — real, credited portfolio work with responsive derivatives, hydration-safe client shuffle, a "living" zoom tuned to the transition timing, and `prefers-reduced-motion` respected throughout. Uncommonly disciplined engineering for a purely emotional effect.
2. **The glass-card visual system** — translucent gradients, backdrop blur + saturate, a light-catching glint sweep on the ready-to-submit button, with code-level iteration visible on getting the loop-seam and focus-sync details right rather than shipping the first pass.
3. **Named, humane error states** — removed/not-found/restricted/access-denied each get their own explanation and a way out, instead of a generic 404.

## Priority Issues

**[P0] Public shares default to no name, so the single most important page shows a raw ID as its identity**
- **Why it matters**: The share page is where a first-time recipient judges whether a link is legitimate. A page whose only identity is a random alphanumeric string reads as spam at exactly the moment trust matters most. On the owner's side, it makes every transfer in "Mes partages" indistinguishable from every other one.
- **Fix**: Surface the name field regardless of Lien/E-mail mode (or auto-derive a sensible default — first filename, current date), and make it required or strongly encouraged before submit. Verified live: all 7 existing shares show a blank "Nom" column; `share/JA4rACmF` shows "JA4rACmF" as its only heading.
- **Suggested command**: `/impeccable layout` (restructure the create-share form so the name field isn't gated behind E-mail mode)

**[P1] Icon-only, unlabeled actions require memorization, with no fallback for touch**
- **Why it matters**: Both the share page's file table and "Mes partages" show 3–4 unlabeled action icons per row, meaning only exposed via hover — which doesn't exist on touch devices, the primary way most recipients open a WeTransfer-style link.
- **Fix**: Label the most consequential action (download, at minimum) or switch to a bottom-sheet/menu pattern with icon+label on narrow viewports.
- **Suggested command**: `/impeccable clarify`

**[P1] Emotionally flat completion moment for an emotionally invested product**
- **Why it matters**: This is the peak-end moment for a product built around sending someone's own creative, sometimes irreplaceable, work — and per the peak-end rule it disproportionately shapes how the whole interaction is remembered. Right now it's a copy-link field and a "Terminé" button, indistinguishable from any generic file-transfer tool's success toast, despite the visual care spent everywhere else.
- **Fix**: Show a lightweight summary (file count/size, a thumbnail if an image is among them) and a warmer confirmation line before the link/QR utility block.
- **Suggested command**: `/impeccable delight`

**[P2] Nav text contrast isn't tested against the very backdrop it's designed to sit on**
- **Why it matters**: Observed live on the "À petit feu" slide (bright dusk sky) — "Accueil"/"S'inscrire" render at very low contrast against the bright cloud region behind them, since the header relies only on `backdrop-filter: blur(18px) saturate(160%)` with no scrim. The backdrop rotates through 21 real productions with wide tonal range, so this is an intermittent, easy-to-miss-in-QA accessibility regression, not a one-off.
- **Fix**: Add a subtle fixed-opacity scrim behind header text independent of the photo, or apply the same `textShadow` technique `BrandPanel`'s own caption already uses elsewhere in this codebase.
- **Suggested command**: `/impeccable audit`

**[P3] Two adjacent "edit" icons are only distinguishable by hover**
- **Why it matters**: `TbPlusMinus` ("add/remove files") sits directly next to `TbEdit` ("modify info") on both the share page and Mes partages — both read as "edit this share," and a returning owner managing many transfers has to re-learn which does what each time.
- **Fix**: Give "add/remove files" a shape that doesn't overload with "edit" (e.g. a folder/file glyph instead of ±).
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Alex (Power User, the owner managing transfers)**: Opens "Mes partages" looking for last Tuesday's client delivery. Every row shows only an opaque ID, a blank Nom column, a visitor count, and an expiry date — nothing recognizable without opening each candidate row's info panel. No search, filter, or sort by name (sort exists on the share-page file table, not here), and no bulk actions — clearing 5 expired test shares means 5 separate confirm-modal round trips.

**Jordan (First-Timer, a recipient landing on a share link)**: Lands on `/share/JA4rACmF` and sees a heading that's literally the URL slug they just clicked — no sender name, no "who sent this" — in a nav bar showing "Se connecter / S'inscrire," which reads as a login-gated SaaS product rather than a personal delivery. If the share is password-protected and they don't have it, the password modal gives an inline "wrong password" error and no next step: no "ask the sender," no contact affordance.

**Casey (Mobile User, a recipient on a phone)**: The file-table action icons are the same tightly-packed 25px targets as desktop, no text labels, no hover fallback — download, preview, and copy-link for a given row are only distinguishable by a small color/glyph difference, in a thumb-width cluster.

## Minor Observations

- The PDF preview correctly works around Chrome's PDF-viewer/CSP-sandbox conflict via a blob URL, but shows no loading spinner while the blob fetches — a slow connection sees a blank gray box with no feedback.
- The empty state on "Mes partages" (title + description + CTA) is a complete, well-built pattern — worth reusing for the blank-Nom problem rather than leaving that cell silently empty.
- The language toggle does a full `location.reload()` on switch, which loses in-progress dropzone selections if a visitor toggles language mid-upload.
- The detector's `clipped-overflow-container` finding (106 instances on one class, "Mes partages") is worth a direct visual check — likely a tooltip or positioned action element getting clipped by the table's `overflowX: auto` wrapper, repeated once per row rather than 106 distinct bugs.
- The low type-scale ratio (`flat-type-hierarchy`, 1.7–2.0:1 across all three pages checked) reinforces the specificity verdict's read that the operate surfaces read as generic — a `/impeccable typeset` pass would directly address this.

## Questions to Consider

- If the share page is genuinely the single most important page in the product, why is naming a share opt-in, buried behind switching to E-mail mode?
- The completion modal got a tenth of the engineering care the BrandPanel did — what would it look like to close that gap?
- Given recipients are frequently on phones with no hover, is an icon-only action row the right pattern anywhere in this product?
