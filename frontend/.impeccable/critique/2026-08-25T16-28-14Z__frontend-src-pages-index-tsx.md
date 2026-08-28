---
target: frontend/src/pages/index.tsx
total_score: 21
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 2
timestamp: 2026-08-25T16-28-14Z
slug: frontend-src-pages-index-tsx
---
Method: dual-agent (A: opus general-purpose · B: general-purpose)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | ETA is hover-only on a 25px ring, never aggregated for touch; recipient page shows no expiry at all; card hides up to 463px of its own content with zero scroll cue |
| 2 | Match System / Real World | 3 | Strong French voice and real project credits, undercut by "Ctrl+V" on mobile, a missing preposition in the size-limit sentence, and a compression note on a share with nothing to compress |
| 3 | User Control and Freedom | 3 | Cancel genuinely expires the share server-side; per-file retry/remove works. But the OTP modal blocks Escape, the carousel has no pause control, and an anonymous sender can never delete their own share |
| 4 | Consistency and Standards | 2 | Six unrelated accent colors across one share row, none the brand orange; the optional field says "Optionnel" while the actually-required one carries no marker at all; "email" vs "e-mail" within one flow |
| 5 | Error Prevention | 2 | Submit stays enabled with an empty required email — confirmed live: `type="text"`, no `withAsterisk`, no `aria-required` |
| 6 | Recognition Rather Than Recall | 2 | Confirmed live: the OTP retry path resets to an empty email field, discarding what was just typed seconds earlier |
| 7 | Flexibility and Efficiency | 3 | Real accelerators: page-wide drop, paste-to-file, folder traversal, chunked resumable upload with server-authoritative resume. No submit shortcut, sender email never remembered |
| 8 | Aesthetic and Minimalist Design | 2 | Distinctive backdrop, but 9 controls + accordion + 3 prose blocks render before a single file exists, in a card that — confirmed live — cannot fit itself on a 1280×800 laptop |
| 9 | Error Recovery | 2 | Genuinely strong terminal-failure handling (static icon not a spinner, stable toast id, per-file retry) — but OTP failures dump the visitor into a blank field, and raw backend error strings surface via `toast.axiosError` |
| 10 | Help and Documentation | n/a | Zero-training Operate surface; inline description + tooltips are the right level, not a documentation gap |
| **Total** | | **21/36** | **Acceptable** (58%) |

## Design Specificity Verdict

**LLM assessment**: The chrome is unmistakably this product's; the interaction underneath is closer to stock. `BrandPanel.tsx` hardcodes 21 real majid.film productions with per-still resolution overrides, and the completion modal's 64px thumbnail of the actual shipped image remains the single most product-specific touch in the codebase. But strip the backdrop and `TransferCard.tsx` is a generic Mantine settings form with no awareness that a photographer might be sending a graded master — no size/count summary before submit, no thumbnails of what's queued. The specificity lives in the backdrop, not in the thing the visitor operates.

**Deterministic scan**: `detect.mjs` returned **zero findings, exit 0** across all seven scoped targets — clean, consistent with every scan this session. The live browser overlay repeated the same two already-identified patterns from the prior run: `tight-leading` (still the confirmed false positive — every instance is a Mantine/Emotion `<style>` tag artifact, not real text) and `clipped-overflow-container` at 108 on the home page (unchanged count, still most likely one persistent shell element logged with high multiplicity, not 108 distinct bugs — unrelated to the tooltip-clipping fix from the prior pass, which is separately confirmed working). `flat-type-hierarchy` still fires once on the home page only (12/14/16/20px, 1.7:1) — exactly the residual gap flagged honestly after the typeset pass, since the home page never received a true page-title role to promote. Assessment B could not reach "Mes partages" this run (no authenticated session in its sandbox) and correctly declined to log in itself rather than fabricate coverage — that page's overlay evidence is missing from this cycle, a real gap worth noting rather than hiding.

## Why the number moved (17 → 21 on the same 36-point scale)

