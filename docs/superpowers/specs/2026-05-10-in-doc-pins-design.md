# In-Doc Margin Pins for Docs Coach Suggestions

**Date:** 2026-05-10
**Status:** Approved by user, ready for implementation plan
**Scope:** This round only — chat-sidebar replacement is a separate, later effort

## Problem

Today, Docs Coach review output renders as a stack of cards in the Chrome
extension's side panel. The cards are easy to read but disconnected from the
text they describe — the reader has to mentally map each suggestion back to a
location in the document. The product goal is to feel like a coach who points
at the part of the doc that needs work, not a list of generic tips.

## Goal

Show each suggestion as a colored pin in the right margin of the open Google
Doc, anchored to the paragraph the suggestion targets. Clicking a pin opens
a card with the full suggestion and an "Apply" button that copies the
recommended revision to the user's clipboard.

## Non-goals (this round)

- Replacing the side panel with a chat input (separate later workstream).
- OAuth + Google Docs API for in-place text replacement.
- Persistence of dismissed suggestions across reviews.
- LLM / Pinecone reviewer wire-up (independent workstream).
- E2E browser test automation. Manual test plan only.

## Architecture overview

Three pieces change:

1. **API** (`apps/api/`) — `DocumentContext` accepts `paragraphs: list[str]`;
   `Suggestion` gains optional `paragraph_index` and `anchor_snippet` fields.
2. **Reviewer** (`apps/api/app/services/reviewer.py`) — picks a target
   paragraph per suggestion using a per-lens keyword-density heuristic; falls
   back to round-robin when no paragraph scores above threshold.
3. **Extension** (`extension/`) — content script extracts paragraphs with DOM
   anchors; a new overlay module renders margin pins and click-to-open cards;
   the side panel slims to doc-wide info plus a fallback toggle.

No new services, no auth, no new dependencies.

## Section 1 — API and reviewer

### Input

`DocumentContext` (Pydantic model) gains a `paragraphs` field. For backward
compatibility, the old `document_text` field remains and is split on
double-newlines into `paragraphs` if `paragraphs` isn't provided.

```python
class DocumentContext(BaseModel):
    surface: Literal['google_docs', 'notion', 'manual']
    url: str
    title: str
    paragraphs: list[str] = []      # NEW
    document_text: str | None = None  # kept for back-compat
    selected_text: str | None = None
    review_mode: Literal['auto','sop','policy','contract','proposal','memo'] = 'auto'

    @model_validator(mode='after')
    def derive_paragraphs(self):
        if not self.paragraphs and self.document_text:
            self.paragraphs = [
                p.strip()
                for p in self.document_text.split('\n\n')
                if p.strip()
            ]
        return self
```

### Output

Each `Suggestion` gains two optional fields:

```python
class Suggestion(BaseModel):
    id: str
    severity: Literal['high','medium','low']
    lens: str
    title: str
    why_it_matters: str
    recommended_revision: str
    follow_up_question: str | None = None
    paragraph_index: int | None = None   # NEW — 0-based index into paragraphs
    anchor_snippet: str | None = None    # NEW — first ~80 chars of target paragraph
```

The rest of `DocumentReviewResponse` (`readiness_score`, `route`,
`executive_summary`, `next_best_action`) is unchanged.

### Heuristic anchoring

A new module `apps/api/app/services/anchoring.py` defines a per-lens keyword
set and a `pick_paragraph_for_lens(lens, paragraphs) -> int | None`. The
function lowercases each paragraph, counts keyword occurrences, and returns
the index of the paragraph with the highest score above a minimum threshold
(default: at least one keyword match). Ties resolve to the earlier paragraph.

Initial keyword map (extend as new lenses appear):

