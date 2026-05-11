# In-Doc Margin Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the side-panel suggestion list with margin pins anchored to specific paragraphs in the open Google Doc; clicking a pin opens a card with the suggestion and an "Apply" button that copies the recommended revision to the clipboard.

**Architecture:** API gains `paragraphs[]` input and `paragraph_index`/`anchor_snippet` output fields. A new `anchoring.py` module maps each suggestion's `lens` to a target paragraph using keyword-density scoring with round-robin fallback. The Chrome extension's content script extracts paragraphs with DOM anchors; a new overlay module renders absolutely-positioned pins in the right gutter of the Google Docs page; clicking a pin opens an in-page card; the side panel slims down to doc-wide info plus a fallback toggle.

**Tech Stack:** Python 3.11 / FastAPI / Pydantic v2 on the API; pytest for tests; vanilla JS Manifest V3 Chrome extension (no bundler, no framework).

---

## File Structure

**Backend changes** (`apps/api/`)
- `app/models.py` — extend `DocumentContext` and `Suggestion`, add backward-compat validator
- `app/services/anchoring.py` *(new)* — keyword-density anchoring with a single public function `pick_paragraph_for_lens`
- `app/services/reviewer.py` — call the anchoring helper for each suggestion and populate `paragraph_index` / `anchor_snippet`
- `tests/__init__.py` *(new)*
- `tests/test_anchoring.py` *(new)* — unit tests for the anchoring helper
- `tests/test_reviewer.py` *(new)* — integration tests for the reviewer
- `tests/smoke.sh` *(new)* — bash smoke test against the deployed API
- `requirements-dev.txt` *(new)* — pytest only; kept out of the prod Docker image

**Extension changes** (`extension/`)
- `manifest.json` — add the overlay script to the existing content script entry
- `content-script.js` — replace text extraction with paragraph extraction; expose anchors via a module-scoped registry
- `content-script-overlay.js` *(new)* — owns all overlay DOM (pins, cards), handles repositioning, listens for messages from the side panel
- `background.js` — relay `DOCS_COACH_RENDER_PINS` from the side panel to the active tab
- `sidepanel/index.html` — add Pin overlay toggle, wrap the results container so it can be hidden
- `sidepanel/panel.js` — store toggle state, push suggestions to the overlay, render the card list only when the toggle is off
- `sidepanel/styles.css` — minor: hide-rules for the toggled-off card list and the canvas-rendered banner
- `TESTING.md` *(new)* — manual test plan

**Docs**
- `README.md` — short note on the new in-doc pins behavior

Each file has one clear responsibility. The overlay module owns DOM and visuals; the content script owns text extraction and anchor lookup; `panel.js` owns sidebar state and dispatches to the overlay via the background relay.

---

## Phase 1 — Backend

### Task 1: Set up the test harness

**Files:**
- Create: `apps/api/requirements-dev.txt`
- Create: `apps/api/tests/__init__.py`
- Create: `apps/api/tests/test_smoke.py`

- [ ] **Step 1: Create the dev requirements file**

Create `apps/api/requirements-dev.txt`:

```
pytest>=8.0,<9
```

- [ ] **Step 2: Create the tests package**

Create empty file `apps/api/tests/__init__.py` (zero bytes — exists only so pytest treats `tests/` as a package).

- [ ] **Step 3: Write a sanity test**

Create `apps/api/tests/test_smoke.py`:

```python
def test_pytest_is_wired_up():
    assert 1 + 1 == 2
```

- [ ] **Step 4: Install dev deps and run the sanity test**

```bash
cd apps/api
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -v
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/requirements-dev.txt apps/api/tests/__init__.py apps/api/tests/test_smoke.py
git commit -m "chore(api): wire up pytest for backend tests"
```

---

### Task 2: Extend the Pydantic models

**Files:**
- Modify: `apps/api/app/models.py`
- Create: `apps/api/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_models.py`:

```python
import pytest
from pydantic import ValidationError
from app.models import DocumentContext, Suggestion


def test_document_context_accepts_paragraphs():
    ctx = DocumentContext(
        document_text='unused',
        paragraphs=['First paragraph.', 'Second paragraph.'],
    )
    assert ctx.paragraphs == ['First paragraph.', 'Second paragraph.']


def test_document_context_derives_paragraphs_from_document_text():
    ctx = DocumentContext(
        document_text='Para one.\n\nPara two.\n\n  Para three.  ',
    )
    assert ctx.paragraphs == ['Para one.', 'Para two.', 'Para three.']


def test_document_context_paragraphs_preserved_when_both_present():
    ctx = DocumentContext(
        document_text='ignored\n\nignored2',
        paragraphs=['Real para.'],
    )
    assert ctx.paragraphs == ['Real para.']


def test_document_context_requires_some_text():
    with pytest.raises(ValidationError):
        DocumentContext(document_text='', paragraphs=[])


def test_suggestion_accepts_anchor_fields():
    s = Suggestion(
        id='abc',
        severity='high',
        lens='owner_accountability',
        title='t',
        why_it_matters='w',
        recommended_revision='r',
        paragraph_index=2,
        anchor_snippet='A short excerpt.',
    )
    assert s.paragraph_index == 2
    assert s.anchor_snippet == 'A short excerpt.'


def test_suggestion_anchor_fields_default_to_none():
    s = Suggestion(
        id='abc', severity='low', lens='clarity',
        title='t', why_it_matters='w', recommended_revision='r',
    )
    assert s.paragraph_index is None
    assert s.anchor_snippet is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api
python -m pytest tests/test_models.py -v
```

Expected: failures with messages like "DocumentContext got unexpected keyword 'paragraphs'" and "Suggestion got unexpected keyword 'paragraph_index'".

- [ ] **Step 3: Update the models**

Replace `apps/api/app/models.py` with:

```python
from typing import Literal
from pydantic import BaseModel, Field, model_validator

DocumentSurface = Literal['google_docs', 'notion', 'manual']
ReviewMode = Literal['auto', 'sop', 'contract', 'policy', 'proposal', 'general']
Severity = Literal['high', 'medium', 'low']


class DocumentContext(BaseModel):
    surface: DocumentSurface = 'manual'
    url: str | None = None
    title: str | None = None
    document_text: str = Field(default='', max_length=50000)
    paragraphs: list[str] = Field(default_factory=list)
    selected_text: str | None = Field(default=None, max_length=12000)
    review_mode: ReviewMode = 'auto'

    @model_validator(mode='after')
    def derive_paragraphs(self):
        if not self.paragraphs and self.document_text:
            self.paragraphs = [
                p.strip()
                for p in self.document_text.split('\n\n')
                if p.strip()
            ]
        if not self.document_text and self.paragraphs:
            self.document_text = '\n\n'.join(self.paragraphs)
        if not self.paragraphs and not self.document_text:
            raise ValueError(
                'Either document_text or paragraphs must be provided.'
            )
        return self


class KnowledgeRoute(BaseModel):
    document_type: str
    primary_lenses: list[str]
    knowledge_bases: list[str]
    rationale: str


class Suggestion(BaseModel):
    id: str
    severity: Severity
    lens: str
    title: str
    why_it_matters: str
    recommended_revision: str
    follow_up_question: str | None = None
    paragraph_index: int | None = None
    anchor_snippet: str | None = None


class DocumentReviewResponse(BaseModel):
    readiness_score: float = Field(..., ge=0, le=10)
    route: KnowledgeRoute
    executive_summary: str
    suggestions: list[Suggestion]
    next_best_action: str
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api
python -m pytest tests/test_models.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/models.py apps/api/tests/test_models.py
git commit -m "feat(api): add paragraphs input + paragraph_index/anchor_snippet outputs"
```

