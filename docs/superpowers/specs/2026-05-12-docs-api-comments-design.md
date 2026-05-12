# Google Docs API Comments + Insert Design

**Date:** 2026-05-12
**Status:** Approved by user, ready for implementation plan
**Scope:** This round only — chat-input sidebar remains a separate later workstream.

## Problem

Today's Docs Coach pin overlay only works on Kix-rendered Google Docs.
Google has been migrating Docs to a canvas-rendered engine for several
years; on those docs (the majority now) there are no
`.kix-paragraphrenderer` nodes to anchor pins to, and the extension
falls back to a card list in the side panel. The user wants the Reforge
in-doc experience to work everywhere: a native Google comment carries
the recommendation and explanation, and an **Insert** action actually
applies the recommended revision to the doc.

## Goal

Make Docs Coach work on canvas-rendered docs with the same trust and
control as Kix docs, via the Google Docs and Drive APIs:

1. Each suggestion card gains three independent actions: **Insert**
   (replace the targeted paragraph with the recommended revision),
   **Post comment** (create a native Google comment anchored to that
   paragraph), and **Copy** (the existing clipboard fallback).
2. Sign-in happens in-extension via `chrome.identity.getAuthToken` — no
   backend OAuth flow.
3. The Docs API and Drive Comments API are called directly from the
   extension. The backend (Railway/FastAPI) does not change.

## Non-goals (this round)

- Backend OAuth flow / refresh-token storage.
- Multi-account support.
- Cross-doc batch operations.
- Comment thread replies, resolution UI, or "Insert all" bulk actions.
- Native Google "suggested edit" mode (Workspace Add-ons only).
- Chrome Web Store submission or OAuth verification (personal-use only;
  user accepts the "App isn't verified" warning).
- Picker integration for `drive.file` scope (we use the broader `drive`
  scope this round).
- Chat-input sidebar (separate workstream).

## Architecture overview

All Google API calls happen inside the extension. A new
`extension/sidepanel/google-api.js` module owns Docs API and Drive
Comments API interactions; the side panel imports it via a `<script>`
tag and calls into it from the per-card button handlers. The backend
(`apps/api/`) keeps returning suggestions with `paragraph_index` and
`anchor_snippet` exactly as today.

No new services, no new dependencies, no backend changes.

## Section 1 — Auth & manifest

### Google Cloud setup (one-time, manual; done by the user)

1. Create a Google Cloud project (`docs-coach`) at
   <https://console.cloud.google.com>.
2. Enable the **Google Docs API** and **Google Drive API**.
3. OAuth consent screen → **External**, mark these scopes as needed:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
   Add the user's own Google account as a test user.
4. Credentials → **Create OAuth client ID** → application type
   **Chrome Extension**. The Chrome Extension flow asks for the
   extension ID, which appears at `chrome://extensions` once the
   unpacked extension is loaded.
5. Save the client ID into `manifest.json`.

A step-by-step walkthrough goes in `docs/google-oauth-setup.md` so the
user can re-do or hand off the setup without revisiting the spec.

### Manifest changes

```json
{
  "permissions": ["activeTab", "storage", "sidePanel", "identity"],
  "oauth2": {
    "client_id": "<YOUR_CLIENT_ID>.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive"
    ]
  }
}
```

`identity` is the new permission. `oauth2` is a new top-level key.

### Sign-in UX

The side panel header gains a new auth row:

- **Signed out:** a single `[Sign in to Google]` button.
- **Signed in:** the user's email plus a `[Sign out]` link. The email
  comes from `chrome.identity.getProfileUserInfo` (no extra OAuth scope
  required).

Sign-in flow:

```js
chrome.identity.getAuthToken({ interactive: true }, (token) => { ... });
```

First call shows the Google consent screen with the "App isn't verified"
warning; the user clicks **Advanced → Continue (unsafe)**. Subsequent
calls are silent. Tokens refresh transparently — we never persist them
ourselves.

Sign-out flow:

```js
chrome.identity.getAuthToken({ interactive: false }, (token) => {
  if (token) {
    fetch('https://oauth2.googleapis.com/revoke?token=' + token, { method: 'POST' });
    chrome.identity.removeCachedAuthToken({ token }, () => {});
  }
});
```

Revoking via the OAuth endpoint forces a fresh consent flow next time.

### Doc ID extraction

From `context.url` (already populated by the content script). Pattern:

```js
const m = url.match(/\/document\/d\/([^/]+)/);
if (!m) throw new Error('Not a Google Doc');
const documentId = m[1];
```

## Section 2 — Suggestion → Doc mapping & API calls

### The Docs API document model

`GET https://docs.googleapis.com/v1/documents/{documentId}` returns:

```json
{
  "documentId": "...",
  "body": {
    "content": [
      { "sectionBreak": {...}, "startIndex": 0, "endIndex": 1 },
      { "paragraph": { "elements": [...] }, "startIndex": 1, "endIndex": 47 },
      { "paragraph": { "elements": [...] }, "startIndex": 47, "endIndex": 102 },
      ...
    ]
  }
}
```

Each `paragraph` element has a half-open character range
`[startIndex, endIndex)` and a list of `elements[*].textRun.content`
strings whose concatenation is the paragraph's plain text. The
paragraph's `endIndex` includes the trailing newline.

### Anchor mapping algorithm

`findParagraphRange(docStructure, anchorSnippet) -> { startIndex, endIndex }`

1. Walk `body.content`; keep only entries that have a `paragraph` key
   (skip `sectionBreak`, `table`, `tableOfContents`).
2. For each kept paragraph compute its plain text by joining
   `elements[*].textRun.content` and trimming.
3. Find the first paragraph whose text **starts with `anchorSnippet`**
   (case-sensitive on the first 80 characters of each).
4. If no exact prefix match, fall back to fuzzy match: compute a
   Levenshtein ratio against the first 80 chars of each paragraph;
   require `ratio >= 0.7`; return the highest-scoring one.
5. Return `{ startIndex, endIndex }` of the matched paragraph entry
   (the outer entry's indices, not the inner element's).
6. If no match, throw `AnchorNotFound`.

### The three card actions

#### Insert

Replace the paragraph with the recommended revision:

```
POST https://docs.googleapis.com/v1/documents/{docId}:batchUpdate
Authorization: Bearer {token}
Content-Type: application/json

{
  "requests": [
    {
      "deleteContentRange": {
        "range": { "startIndex": s, "endIndex": e - 1 }
      }
    },
    {
      "insertText": {
        "location": { "index": s },
        "text": suggestion.recommended_revision
      }
    }
  ]
}
```

The `e - 1` preserves the paragraph's trailing newline so the structural
paragraph stays intact (deleting through `e` would merge with the next
paragraph).

After a successful Insert the button label swaps to **Inserted ✓** for
2 s, then returns to **Insert ↩**. The card stays visible.

#### Post comment

Create a Drive comment anchored to the paragraph's character range:

```
POST https://www.googleapis.com/drive/v3/files/{docId}/comments?fields=id
Authorization: Bearer {token}
Content-Type: application/json

{
  "content": "<title>\n\n<recommended_revision>\n\n— Docs Coach",
  "anchor": "{\"r\":\"head\",\"a\":[{\"txt\":{\"o\":<s>,\"l\":<e-s>}}]}"
}
```

The `anchor` string is a JSON-encoded payload: revision `head` (current
doc revision), one text anchor at offset `o` with length `l`. After a
successful post: button swaps to **Posted ✓** for 2 s.

#### Copy

Unchanged from today. `navigator.clipboard.writeText(recommended_revision)`
with a textarea fallback on failure. Available even when signed out.

### Action independence

The three buttons are independent — no implicit chaining. Posting a
comment does not Insert; Inserting does not Post or resolve any
existing comment. If the user Inserts and then Posts, the comment
anchors to the new text. If they Post first and then Insert, the
comment's anchor becomes detached (Drive marks the comment as
"detached" in the sidebar but keeps it in the comments list); we do not
attempt to migrate or delete it.

## Section 3 — Side panel, errors, testing

### Side panel layout

```
┌──────────────────────────────────────┐
│ Docs Coach                           │
│ Business review rail                 │
│ ─────────────────────────────────── │
│ ✓ max@maxwellmayes.com    [Sign out] │
│ ─────────────────────────────────── │
│ API URL: [https://...]               │
│ Mode: [Auto ▾]   [Review visible…]   │
│ ☑ Show suggestions as in-doc pins    │
│ ─────────────────────────────────── │
│ 7.5/10  Policy · …                   │
│ ─────────────────────────────────── │
│ HIGH · OWNER_ACCOUNTABILITY          │
│ Name the accountable owner…          │
│ Why: Business documentation fails…   │
│ Suggested revision: Add a short…     │
│ [Insert ↩]  [Post comment 💬]  [Copy 📋] │
└──────────────────────────────────────┘
```

The auth row is always present. Insert and Post comment buttons are
**disabled** with a tooltip "Sign in to Google to use this." when the
user is signed out. Copy is always enabled.

The existing pin overlay (Kix docs only) is untouched: the colored
pins, the click-to-open in-doc card, and the Apply/Dismiss buttons on
that in-doc card keep their current behavior. The new Insert / Post
comment / Copy buttons appear **only on side-panel cards**, which the
extension renders in two cases:

- The Pin overlay toggle is OFF, regardless of doc type.
- The Pin overlay toggle is ON but the doc is canvas-rendered, so
  the fallback card list is shown.

On a Kix-rendered doc with the toggle on, the user clicks a pin to see
the existing in-doc card (Apply = clipboard, Dismiss). To Insert or
Post a comment on that same doc they toggle the overlay off and the
side panel renders the full button row. Wiring the new buttons into
the in-doc overlay card is deliberately out of scope this round.

### Error handling

| Condition | Surface |
|---|---|
| Signed out, button clicked | Buttons are disabled; no API call. |
| `getAuthToken` 401 (refresh failed) | One auto-retry with `interactive: true`. Still failing → auth row swaps to "Sign in expired — sign in again". |
| Docs API 403 (insufficient scope) | Card status line: "Permissions missing — please sign out and sign in again to re-grant access." Console-log the response. |
| Docs API 404 (doc not accessible) | Card status: "Couldn't find this doc on your Google account. Make sure you're signed in with the right user." |
| `AnchorNotFound` from `findParagraphRange` | Card status: "Couldn't locate this paragraph in the doc — it may have been edited since the review. Re-run Review." |
| Docs API 429 | One retry after a 2 s delay. Second failure → "Google rate-limited us. Wait a minute and try again." |
| Optimistic-concurrency rejection on Insert (rare, due to a concurrent edit) | Same path as 429 — one retry then surface the message. |
| Network offline | "Network unavailable. Check your connection and try again." |

All errors are rendered as inline `card.status` text, never as `alert()`
dialogs. The button itself returns to its default label after a 2 s
flash of "Failed".

### Testing

1. **Unit tests** — new file `extension/__tests__/anchor.test.js`. The
   only logic worth testing in isolation is `findParagraphRange`. Three
   cases:
   - Exact prefix match returns the matched paragraph's range.
   - Fuzzy match within threshold returns the closest paragraph.
   - No match above threshold throws `AnchorNotFound`.

   The test runner is plain Node + `node:test` + `node:assert`. No npm
   install — `node --test extension/__tests__/` runs everything.

2. **Manual test plan** — append a new "Google Docs API features"
   section to `extension/TESTING.md` covering:
   - Sign in: consent screen with unverified-app warning → Advanced →
     Continue → email appears in side panel.
   - Sign in again later: silent (no prompt).
   - Sign out: email disappears, Insert/Post buttons disable.
   - Insert on a Kix-rendered doc: paragraph text replaces.
   - Insert on a canvas-rendered doc: paragraph text replaces (the
     core win this round — the pin path can't do this).
   - Post comment: appears in the doc's native comments sidebar
     anchored to the right paragraph.
   - Edit the paragraph after Review, then Insert: expect
     `AnchorNotFound` error message on the card.
   - Doc the signed-in account doesn't have edit access to: Insert
     surfaces the 403 message.
   - Network offline: graceful failure with retry guidance.

3. **No backend test changes.** The Pydantic models, the reviewer, and
   the smoke script all stay the same — the API contract did not
   change.

## File touch list

**Extension**
- `extension/manifest.json` — add `identity` permission and the
  `oauth2` block; user fills in the client ID.
- `extension/sidepanel/index.html` — auth row at top; three buttons
  per card.
- `extension/sidepanel/panel.js` — sign-in/out wiring, button
  enable/disable logic, action handlers that call into `google-api.js`.
- `extension/sidepanel/google-api.js` *(new)* — all Docs API + Drive
  Comments API calls plus `findParagraphRange`.
- `extension/sidepanel/styles.css` — button row styles, auth row
  styles, disabled-state styles.
- `extension/__tests__/anchor.test.js` *(new)* — unit tests for
  `findParagraphRange`.
- `extension/TESTING.md` — append "Google Docs API features" section.

**Backend** — unchanged.

**Docs**
- `docs/superpowers/specs/2026-05-12-docs-api-comments-design.md` —
  this spec.
- `docs/google-oauth-setup.md` *(new)* — step-by-step Cloud project +
  OAuth client setup walkthrough.
- `README.md` — short subsection pointing at the OAuth setup doc and
  describing the new Insert / Post comment / Copy actions.

## Open questions (none blocking)

- Should the email shown in the auth row be cached in
  `chrome.storage.sync` so the panel renders it immediately on open
  without re-fetching? Going with yes during implementation — trivial
  to reverse.
- If the user manually deletes a Docs Coach comment, do we hide its
  "Posted ✓" state across sessions? No — we don't track posted comment
  IDs this round.