| Lens                    | Keywords                                                            |
|-------------------------|---------------------------------------------------------------------|
| `owner_accountability`  | owner, responsible, approve, decision, team, accountable, lead      |
| `success_criteria`      | complete, done, deliver, criteria, metric, success, outcome         |
| `compliance`            | must, required, policy, shall, comply, regulation, mandatory        |
| `clarity`               | clearly, define, mean, ambiguous, vague, confusion                  |
| `reader_intent`         | reader, audience, customer, user, who                               |
| `missing_context`       | background, context, why, history, rationale                        |
| `decision_quality`      | decide, decision, choose, criteria, option, trade-off               |
| `exceptions`            | except, unless, edge case, exception, escalate                      |
| `enforcement`           | enforce, audit, monitor, review, escalate, breach                   |
| `operating_standard`    | standard, sla, sop, process, procedure, step                        |
| `policy_governance`     | governance, approval, owner, authority, scope                       |
| `risk_and_compliance`   | risk, compliance, exposure, liability, breach                       |
| `client_communication`  | client, customer, communicate, response, sla                        |

When no lens-keyword scores a paragraph, `reviewer.py` falls back to
round-robin: the suggestions are sorted by severity (high → medium → low),
then assigned to paragraphs `0, 1, 2, …, n % len(paragraphs)`. If
`paragraphs` is empty (e.g., no doc text extracted), `paragraph_index` stays
`None` and the extension renders the pin in a doc-level gutter.

`anchor_snippet` is always populated as `paragraphs[paragraph_index][:80]`
when an index is chosen, so the extension can fuzzy-match later if paragraph
order changed since review.

## Section 2 — Extension

### Content script — paragraph extraction

`extension/content-script.js` replaces `extractGoogleDocText` with
`extractGoogleDoc` that returns paragraphs alongside DOM anchors:

```js
function extractGoogleDoc() {
  const title = document.title.replace(/ - Google Docs$/, '');
  const renderers = Array.from(
    document.querySelectorAll('.kix-paragraphrenderer')
  );

  const paragraphs = [];
  const _paragraphAnchors = [];

  for (const renderer of renderers) {
    const lineBlocks = Array.from(
      renderer.querySelectorAll('.kix-lineview-text-block')
    );
    const text = lineBlocks
      .map(n => n.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    paragraphs.push(text.slice(0, MAX_PARAGRAPH_LENGTH));
    _paragraphAnchors.push(lineBlocks[lineBlocks.length - 1] || renderer);
  }

  return {
    surface: 'google_docs',
    url: window.location.href,
    title,
    paragraphs,
    selected_text: window.getSelection()?.toString()?.slice(0, 12000) || null,
    review_mode: 'auto',
    _paragraphAnchors,   // kept in-memory; stripped before sending to API
  };
}
```

The content script keeps `_paragraphAnchors` in module scope so the overlay
module can look up DOM nodes by index after the API responds.

Canvas-rendered docs have no `.kix-paragraphrenderer` nodes. When
`paragraphs.length === 0`, the content script tells the panel
`{ type: 'DOCS_COACH_CANVAS_DETECTED' }`; the panel renders a banner and the
old card list, no pins.

### Overlay module — `extension/content-script-overlay.js`

This is a new file injected alongside the content script. It owns one
root container:

```js
let root = document.getElementById('docs-coach-overlay-root');
if (!root) {
  root = document.createElement('div');
  root.id = 'docs-coach-overlay-root';
  root.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(root);
}
```

Public API:

```js
window.__docsCoach = {
  renderPins(suggestions) { /* … */ },
  clearPins() { /* … */ },
  openCard(suggestionId) { /* … */ },
};
```

`renderPins` is called after a review completes. It:

1. Calls `clearPins()` to remove any prior overlay DOM.
2. Iterates `suggestions`. For each, looks up
   `_paragraphAnchors[paragraph_index]`. If the index is out of range, tries
   fuzzy-matching `anchor_snippet` against current paragraphs (substring
   first, then a simple Levenshtein-ratio check against the first 80 chars
   of each paragraph; threshold 0.7). If still no match, the pin is rendered
   in a "general suggestions" gutter at the top-right of the doc, labeled
   `(general)`.