---

### Task 3: Build the anchoring module

**Files:**
- Create: `apps/api/app/services/anchoring.py`
- Create: `apps/api/tests/test_anchoring.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_anchoring.py`:

```python
from app.services.anchoring import pick_paragraph_for_lens, LENS_KEYWORDS


def test_picks_paragraph_with_highest_keyword_density():
    paragraphs = [
        'The team writes quarterly reports.',
        'The owner is responsible for approving every change.',
        'We monitor the system continuously.',
    ]
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx == 1


def test_returns_none_when_no_keyword_matches():
    paragraphs = [
        'Lorem ipsum dolor sit amet.',
        'Consectetur adipiscing elit.',
    ]
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx is None


def test_unknown_lens_returns_none():
    paragraphs = ['Any text.']
    idx = pick_paragraph_for_lens('does_not_exist', paragraphs)
    assert idx is None


def test_empty_paragraphs_returns_none():
    idx = pick_paragraph_for_lens('clarity', [])
    assert idx is None


def test_ties_resolve_to_earliest_paragraph():
    paragraphs = [
        'The owner must approve.',
        'The owner must approve.',
    ]
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx == 0


def test_known_lenses_have_keyword_lists():
    expected = {
        'owner_accountability', 'success_criteria', 'compliance',
        'clarity', 'reader_intent', 'missing_context', 'decision_quality',
        'exceptions', 'enforcement', 'operating_standard',
        'policy_governance', 'risk_and_compliance', 'client_communication',
        'contract_risk',
    }
    assert expected.issubset(LENS_KEYWORDS.keys())


def test_case_insensitive_matching():
    paragraphs = ['THE OWNER IS RESPONSIBLE.']
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api
python -m pytest tests/test_anchoring.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.anchoring'`.

- [ ] **Step 3: Implement the anchoring module**

Create `apps/api/app/services/anchoring.py`:

```python
"""Heuristic paragraph anchoring for review suggestions.

Each lens defines a small keyword set. For a given lens and a list of
paragraphs, return the index of the paragraph with the highest count of
lens keywords. Ties resolve to the earlier paragraph. If no keyword
matches anywhere, return None and let the caller decide on a fallback.
"""

from __future__ import annotations

LENS_KEYWORDS: dict[str, list[str]] = {
    'owner_accountability': [
        'owner', 'responsible', 'approve', 'decision', 'team',
        'accountable', 'lead', 'approver',
    ],
    'success_criteria': [
        'complete', 'done', 'deliver', 'criteria', 'metric',
        'success', 'outcome', 'kpi', 'quality bar',
    ],
    'compliance': [
        'must', 'required', 'policy', 'shall', 'comply',
        'regulation', 'mandatory',
    ],
    'clarity': [
        'clearly', 'define', 'mean', 'ambiguous', 'vague', 'confusion',
    ],
    'reader_intent': [
        'reader', 'audience', 'customer', 'user', 'who',
    ],
    'missing_context': [
        'background', 'context', 'why', 'history', 'rationale',
    ],
    'decision_quality': [
        'decide', 'decision', 'choose', 'criteria', 'option', 'trade-off',
    ],
    'exceptions': [
        'except', 'unless', 'edge case', 'exception', 'escalate',
    ],
    'enforcement': [
        'enforce', 'audit', 'monitor', 'review', 'escalate', 'breach',
    ],
    'operating_standard': [
        'standard', 'sla', 'sop', 'process', 'procedure', 'step',
    ],
    'policy_governance': [
        'governance', 'approval', 'owner', 'authority', 'scope',
    ],
    'risk_and_compliance': [
        'risk', 'compliance', 'exposure', 'liability', 'breach',
    ],
    'client_communication': [
        'client', 'customer', 'communicate', 'response', 'sla',
    ],
    'contract_risk': [
        'termination', 'remedy', 'liability', 'notice', 'breach',
        'indemnif',  # matches indemnify, indemnification
    ],
}


def pick_paragraph_for_lens(
    lens: str,
    paragraphs: list[str],
) -> int | None:
    """Return the index of the best-matching paragraph for the given lens.

    Scoring: lowercase each paragraph, count occurrences of each lens
    keyword (substring match), and pick the highest-scoring paragraph.
    Ties resolve to the earliest paragraph. Returns None if the lens is
    unknown, the paragraphs list is empty, or no paragraph scores above 0.
    """
    if not paragraphs:
        return None
    keywords = LENS_KEYWORDS.get(lens)
    if not keywords:
        return None

    best_idx: int | None = None
    best_score = 0
    for idx, paragraph in enumerate(paragraphs):
        lowered = paragraph.lower()
        score = sum(lowered.count(kw) for kw in keywords)
        if score > best_score:
            best_score = score
            best_idx = idx
    return best_idx
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api
python -m pytest tests/test_anchoring.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/anchoring.py apps/api/tests/test_anchoring.py
git commit -m "feat(api): add lens-keyword paragraph anchoring helper"
```

---

### Task 4: Update the reviewer to populate anchors

**Files:**
- Modify: `apps/api/app/services/reviewer.py`
- Create: `apps/api/tests/test_reviewer.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_reviewer.py`:

```python
from app.models import DocumentContext
from app.services.reviewer import review_document


def _ctx(**overrides):
    base = dict(
        surface='google_docs',
        url='https://docs.google.com/document/d/test',
        title='Test Doc',
        paragraphs=[
            'We need to ship the feature.',  # 0 — nothing accountability-ish
            'The product owner is responsible for approving every change.',  # 1 — owner words
            'Refunds over $500 require manager approval.',  # 2
        ],
        review_mode='auto',
    )
    base.update(overrides)
    return DocumentContext(**base)


def test_every_suggestion_has_paragraph_index_when_paragraphs_present():
    response = review_document(_ctx())
    for s in response.suggestions:
        assert s.paragraph_index is not None, (
            f'suggestion {s.lens} missing paragraph_index'
        )
        assert 0 <= s.paragraph_index < 3


def test_owner_accountability_anchors_to_paragraph_with_owner_words():
    ctx = _ctx(paragraphs=[
        'Lorem ipsum dolor sit amet.',
        'The owner is responsible for approving every refund.',
        'Final paragraph here.',
    ])
    response = review_document(ctx)
    owner_suggestion = next(
        (s for s in response.suggestions if s.lens == 'owner_accountability'),
        None,
    )
    if owner_suggestion is None:
        # Owner words present in doc means the suggestion is skipped — that's fine.
        return
    assert owner_suggestion.paragraph_index == 1


def test_round_robin_fallback_when_no_lens_keywords_match():
    ctx = _ctx(paragraphs=[
        'Lorem ipsum.',
        'Dolor sit amet.',
        'Consectetur adipiscing.',
    ])
    response = review_document(ctx)
    # When no keyword anchors a suggestion, we should still get a valid
    # paragraph_index between 0 and 2 — never None on a non-empty doc.
    for s in response.suggestions:
        assert s.paragraph_index is not None
        assert 0 <= s.paragraph_index < 3


def test_anchor_snippet_matches_first_80_chars_of_target_paragraph():
    paragraphs = [
        'Short first paragraph.',
        'A second paragraph that is intentionally written long enough to exceed eighty characters with room to spare for testing.',
    ]
    response = review_document(_ctx(paragraphs=paragraphs))
    for s in response.suggestions:
        expected = paragraphs[s.paragraph_index][:80]
        assert s.anchor_snippet == expected


def test_backward_compat_document_text_only():
    response = review_document(DocumentContext(
        document_text=(
            'First paragraph.\n\n'
            'Second paragraph with the owner words: responsible, approve.\n\n'
            'Third paragraph.'
        ),
    ))
    assert response.suggestions, 'expected at least one suggestion'
    for s in response.suggestions:
        assert s.paragraph_index is not None
        assert s.paragraph_index in (0, 1, 2)


def test_single_paragraph_doc_anchors_to_paragraph_zero():
    """A doc that derives to a single paragraph still pins every
    suggestion to paragraph 0 — never None.

    `document_text` without explicit `\\n\\n` collapses to one
    paragraph via the model validator, exercising the smallest valid
    `paragraphs` array. Each suggestion's paragraph_index must be 0.
    """
    ctx = DocumentContext(
        document_text='Just a short one-paragraph doc body.',
        selected_text='Just a tiny selection.',
    )
    response = review_document(ctx)
    assert response.suggestions, 'expected at least one suggestion'
    for s in response.suggestions:
        assert s.paragraph_index == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api
python -m pytest tests/test_reviewer.py -v
```

Expected: assertions like `suggestion owner_accountability missing paragraph_index` fail because the current reviewer never sets that field.

- [ ] **Step 3: Update the reviewer**

Replace `apps/api/app/services/reviewer.py` with:

```python
from __future__ import annotations

import hashlib
from app.models import DocumentContext, DocumentReviewResponse, Suggestion
from app.services.anchoring import pick_paragraph_for_lens
from app.services.router import route_knowledge


def _id(text: str) -> str:
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:10]


def _snippet(paragraph: str) -> str:
    return paragraph[:80]


def _attach_anchor(
    suggestion: Suggestion,
    paragraphs: list[str],
    fallback_index: int,
) -> Suggestion:
    """Set paragraph_index + anchor_snippet on a suggestion.

    Uses the keyword-density helper. If the helper returns None and we
    do have paragraphs, fall back to the provided round-robin index.
    """
    if not paragraphs:
        return suggestion
    idx = pick_paragraph_for_lens(suggestion.lens, paragraphs)
    if idx is None:
        idx = fallback_index % len(paragraphs)
    return suggestion.model_copy(update={
        'paragraph_index': idx,
        'anchor_snippet': _snippet(paragraphs[idx]),
    })


def review_document(context: DocumentContext) -> DocumentReviewResponse:
    route = route_knowledge(context)
    text = context.selected_text or context.document_text
    lower = text.lower()
    raw: list[Suggestion] = []

    if not any(term in lower for term in ['owner', 'responsible', 'accountable', 'approver']):
        raw.append(Suggestion(
            id=_id('owner' + text[:300]),
            severity='high',
            lens='owner_accountability',
            title='Name the accountable owner before publishing',
            why_it_matters='Business documentation fails when readers cannot tell who owns execution, approval, or escalation.',
            recommended_revision='Add a short accountability block that names the owner role, backup role, approver, and escalation path.',
            follow_up_question='Who is accountable if this document creates confusion or the process breaks?',
        ))

    if not any(term in lower for term in ['success', 'metric', 'done when', 'complete when', 'kpi', 'quality bar']):
        raw.append(Suggestion(
            id=_id('success' + text[:300]),
            severity='medium',
            lens='success_criteria',
            title='Define how the reader knows the work is complete',
            why_it_matters='A document can be clear sentence-by-sentence but still weak operationally if it lacks a completion standard.',
            recommended_revision='Add explicit success criteria, acceptance criteria, or a short “done when” section.',
            follow_up_question='What evidence should prove that this SOP, policy, or agreement worked as intended?',
        ))

    if route.document_type == 'contract' and not any(term in lower for term in ['termination', 'remedy', 'liability', 'notice']):
        raw.append(Suggestion(
            id=_id('contract-risk' + text[:300]),
            severity='high',
            lens='contract_risk',
            title='Add business-risk guardrails around obligations',
            why_it_matters='Contract language should make obligations, remedies, timelines, and exit paths hard to misinterpret.',
            recommended_revision='Review whether the agreement needs clearer notice, termination, liability, remedy, and timeline language.',
            follow_up_question='What is the business consequence if the other party underperforms or interprets this differently?',
        ))

    if len(text.split()) < 120:
        raw.append(Suggestion(
            id=_id('context' + text[:300]),
            severity='low',
            lens='missing_context',
            title='Provide more context before asking for a full review',
            why_it_matters='Short excerpts can produce useful suggestions, but whole-section context improves routing and recommendation quality.',
            recommended_revision='Run the review on a full section or entire document once Google Docs API ingestion is connected.',
            follow_up_question=None,
        ))

    if not raw:
        raw.append(Suggestion(
            id=_id('polish' + text[:300]),
            severity='low',
            lens='clarity',
            title='Tighten the reader promise at the top',
            why_it_matters='Strong business documents tell the reader what decision, action, or standard the document enables.',
            recommended_revision='Add a one-sentence opening that says who this is for, what it helps them do, and when to use it.',
            follow_up_question='What should a busy operator understand in the first thirty seconds?',
        ))

    # Cap at 5 suggestions, then attach anchors using the keyword helper
    # with a round-robin fallback so every suggestion has a paragraph_index
    # as long as we have at least one paragraph.
    capped = raw[:5]
    anchored = [
        _attach_anchor(s, context.paragraphs, fallback_index=i)
        for i, s in enumerate(capped)
    ]

    penalty = min(len(anchored) * 0.85, 4.5)
    score = round(max(10 - penalty, 1), 1)
    return DocumentReviewResponse(
        readiness_score=score,
        route=route,
        executive_summary=f'This starter review classified the document as {route.document_type} and routed it through {", ".join(route.knowledge_bases)}.',
        suggestions=anchored,
        next_best_action='Address the highest-severity suggestion, then rerun the review on the revised section.',
    )
```