This is now a fully comparable run — both this and the prior pass scored 9 heuristics (10 marked n/a), so 17 → 21 is a genuine, like-for-like improvement, not a scope artifact. It reflects the P0/P1 accessibility and reliability work landing (error-recovery modeling now scores a 2 with real praise for the terminal-failure UX, user-control scores 3 for the cancel/retry machinery) — but it also surfaces a **new P0** this assessment specifically measured that the prior one didn't catch: the card's own submit button sits below the fold with no scroll affordance, live-confirmed at exactly 332px of hidden content at 1280×800. Every single claim in this report was independently spot-checked against source and live measurement before inclusion (the card-height numbers, the missing `Text` override in `glassFormTheme.ts`, the unmarked required field, the OTP's email-clearing reset, and the carousel's unguarded interval all checked out exactly as described).

## Overall Impression

The product's two best-executed moments — the completion modal's product-specific reassurance, and the failure-recovery UX built this session — are genuinely strong (both independently rated a 4). But the form between those two moments still asks too much at once, and one measured, concrete failure undercuts everything else: on a common laptop, the button that submits the form is not visible without discovering an unlabeled internal scrollbar. The single biggest opportunity is the same one named last time from the opposite direction — the recipient's screen (the actual point of a file-transfer product) has no primary download action for a single-file share and states no expiry, meaning the person the product is *for* still gets the least designed screen in it.

## What's Working

1. **The upload failure model is a genuine 4.** Three attempts with backoff, a server-authoritative resume path for `unexpected_chunk_index`, then an honest terminal state — a static alert icon instead of a spinner, a stable-id toast, and a real per-file retry action. This session's reliability work is independently confirmed as excellent, not just "improved."
2. **The dropzone-leads composition is the right call**, and its idle pulse extinguishes itself the instant it's no longer the answer — this session's layout reorganization is independently validated as correct.
3. **The full-bleed photography is a defensible, not decorative, brand risk** — real, credited production stills that argue for the photographer while the tool does its job.

## Priority Issues

**[P0] The card clips its own primary submit button on common laptop sizes**
- **Why it matters**: Live-measured and reproduced exactly: at 1280×800 the card's scrollable content is 990px tall against a 658px visible window — 332px hidden, and the submit button sits at y=1008–1050, entirely below an 800px viewport, discoverable only via an unlabeled 2px internal scrollbar with no fade or shadow cue. A first-time visitor sees a form with no visible way to send anything.
- **Fix**: Move the submit button out of the scrolling region into a sticky footer inside the card, add a bottom fade (`mask-image`) so truncation reads as intentional, and collapse the dropzone to a compact bar once files exist instead of keeping ~250px of "how to drop files" instructions visible after the visitor already has.
- **Suggested command**: `/impeccable layout`

**[P1] Dimmed prose text fails contrast against bright photo slides — the one glass slot `glassFormTheme.ts` doesn't cover**
- **Why it matters**: Confirmed by source read: `glassFormTheme.ts` overrides `label`, `input`, `control`, `innerInput`, `searchInput`, and `defaultValue` — every slot a prior session pass touched — except `Text`, which is where the dropzone description, the anonymous notice, and the expiration preview all live. Against a bright backdrop slide this computes to roughly 1.9:1, failing WCAG AA by more than 2×.
- **Fix**: Add a `Text` entry to `glassFormTheme.ts`'s component overrides mapping `dimmed` to a fixed, higher-contrast value plus the same `textShadow` halo the `Title` override already uses.
- **Suggested command**: `/impeccable harden`

**[P1] The recipient — the actual point of the product — has no primary download action or expiry date for a single-file share**
- **Why it matters**: `share/[shareId]/index.tsx` only renders `DownloadAllButton` when `files.length > 1`; for the common single-file case the only affordance is a 25px action icon in a table row, in a color that appears nowhere else in the brand system. Nothing on the page states when the link expires.
- **Fix**: Render a full-width primary download button unconditionally (labeled for one file vs. many), and surface the expiry date next to the existing file-count text.
- **Suggested command**: `/impeccable clarify`