3. Computes pin position from `anchor.getBoundingClientRect()` plus
   `window.scrollX/Y`. The pin's horizontal position is the right edge of
   `.kix-appview-editor` plus a 12 px gap (i.e., pins sit just outside the
   doc page, in the gray gutter).
4. Inserts a pin element. Multiple suggestions on the same paragraph stack
   vertically with a 4 px gap between pins. Each pin is independently
   clickable — clicking any one opens that suggestion's card. The bottom
   pin in a stack shows a small numeric badge (`2`, `3`, …) so the user
   knows multiple suggestions live there even when not hovering.

Pin element (minimal markup):

```html
<button class="dc-pin dc-pin--high" data-suggestion="abc123">
  <span class="dc-pin__dot"></span>
</button>
```

Pin CSS lives in the same file as a `style` injection (no external file —
keeps cleanup trivial). `pointer-events: auto` on the pin itself so clicks
register even though the container is `pointer-events: none`.

Re-positioning:

```js
const repositionAll = throttle(() => { /* recompute all pin positions */ }, 50);
window.addEventListener('scroll', repositionAll, { passive: true });
new ResizeObserver(repositionAll).observe(document.body);
new MutationObserver((mutations) => {
  // If any anchor node was removed, drop its pin
}).observe(document.body, { childList: true, subtree: true });
```

### Card popup

Clicking a pin opens a single card positioned to the right of the pin (or
left if it would overflow the viewport). Click-outside or pressing Escape
closes it. Card shows: severity badge, lens name, title, why-it-matters,
recommended revision, follow-up question, and two buttons.

- **Apply** → `navigator.clipboard.writeText(suggestion.recommended_revision)`.
  On success, swap to "Copied ✓" for 2 s. On failure, render the revision in
  a selectable `<textarea>` with a "Press ⌘C to copy" hint.
- **Dismiss** → remove pin DOM and the suggestion from the in-memory list;
  closes the card.

### Side panel

`extension/sidepanel/index.html` and `panel.js` change:

- Keep: API URL input, review-mode select, **Review** button, status text.
- Keep: readiness score, executive summary, next best action — these stay
  in the panel because they describe the doc as a whole.
- Keep, but hide by default: the per-suggestion card list rendering code
  path. It stays in `panel.js` and renders to a `<div id="results">`
  container, but that container is hidden via CSS when the Pin overlay
  toggle is ON.
- Add: **"Pin overlay"** toggle (default ON). When OFF, the `results`
  container becomes visible and the old card list renders inside it. When
  ON but the doc is canvas-rendered, the panel forces the toggle off for
  this session and shows a banner explaining why.

### Message flow

```
panel.js  ──REVIEW_REQUEST──▶  background.js  ──HTTP POST──▶  API
                                     │
                                     ▼
                          DOCS_COACH_RENDER_PINS
                                     │
                                     ▼
                       content-script-overlay.js
                                (renders pins)
```

`panel.js` and the overlay both subscribe to the response. The panel always
updates its doc-level fields; the overlay only renders pins when the toggle
is on and the doc isn't canvas-rendered.

### Manifest changes

`extension/manifest.json` adds the overlay script to the existing content
scripts entry:

```json
"content_scripts": [{
  "matches": ["https://docs.google.com/document/d/*"],
  "js": ["content-script.js", "content-script-overlay.js"],
  "run_at": "document_idle"
}]
```

Web-accessible resources: none added (no separate HTML/CSS files for the
overlay — all in JS).

## Section 3 — Edge cases, errors, testing

### Edge cases

| Case | Behavior |
|------|----------|
| Doc is canvas-rendered (no `kix-` nodes) | Panel banner; falls back to old card list; no pins. |
| `paragraph_index` out of range | Fuzzy-match `anchor_snippet` against current paragraphs (threshold 0.7); on miss, render in general gutter and log a `console.warn`. |
| Scroll / resize | Throttled (50 ms) `repositionAll` runs on scroll and `ResizeObserver`. |
| User edits a paragraph after review | Pin stays on the anchor node (Google Docs preserves nodes through normal edits). If the node is destroyed, `MutationObserver` drops the pin. |
| Multiple pins on one paragraph | Stack vertically with 4 px gap; bottom pin shows a numeric badge; each pin opens its own card on click. |
| User re-runs Review | `clearPins()` first, then re-render. Dismissed state is wiped. |
| Clipboard API fails | Fall back to a selectable `<textarea>` with "Press ⌘C" hint. |
| Suggestion has no `paragraph_index` | Pin renders in the general gutter at top-right, card labeled `(general)`. |
| Non-Google-Docs page | Manifest scope prevents content script from running. |