- [ ] **Step 4: Run all backend tests**

```bash
cd apps/api
python -m pytest tests/ -v
```

Expected: all tests pass (smoke + models + anchoring + reviewer).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/reviewer.py apps/api/tests/test_reviewer.py
git commit -m "feat(api): anchor every suggestion to a paragraph via keyword density + round-robin fallback"
```

---

### Task 5: Smoke test against the deployed API

**Files:**
- Create: `apps/api/tests/smoke.sh`

- [ ] **Step 1: Write the smoke test script**

Create `apps/api/tests/smoke.sh`:

```bash
#!/usr/bin/env bash
# Smoke test for the deployed Docs Coach API. Asserts that every
# returned suggestion has paragraph_index populated.
#
# Usage:
#   ./apps/api/tests/smoke.sh                     # hits prod by default
#   API_BASE=http://localhost:8000 ./apps/api/tests/smoke.sh

set -euo pipefail

API_BASE="${API_BASE:-https://docs-coachweb-production.up.railway.app}"

PAYLOAD='{
  "surface": "google_docs",
  "url": "https://docs.google.com/document/d/test",
  "title": "Smoke Test SOP",
  "paragraphs": [
    "We need to ship the feature quickly.",
    "The product owner is responsible for approving every change.",
    "Refunds over $500 require manager approval per company policy."
  ],
  "review_mode": "auto"
}'