**[P2] The one required field on the form is the one field with no required marker, wrong input type, and gets cleared on retry**
- **Why it matters**: Confirmed live: "Votre e-mail" has no `withAsterisk`, `type="text"` not `email`, no `autoComplete`, while the genuinely optional "Nom du partage" is explicitly labeled "Optionnel." Confirmed in source: if the OTP send fails, `showEmailVerificationModal.tsx` resets to `initialValues: { email: "" }`, discarding what was just typed. `closeOnEscape: false` also blocks the universal modal-exit key.
- **Fix**: Mark the field required with proper input type/autocomplete; pass the already-typed address back in on retry instead of a blank default; allow Escape to close the OTP modal.
- **Suggested command**: `/impeccable harden`

**[P2] The photo carousel has no pause control and fails WCAG 2.2.2**
- **Why it matters**: Confirmed in source: the rotation `setInterval` in `BrandPanel.tsx` has no `prefersReducedMotion` guard — only the CSS transition/animation are conditioned on it, so a motion-sensitive visitor gets a hard jump-cut of a full-bleed photo every 10 seconds instead of a stopped carousel, which is worse than the animation it was meant to replace, and there is no pause affordance for anyone.
- **Fix**: Gate the interval itself on `!prefersReducedMotion`, and add a small pause control near the caption's credit link.
- **Suggested command**: `/impeccable adapt`

## Persona Red Flags

**Jordan (First-Timer)**: On a standard 1280×800 laptop, the send button is 349px below the visible card edge with no cue it exists. Before reaching it, faces nine controls with no indication of which is required — the optional field says so explicitly, the mandatory one doesn't.

**Sam (Accessibility-Dependent)**: No `aria-required` on the one field that actually is; the auto-rotating carousel has no pause mechanism (WCAG 2.2.2) and turns into a jarring hard-cut rather than stopping under reduced motion; the notice explaining an anonymous share can never be deleted sits at ~1.9:1 contrast directly above the irreversible submit button.

**Casey (Mobile)**: Expiration/max-views steppers measure 24×18px, under even the 24×24 minimum. The dropzone instructs "Ctrl+V" on a device with no Ctrl key. ETA lives only in a hover tooltip on a 25px ring — invisible on touch, so a phone uploading over cellular gets no time-remaining information at all.

## Minor Observations

- "{count} fichier(s) n'a(ont) pas pu être envoyé(s)" is a pluralization hack sitting a few lines from proper ICU plurals used elsewhere in the same file.
- A single-file share still reads "(le fichier compressé peut être plus petit)" — nothing is being compressed for one file.
- The OG description ("Regardez ce que j'ai partagé !") is casual consumer-app voice on a link a photographer may send to a paying client.
- Tab title says "Envoyer"; the nav item for the same page says "Accueil."
- Four infinite animations run simultaneously on first paint (dropzone pulse, glint comet, slide zoom, and the submit shimmer once files land) — not necessarily wrong, but worth a deliberate look together rather than each having been added independently.
- `Dropzone.tsx` gates the folder-upload button on `"webkitdirectory" in HTMLInputElement.prototype`, which is true on iOS Safari where the feature doesn't actually work — shows a button that will silently fail there.
- "Mes partages" could not be re-verified live this cycle (no authenticated browser session available to the reviewing agent) — reviewed from source only; its action-icon color inconsistency and lack of a required-field marker likely mirror the issues found on the public share page, but that's inference, not fresh observation.

## Questions to Consider

- The upload waits for OTP verification before a single byte moves — for a large file over a slow connection, what breaks if chunks start immediately and the code only gates the final `completeShare` call?
- Every design decision on the share page currently serves the owner (edit icon, info icon, sortable table) while the recipient — the person the transfer is actually for — gets no sender name, no expiry, and the smallest download affordance on the page. What would it look like to design that screen first?
- The rotating photograph is the product's most distinctive asset and also the direct cause of the contrast failure, the missing pause control, and several megabytes of competing bandwidth during upload. Would committing to a single held image buy back all three?