### Error handling

- API errors → existing behavior: panel status text shows the error.
- Overlay DOM lookup failures → `try/catch` per pin; failures logged with
  `console.warn('[Docs Coach]', …)`; one bad pin never blocks the others.
- All overlay DOM lives under `#docs-coach-overlay-root` so teardown is a
  single `root.remove()`.

### Testing

1. **API unit tests** in `apps/api/tests/test_reviewer.py`:
   - Each lens with a matching paragraph → correct `paragraph_index`.
   - Lens with no matching keywords → falls back to round-robin index.
   - `document_text`-only input populates `paragraphs[]` internally
     (backward compat).
   - Each of the seven document types still produces a complete response.
   - `anchor_snippet` is the first ≤80 chars of `paragraphs[paragraph_index]`.

2. **Manual test plan** in `extension/TESTING.md`:
   - Test doc: 4 short paragraphs covering SOP, accountability, success
     criteria, compliance terms.
   - Verify pins render at correct paragraphs after Review.
   - Verify pin colors by severity (red/amber/blue).
   - Verify clipboard apply (paste somewhere, confirm text).
   - Verify dismiss removes a pin.
   - Verify scroll re-positioning stays aligned.
   - Verify re-run wipes and re-inserts pins.
   - Verify canvas-rendered fallback (test on a doc Google has canvas-rendered;
     if hard to find one, fake it by removing all `.kix-paragraphrenderer`
     elements in DevTools before clicking Review).

3. **Smoke test** at `apps/api/tests/smoke.sh`: posts a fixed three-paragraph
   payload to the live `/api/document-review` endpoint and asserts the
   response has `paragraph_index` populated on every suggestion.

## File touch list

**Backend**
- `apps/api/app/models.py` — `DocumentContext.paragraphs`, `Suggestion.paragraph_index`, `Suggestion.anchor_snippet`, back-compat validator
- `apps/api/app/services/anchoring.py` — new
- `apps/api/app/services/reviewer.py` — call `anchoring.pick_paragraph_for_lens` per suggestion; round-robin fallback; set `anchor_snippet`
- `apps/api/tests/test_reviewer.py` — new tests
- `apps/api/tests/smoke.sh` — new
- `apps/api/requirements.txt` — no change

**Extension**
- `extension/manifest.json` — add overlay script to `content_scripts.js`
- `extension/content-script.js` — paragraph extraction + structured payload
- `extension/content-script-overlay.js` — new (pin rendering, card popup, repositioning, message handlers)
- `extension/background.js` — relay `DOCS_COACH_RENDER_PINS` from panel to active tab
- `extension/sidepanel/index.html` — add Pin overlay toggle, remove card list HTML
- `extension/sidepanel/panel.js` — pin-toggle state, push suggestions to overlay, slim card-render path used only when fallback is active
- `extension/sidepanel/styles.css` — minor cleanup of removed card styles
- `extension/TESTING.md` — new

**Docs**
- `README.md` — note the new in-doc pins feature, keep existing setup steps
- `docs/superpowers/specs/2026-05-10-in-doc-pins-design.md` — this file

## Open questions (none blocking)

- Should the **Pin overlay** toggle preference persist across sessions via
  `chrome.storage.sync`? Defaulting to yes during implementation; trivial to
  reverse.
- Long-term: keyword lists in `anchoring.py` will grow ugly. When the real
  LLM reviewer lands, the LLM provides `paragraph_index` directly and this
  whole module becomes a fallback. Leaving the design as-is.