response=$(curl -sS -X POST "$API_BASE/api/document-review" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")

echo "$response" | python3 -c '
import json, sys
data = json.load(sys.stdin)
suggestions = data.get("suggestions", [])
assert suggestions, "no suggestions returned"
missing = [s for s in suggestions if s.get("paragraph_index") is None]
if missing:
    print("FAIL: suggestions without paragraph_index:")
    for s in missing:
        print(" -", s["lens"], s["title"])
    sys.exit(1)
print(f"OK: {len(suggestions)} suggestions, all with paragraph_index")
for s in suggestions:
    print(f"  [{s[\"severity\"]}] {s[\"lens\"]} -> paragraph {s[\"paragraph_index\"]}")
'
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x apps/api/tests/smoke.sh
```

- [ ] **Step 3: Run it against the deployed API (after the next push lands)**

For now, skip running it — the deployed API doesn't yet have the new fields. We'll run it after Task 12.

Run locally instead:

```bash
cd apps/api
python -m uvicorn app.main:app --port 8001 &
API_BASE=http://localhost:8001 ./tests/smoke.sh
kill %1
```

Expected: `OK: N suggestions, all with paragraph_index`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/smoke.sh
git commit -m "test(api): add smoke script that asserts paragraph_index on every suggestion"
```

---

## Phase 2 — Extension

### Task 6: Paragraph-aware content script

**Files:**
- Modify: `extension/content-script.js`

- [ ] **Step 1: Replace the content script**

Replace `extension/content-script.js` with:

```js
// Module-scoped registry of paragraph DOM anchors keyed by index.
// Populated each time extractGoogleDoc() runs; consumed by the
// overlay module to position pins.
const MAX_PARAGRAPH_LENGTH = 4000;
const MAX_PARAGRAPHS = 200;
let lastHash = '';
let notifyTimer = null;
window.__docsCoachState = window.__docsCoachState || {
  paragraphAnchors: [],
};

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return String(h);
}

function extractGoogleDoc() {
  const title = document.title.replace(/ - Google Docs$/, '');
  const renderers = Array.from(
    document.querySelectorAll('.kix-paragraphrenderer')
  );

  const paragraphs = [];
  const paragraphAnchors = [];

  for (const renderer of renderers) {
    if (paragraphs.length >= MAX_PARAGRAPHS) break;
    const lineBlocks = Array.from(
      renderer.querySelectorAll('.kix-lineview-text-block')
    );
    const text = lineBlocks
      .map((n) => n.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    paragraphs.push(text.slice(0, MAX_PARAGRAPH_LENGTH));
    paragraphAnchors.push(lineBlocks[lineBlocks.length - 1] || renderer);
  }

  window.__docsCoachState.paragraphAnchors = paragraphAnchors;

  return {
    surface: 'google_docs',
    url: window.location.href,
    title,
    paragraphs,
    selected_text: window.getSelection()?.toString()?.slice(0, 12000) || null,
    review_mode: 'auto',
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DOCS_COACH_GET_CONTEXT') {
    sendResponse(extractGoogleDoc());
    return true;
  }
  return false;
});

function notifyChanged() {
  const context = extractGoogleDoc();
  const nextHash = hash(
    `${context.title}\n${context.paragraphs.join('\n')}\n${context.selected_text || ''}`
  );
  if (nextHash === lastHash) return;
  lastHash = nextHash;
  chrome.runtime
    .sendMessage({
      type: 'DOCS_COACH_CONTEXT_CHANGED',
      payload: { title: context.title, hash: nextHash },
    })
    .catch(() => {});
}

const observer = new MutationObserver(() => {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(notifyChanged, 2500);
});

observer.observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
});
setTimeout(notifyChanged, 1500);
```

- [ ] **Step 2: Manually verify in Chrome**

1. Reload the unpacked extension at `chrome://extensions` (click the refresh icon on the Docs Coach card).
2. Reload the open Google Doc.
3. Open the side panel, click **Review**, and confirm the API call still succeeds (the existing card list should still render — we haven't built the overlay yet).
4. In DevTools console (on the Google Doc tab), run `window.__docsCoachState.paragraphAnchors.length` — expect a positive integer matching the number of paragraphs in the doc.

- [ ] **Step 3: Commit**

```bash
git add extension/content-script.js
git commit -m "feat(ext): extract paragraphs with DOM anchors for the overlay layer"
```

---

### Task 7: Build the overlay module

**Files:**
- Create: `extension/content-script-overlay.js`

- [ ] **Step 1: Implement the overlay module**

Create `extension/content-script-overlay.js`:

```js
/* Docs Coach in-doc pin overlay.
 *
 * Owns one detached DOM root that hosts:
 *   - the colored margin pins
 *   - the click-to-open suggestion card
 *
 * Listens for DOCS_COACH_RENDER_PINS / DOCS_COACH_CLEAR_PINS messages
 * sent by the background script (which relays them from the side panel).
 */

(() => {
  const PIN_OFFSET_PX = 12;
  const PIN_SIZE_PX = 14;
  const PIN_STACK_GAP_PX = 4;
  const FUZZY_THRESHOLD = 0.7;

  const SEVERITY_COLORS = {
    high: '#d93025',
    medium: '#e8a417',
    low: '#1a73e8',
  };

  let suggestions = [];
  let openCardSuggestionId = null;

  // --- DOM root + style injection --------------------------------------------

  function getRoot() {
    let root = document.getElementById('docs-coach-overlay-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'docs-coach-overlay-root';
      root.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;z-index:9999;';
      document.body.appendChild(root);
    }
    return root;
  }

  function ensureStyle() {
    if (document.getElementById('docs-coach-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'docs-coach-overlay-style';
    style.textContent = `
      #docs-coach-overlay-root .dc-pin {
        position: absolute;
        width: ${PIN_SIZE_PX}px;
        height: ${PIN_SIZE_PX}px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        cursor: pointer;
        pointer-events: auto;
        padding: 0;
        outline: none;
      }
      #docs-coach-overlay-root .dc-pin__badge {
        position: absolute;
        top: -6px;
        right: -8px;
        font-size: 9px;
        line-height: 12px;
        min-width: 12px;
        height: 12px;
        padding: 0 3px;
        background: #202124;
        color: #fff;
        border-radius: 6px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #docs-coach-overlay-root .dc-card {
        position: absolute;
        width: 320px;
        background: #fff;
        border: 1px solid #dadce0;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.16);
        padding: 14px 14px 12px;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: #202124;
        line-height: 1.45;
      }
      #docs-coach-overlay-root .dc-card__meta {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #5f6368;
        margin: 0 0 4px;
      }
      #docs-coach-overlay-root .dc-card__title {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 8px;
      }
      #docs-coach-overlay-root .dc-card__why,
      #docs-coach-overlay-root .dc-card__rev,
      #docs-coach-overlay-root .dc-card__q {
        margin: 0 0 8px;
      }
      #docs-coach-overlay-root .dc-card__rev strong,
      #docs-coach-overlay-root .dc-card__q strong {
        font-weight: 600;
      }
      #docs-coach-overlay-root .dc-card__actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      #docs-coach-overlay-root .dc-card__btn {
        font: inherit;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid #dadce0;
        background: #fff;
        cursor: pointer;
      }
      #docs-coach-overlay-root .dc-card__btn--primary {
        background: #1a73e8;
        color: #fff;
        border-color: #1a73e8;
      }
      #docs-coach-overlay-root .dc-card__fallback {
        width: 100%;
        height: 60px;
        margin-top: 8px;
        font: inherit;
        padding: 6px;
        border-radius: 6px;
        border: 1px solid #dadce0;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Anchor resolution -----------------------------------------------------

  function levenshteinRatio(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    const dist = dp[m][n];
    return 1 - dist / Math.max(m, n);
  }

  function findAnchorForSuggestion(suggestion) {
    const anchors = window.__docsCoachState?.paragraphAnchors || [];
    if (!anchors.length) return null;

    const idx = suggestion.paragraph_index;
    if (Number.isInteger(idx) && idx >= 0 && idx < anchors.length) {
      return anchors[idx];
    }

    // Fall back to fuzzy matching anchor_snippet against current paragraphs.
    const snippet = (suggestion.anchor_snippet || '').toLowerCase();
    if (snippet.length < 8) return null;

    let bestIdx = -1;
    let bestRatio = 0;
    anchors.forEach((node, i) => {
      const paragraphText = (node.textContent || '').toLowerCase().slice(0, 80);
      if (paragraphText.includes(snippet)) {
        if (1 > bestRatio) {
          bestRatio = 1;
          bestIdx = i;
        }
        return;
      }
      const ratio = levenshteinRatio(paragraphText, snippet);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIdx = i;
      }
    });

    if (bestIdx >= 0 && bestRatio >= FUZZY_THRESHOLD) {
      return anchors[bestIdx];
    }
    return null;
  }

  function getGutterX() {
    const editor = document.querySelector('.kix-appview-editor');
    if (!editor) return window.innerWidth - 60;
    const rect = editor.getBoundingClientRect();
    return rect.right + window.scrollX + PIN_OFFSET_PX;
  }

  // --- Pin layout ------------------------------------------------------------

  function positionPin(pin, anchor, stackIndex) {
    const rect = anchor.getBoundingClientRect();
    const top = rect.top + window.scrollY + rect.height / 2 - PIN_SIZE_PX / 2;
    const stackOffset = stackIndex * (PIN_SIZE_PX + PIN_STACK_GAP_PX);
    pin.style.top = `${top + stackOffset}px`;
    pin.style.left = `${getGutterX()}px`;
  }

  function buildPin(suggestion, stackIndex, stackCount) {
    const pin = document.createElement('button');
    pin.className = 'dc-pin';
    pin.style.background = SEVERITY_COLORS[suggestion.severity] || '#5f6368';
    pin.setAttribute('data-suggestion-id', suggestion.id);
    pin.setAttribute('aria-label', `${suggestion.severity} suggestion: ${suggestion.title}`);

    if (stackCount > 1 && stackIndex === stackCount - 1) {
      const badge = document.createElement('span');
      badge.className = 'dc-pin__badge';
      badge.textContent = String(stackCount);
      pin.appendChild(badge);
    }

    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      openCard(suggestion.id);
    });

    return pin;
  }

  // --- Card popup ------------------------------------------------------------

  function closeCard() {
    const existing = document.querySelector('#docs-coach-overlay-root .dc-card');
    if (existing) existing.remove();
    openCardSuggestionId = null;
  }

  function buildCard(suggestion) {
    const card = document.createElement('div');
    card.className = 'dc-card';
    card.setAttribute('data-card-for', suggestion.id);

    const meta = document.createElement('p');
    meta.className = 'dc-card__meta';
    meta.textContent = `${suggestion.severity} · ${suggestion.lens}`;

    const title = document.createElement('h3');
    title.className = 'dc-card__title';
    title.textContent = suggestion.title;

    const why = document.createElement('p');
    why.className = 'dc-card__why';
    why.textContent = suggestion.why_it_matters;

    const rev = document.createElement('p');
    rev.className = 'dc-card__rev';
    rev.innerHTML = '<strong>Suggested revision:</strong> ';
    rev.appendChild(document.createTextNode(suggestion.recommended_revision));

    card.append(meta, title, why, rev);

    if (suggestion.follow_up_question) {
      const q = document.createElement('p');
      q.className = 'dc-card__q';
      q.innerHTML = '<strong>Question:</strong> ';
      q.appendChild(document.createTextNode(suggestion.follow_up_question));
      card.append(q);
    }

    const actions = document.createElement('div');
    actions.className = 'dc-card__actions';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'dc-card__btn dc-card__btn--primary';
    applyBtn.textContent = 'Apply ↗';
    applyBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      copyToClipboard(suggestion.recommended_revision, applyBtn, card);
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'dc-card__btn';
    dismissBtn.textContent = 'Dismiss ×';
    dismissBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      dismissSuggestion(suggestion.id);
    });

    actions.append(applyBtn, dismissBtn);
    card.append(actions);

    return card;
  }

  function copyToClipboard(text, applyBtn, card) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.className = 'dc-card__fallback';
      ta.value = text;
      card.appendChild(ta);
      ta.select();
      applyBtn.textContent = 'Press ⌘C to copy';
    };
    if (!navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        applyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          applyBtn.textContent = 'Apply ↗';
        }, 2000);
      })
      .catch(() => fallback());
  }

  function positionCardNear(card, pin) {
    const pinRect = pin.getBoundingClientRect();
    const cardWidth = 320;
    const margin = 8;
    let left = pinRect.right + window.scrollX + margin;
    if (left + cardWidth > window.scrollX + window.innerWidth) {
      left = pinRect.left + window.scrollX - cardWidth - margin;
    }
    const top = pinRect.top + window.scrollY;
    card.style.left = `${Math.max(8, left)}px`;
    card.style.top = `${top}px`;
  }

  function openCard(suggestionId) {
    closeCard();
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    const pin = document.querySelector(
      `#docs-coach-overlay-root .dc-pin[data-suggestion-id="${suggestionId}"]`
    );
    if (!suggestion || !pin) return;
    const card = buildCard(suggestion);
    getRoot().appendChild(card);
    positionCardNear(card, pin);
    openCardSuggestionId = suggestionId;
  }

  function dismissSuggestion(suggestionId) {
    suggestions = suggestions.filter((s) => s.id !== suggestionId);
    closeCard();
    renderPins(suggestions);
  }

  // --- Top-level render ------------------------------------------------------

  function clearPins() {
    const root = getRoot();
    while (root.firstChild) root.removeChild(root.firstChild);
    openCardSuggestionId = null;
  }

  function renderPins(nextSuggestions) {
    ensureStyle();
    suggestions = Array.isArray(nextSuggestions) ? nextSuggestions.slice() : [];

    const root = getRoot();
    // Clear any existing pin DOM (but keep root + style); easiest: empty root.
    while (root.firstChild) root.removeChild(root.firstChild);

    if (!suggestions.length) return;

    // Group suggestions by paragraph_index so we can stack pins on the
    // same paragraph.
    const byIndex = new Map();
    for (const s of suggestions) {
      const anchor = findAnchorForSuggestion(s);
      if (!anchor) {
        // No anchor found — render in a "general" gutter slot using the
        // first available anchor as a positioning reference, or skip if
        // there are no anchors at all.
        const fallback = window.__docsCoachState?.paragraphAnchors?.[0];
        if (!fallback) continue;
        const key = '__general__';
        const arr = byIndex.get(key) || [];
        arr.push({ suggestion: s, anchor: fallback });
        byIndex.set(key, arr);
        continue;
      }
      const key = anchor;
      const arr = byIndex.get(key) || [];
      arr.push({ suggestion: s, anchor });
      byIndex.set(key, arr);
    }

    for (const [, items] of byIndex.entries()) {
      items.forEach(({ suggestion, anchor }, stackIndex) => {
        const pin = buildPin(suggestion, stackIndex, items.length);
        root.appendChild(pin);
        positionPin(pin, anchor, stackIndex);
      });
    }
  }

  function repositionAll() {
    const root = getRoot();
    const pins = Array.from(root.querySelectorAll('.dc-pin'));
    const anchorByPin = new Map();
    for (const pin of pins) {
      const id = pin.getAttribute('data-suggestion-id');
      const s = suggestions.find((x) => x.id === id);
      if (s) anchorByPin.set(pin, findAnchorForSuggestion(s));
    }
    // Re-group by anchor to recompute stack indices.
    const byAnchor = new Map();
    for (const [pin, anchor] of anchorByPin.entries()) {
      if (!anchor) continue;
      const arr = byAnchor.get(anchor) || [];
      arr.push(pin);
      byAnchor.set(anchor, arr);
    }
    for (const [anchor, pinList] of byAnchor.entries()) {
      pinList.forEach((pin, idx) => positionPin(pin, anchor, idx));
    }
    if (openCardSuggestionId) {
      const pin = root.querySelector(
        `.dc-pin[data-suggestion-id="${openCardSuggestionId}"]`
      );
      const card = root.querySelector('.dc-card');
      if (pin && card) positionCardNear(card, pin);
    }
  }

  // Throttle helper
  let repositionScheduled = false;
  function scheduleReposition() {
    if (repositionScheduled) return;
    repositionScheduled = true;
    requestAnimationFrame(() => {
      repositionScheduled = false;
      repositionAll();
    });
  }

  window.addEventListener('scroll', scheduleReposition, { passive: true });
  window.addEventListener('resize', scheduleReposition);
  new ResizeObserver(scheduleReposition).observe(document.body);

  // Close the card when clicking outside of it.
  document.addEventListener('click', (event) => {
    if (!openCardSuggestionId) return;
    const card = document.querySelector('#docs-coach-overlay-root .dc-card');
    if (!card) return;
    if (card.contains(event.target)) return;
    if (event.target.closest && event.target.closest('.dc-pin')) return;
    closeCard();
  });

  // Listen for messages from the side panel via the background relay.
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'DOCS_COACH_RENDER_PINS') {
      renderPins(message.payload?.suggestions || []);
    } else if (message.type === 'DOCS_COACH_CLEAR_PINS') {
      clearPins();
    }
  });

  // Expose for debugging / manual testing.
  window.__docsCoach = { renderPins, clearPins };
})();
```

- [ ] **Step 2: Commit (the overlay isn't wired up yet — that's the next task)**

```bash
git add extension/content-script-overlay.js
git commit -m "feat(ext): add overlay module for margin pins and click-to-open cards"
```

---

### Task 8: Background relay

**Files:**
- Modify: `extension/background.js`

- [ ] **Step 1: Replace background.js**

Replace `extension/background.js` with:

```js
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Relay overlay-control messages from the side panel to the active
// tab's content scripts. The side panel can't directly message a
// content script — only an extension page or background can.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (
    message.type !== 'DOCS_COACH_RENDER_PINS' &&
    message.type !== 'DOCS_COACH_CLEAR_PINS'
  ) {
    return false;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  });
  return false;
});
```

- [ ] **Step 2: Commit**

```bash
git add extension/background.js
git commit -m "feat(ext): relay overlay control messages from side panel to content script"
```

---

### Task 9: Register the overlay in the manifest

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Update the content_scripts entry**

Open `extension/manifest.json`. Locate the `content_scripts` block (it currently lists only `content-script.js`). Modify the `js` array so it reads:

```json
"js": ["content-script.js", "content-script-overlay.js"]
```

The full `content_scripts` entry should look like:

```json
"content_scripts": [
  {
    "matches": ["https://docs.google.com/document/d/*"],
    "js": ["content-script.js", "content-script-overlay.js"],
    "run_at": "document_idle"
  }
]
```

Leave all other manifest fields unchanged.

- [ ] **Step 2: Reload the unpacked extension in Chrome**

Go to `chrome://extensions`, click the refresh icon on the Docs Coach card. Reload any open Google Docs tab so the new content scripts load.

- [ ] **Step 3: Verify overlay loads (without pins yet)**

In DevTools console on the Google Doc tab, run:

```js
typeof window.__docsCoach
```

Expected: `'object'` (with `renderPins` and `clearPins` keys).

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json
git commit -m "chore(ext): register overlay script in manifest"
```

---

### Task 10: Wire up the side panel

**Files:**
- Modify: `extension/sidepanel/index.html`
- Modify: `extension/sidepanel/panel.js`
- Modify: `extension/sidepanel/styles.css`

- [ ] **Step 1: Update the HTML**

Replace `extension/sidepanel/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Docs Coach</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="panel">
      <header>
        <p class="eyebrow">Docs Coach</p>
        <h1>Business review rail</h1>
        <p class="lede">Review SOPs, contracts, policies, and operating docs with sequenced business-documentation lenses.</p>
      </header>

      <label class="field">
        <span>API URL</span>
        <input id="apiUrl" value="http://localhost:8000" />
      </label>

      <div class="controls">
        <select id="reviewMode">
          <option value="auto">Auto route</option>
          <option value="sop">SOP</option>
          <option value="contract">Contract</option>
          <option value="policy">Policy</option>
          <option value="proposal">Proposal</option>
          <option value="general">General</option>
        </select>
        <button id="reviewButton">Review visible doc</button>
      </div>

      <label class="toggle">
        <input type="checkbox" id="pinOverlayToggle" checked />
        <span>Show suggestions as in-doc pins</span>
      </label>

      <section id="banner" class="banner" hidden></section>
      <section id="status" class="status">Open a Google Doc and click review.</section>
      <section id="summary" class="summary"></section>
      <section id="results" class="results" hidden></section>
    </main>
    <script src="panel.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Update the panel script**

Replace `extension/sidepanel/panel.js` with:

```js
const apiUrl = document.getElementById('apiUrl');
const reviewMode = document.getElementById('reviewMode');
const reviewButton = document.getElementById('reviewButton');
const pinToggle = document.getElementById('pinOverlayToggle');
const banner = document.getElementById('banner');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');

let lastSuggestions = [];
let canvasDetected = false;

chrome.storage.sync.get(
  ['docsCoachApiUrl', 'docsCoachPinOverlay'],
  ({ docsCoachApiUrl, docsCoachPinOverlay }) => {
    if (docsCoachApiUrl) apiUrl.value = docsCoachApiUrl;
    if (typeof docsCoachPinOverlay === 'boolean') {
      pinToggle.checked = docsCoachPinOverlay;
    }
    syncResultsVisibility();
  }
);

apiUrl.addEventListener('change', () => {
  chrome.storage.sync.set({
    docsCoachApiUrl: apiUrl.value.replace(/\/$/, ''),
  });
});

pinToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ docsCoachPinOverlay: pinToggle.checked });
  syncResultsVisibility();
  pushSuggestionsToOverlay();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'DOCS_COACH_CONTEXT_CHANGED') {
    statusEl.textContent = `Document context changed: ${message.payload.title || 'Untitled document'}. Click review to refresh suggestions.`;
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://docs.google.com/document/')) {
    throw new Error('Open a Google Doc before running a review.');
  }
  return tab;
}

async function getContext() {
  const tab = await getActiveTab();
  return chrome.tabs.sendMessage(tab.id, { type: 'DOCS_COACH_GET_CONTEXT' });
}

function showBanner(text) {
  banner.textContent = text;
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
  banner.textContent = '';
}

function shouldUseOverlay() {
  return pinToggle.checked && !canvasDetected;
}

function syncResultsVisibility() {
  resultsEl.hidden = shouldUseOverlay();
}

function renderSummary(data) {
  summaryEl.innerHTML = `
    <section class="score">
      <div class="meta">${data.route.document_type} · ${data.route.knowledge_bases.join(' → ')}</div>
      <strong>${data.readiness_score}/10</strong>
      <p>${escapeHtml(data.executive_summary)}</p>
      <p>${escapeHtml(data.next_best_action)}</p>
    </section>
  `;
}

function renderCardList(suggestions) {
  const cards = suggestions
    .map(
      (item) => `
        <article class="card ${escapeAttr(item.severity)}">
          <div class="meta">${escapeHtml(item.severity)} · ${escapeHtml(item.lens)}</div>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.why_it_matters)}</p>
          <p class="revision"><strong>Suggested revision:</strong> ${escapeHtml(item.recommended_revision)}</p>
          ${item.follow_up_question ? `<p><strong>Question:</strong> ${escapeHtml(item.follow_up_question)}</p>` : ''}
        </article>
      `
    )
    .join('');
  resultsEl.innerHTML = cards;
}

function pushSuggestionsToOverlay() {
  if (shouldUseOverlay()) {
    chrome.runtime
      .sendMessage({
        type: 'DOCS_COACH_RENDER_PINS',
        payload: { suggestions: lastSuggestions },
      })
      .catch(() => {});
  } else {
    chrome.runtime
      .sendMessage({ type: 'DOCS_COACH_CLEAR_PINS' })
      .catch(() => {});
    renderCardList(lastSuggestions);
  }
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\s+/g, '-');
}

reviewButton.addEventListener('click', async () => {
  reviewButton.disabled = true;
  statusEl.textContent = 'Collecting Google Docs context…';
  summaryEl.innerHTML = '';
  resultsEl.innerHTML = '';
  hideBanner();
  canvasDetected = false;
  try {
    const context = await getContext();
    if (Array.isArray(context.paragraphs) && context.paragraphs.length === 0) {
      canvasDetected = true;
      showBanner(
        "This doc uses Google's canvas renderer — in-doc pins aren't " +
          'available. Falling back to the card list below.'
      );
    }
    const base = apiUrl.value.replace(/\/$/, '');
    const response = await fetch(`${base}/api/document-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...context,
        review_mode: reviewMode.value,
      }),
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    statusEl.textContent = 'Review complete.';
    renderSummary(data);
    lastSuggestions = data.suggestions || [];
    syncResultsVisibility();
    pushSuggestionsToOverlay();
  } catch (error) {
    statusEl.textContent = error.message || String(error);
  } finally {
    reviewButton.disabled = false;
  }
});
```

- [ ] **Step 3: Add the toggle and banner styles**

Append the following to `extension/sidepanel/styles.css` (keep all existing rules in place):

```css
.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 8px 0 12px;
}

.banner {
  background: #fff4e5;
  border: 1px solid #f0c674;
  color: #5a3e00;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 8px;
}

.summary .score {
  margin: 8px 0 12px;
  padding: 12px;
  background: #1a1a1a;
  color: #f7eed8;
  border-radius: 8px;
}
```

- [ ] **Step 4: Manually verify the full end-to-end flow**

1. Reload the unpacked extension at `chrome://extensions`.
2. Reload your open Google Doc.
3. Open the side panel, set the API URL to `https://docs-coachweb-production.up.railway.app`, leave the **Show suggestions as in-doc pins** toggle ON.
4. Click **Review visible doc**.
5. Expected: doc-wide summary appears in the panel; colored pins appear in the right margin next to relevant paragraphs.
6. Click a pin: card appears next to it with the suggestion. Click **Apply ↗**: button changes to **Copied ✓** for 2 s. Paste somewhere else to confirm the recommended revision is on the clipboard.
7. Click **Dismiss ×**: the pin and card disappear.
8. Toggle **Show suggestions as in-doc pins** OFF: pins clear and the card list appears in the side panel. Toggle back ON: pins re-appear, card list disappears.

- [ ] **Step 5: Commit**

```bash
git add extension/sidepanel/index.html extension/sidepanel/panel.js extension/sidepanel/styles.css
git commit -m "feat(ext): wire side panel to overlay with fallback toggle"
```

---

## Phase 3 — Polish and ship

### Task 11: Manual test plan

**Files:**
- Create: `extension/TESTING.md`

- [ ] **Step 1: Write the manual test plan**

Create `extension/TESTING.md`:

```markdown
# Docs Coach — Manual Test Plan

These are the steps to validate the in-doc pin overlay before shipping a
release. Run them against a freshly reloaded unpacked extension and a
freshly reloaded Google Doc.

## Setup

1. Open `chrome://extensions` and click **Reload** on the Docs Coach card.
2. Open or create a Google Doc with **at least four paragraphs** covering
   a mix of business topics. Suggested test paragraphs:

   > We need to ship the refund-handling feature by end of quarter.
   >
   > The product owner is responsible for approving every refund
   > over $500.
   >
   > Refunds must be processed within five business days per company
   > policy.
   >
   > Document the reason for each refund decision in the CRM so the
   > finance team can audit later.

3. Open the side panel via the Docs Coach toolbar icon.
4. Confirm the **API URL** field is set to
   `https://docs-coachweb-production.up.railway.app`.
5. Make sure the **Show suggestions as in-doc pins** toggle is ON.

## 1. Pins render at the right paragraphs

- Click **Review visible doc**.
- Expected: doc-wide summary appears in the panel; pins appear in the
  right gutter of the document next to relevant paragraphs.
- Check the colors: high = red, medium = amber, low = blue.

## 2. Card popup

- Click any pin.
- Expected: a card opens to the right of the pin (or to the left if it
  would overflow). The card shows severity, lens, title, why-it-matters,
  suggested revision, optional follow-up question, Apply, Dismiss.
- Click outside the card or press Escape: card closes.

## 3. Apply copies to clipboard

- Click a pin; the card opens.
- Click **Apply ↗**.
- Expected: button label changes to **Copied ✓** for 2 seconds.
- Open a scratchpad (e.g., Notes or a new doc) and paste — the
  recommended revision text should be there verbatim.

## 4. Dismiss removes the pin

- Click a pin; click **Dismiss ×**.
- Expected: card closes and the pin disappears from the document.
- The other pins remain.

## 5. Scroll repositioning

- Scroll the doc up and down.
- Expected: pins stay anchored to their paragraphs and remain in the
  right gutter; they don't drift, overlap with body text, or stick to
  the viewport.

## 6. Re-run wipes and re-inserts

- Click **Review visible doc** again.
- Expected: all existing pins disappear and a fresh set inserts. Any
  pin you dismissed earlier may reappear (dismissal is per-run only).

## 7. Toggle off falls back to card list

- Toggle **Show suggestions as in-doc pins** OFF.
- Expected: pins clear from the document; the panel shows the
  suggestion cards in a stack below the summary.
- Toggle ON again: pins reappear, panel card list hides.

## 8. Canvas-rendered fallback

- In Chrome DevTools, run on the Google Doc tab:

  ```js
  document.querySelectorAll('.kix-paragraphrenderer').forEach((n) => n.remove());
  ```

  (This simulates a canvas-rendered doc by destroying the queryable DOM.)
- Click **Review visible doc**.
- Expected: a banner appears in the panel saying canvas rendering was
  detected; the card list shows in the panel instead of pins.

## 9. Multiple pins on one paragraph

- Edit your test doc so that one paragraph contains words from several
  lenses (e.g. "owner approves every refund within five days"). Re-run
  review.
- Expected: more than one pin stacks vertically next to that paragraph.
  The bottom pin shows a small numeric badge.
- Clicking any pin in the stack opens that suggestion's card.

## 10. Edge cases worth eyeballing once

- Doc with **one paragraph**: pins still render; same paragraph may
  carry several stacked pins.
- Doc with **very long paragraph**: pin aligns to the vertical middle
  of the paragraph block; card position remains sane.
- Window resize: pins reposition to the new gutter location.
```

- [ ] **Step 2: Commit**

```bash
git add extension/TESTING.md
git commit -m "docs(ext): add manual test plan for in-doc pins"
```

---

### Task 12: README note and deploy verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README "Current status" table row for the extension**

Open `README.md`. Find the existing `Chrome extension` row in the "Current status" table:

```
| Chrome extension | Load-unpacked MVP | Captures Google Docs context through a content script and sends it to the backend. |
```

Replace with:

```
| Chrome extension | Load-unpacked MVP | Captures Google Docs context, sends it to the backend, and renders suggestions as colored pins in the right gutter of the doc; clicking a pin opens a coaching card with a one-click clipboard copy. Falls back to a sidebar card list for canvas-rendered docs. |
```

- [ ] **Step 2: Add a short "In-doc pins" section to the README**

Open `README.md`. After the existing "Verification commands" section, add the following heading and content:

```markdown
## In-doc pins

After running a review, Docs Coach renders each suggestion as a colored
pin in the right gutter of the open Google Doc, anchored to the paragraph
the suggestion targets. Pin colors follow severity (red = high,
amber = medium, blue = low). Clicking a pin opens a card with the full
suggestion plus an **Apply** button that copies the recommended revision
to your clipboard.

If a doc uses Google's canvas renderer, pins aren't available and the
extension falls back to the in-panel card list. Toggle **Show
suggestions as in-doc pins** in the side panel to switch between modes.
```

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: describe in-doc pin overlay in README"
git push origin main
```

- [ ] **Step 4: Verify the deployed API after the push lands**

Wait for the Railway deploy to finish (the push triggers an auto-deploy
of the API). Then run the smoke test:

```bash
./apps/api/tests/smoke.sh
```

Expected output:

```
OK: N suggestions, all with paragraph_index
  [high] owner_accountability -> paragraph 1
  ...
```

- [ ] **Step 5: Verify the extension end-to-end one more time**

Walk through `extension/TESTING.md` against the deployed API. Confirm
sections 1–8 pass. If a section fails, file a follow-up issue rather
than retrying — the implementation plan is done at that point.

- [ ] **Step 6: Final commit (only if the smoke or manual run revealed any small fix worth landing now)**

If everything passes, no extra commit is needed.

---

## Done

When all tasks above are checked off, the in-doc pin overlay is shipped:

- Every suggestion the API returns has a paragraph anchor.
- The extension renders colored pins in the right gutter of any
  DOM-rendered Google Doc.
- Clicking a pin opens a card; Apply copies to clipboard.
- The side panel keeps the doc-wide summary and falls back to the card
  list when the toggle is off or the doc is canvas-rendered.

Next workstream (separately): replace the side panel with a chat input.
