# Google Docs API Comments + Insert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three per-suggestion actions in the side panel — Insert (replace the targeted paragraph in the doc via the Docs API), Post comment (create a native Google comment via the Drive Comments API), and Copy (existing clipboard fallback) — gated by an in-extension Google sign-in.

**Architecture:** All Google API calls live in the extension. A new `extension/sidepanel/google-api.js` module owns the Docs / Drive HTTP calls and the suggestion→character-range mapping helper `findParagraphRange`. The side panel imports it via `<script>` and wires sign-in, sign-out, and per-card action handlers. The backend (FastAPI on Railway) does not change.

**Tech Stack:** Manifest V3 Chrome extension (vanilla JS), `chrome.identity.getAuthToken`, Google Docs API v1, Google Drive API v3. Tests use Node's built-in `node:test` + `node:assert` (no npm install).

---

## File Structure

**Extension (new + modified)**
- `extension/manifest.json` — add `identity` permission and the `oauth2` block.
- `extension/sidepanel/index.html` — add auth row at top, restructure card markup so panel.js can inject three action buttons per card.
- `extension/sidepanel/panel.js` — sign-in / sign-out wiring, button enable/disable, action handlers.
- `extension/sidepanel/google-api.js` *(new)* — owns Docs + Drive HTTP calls, `findParagraphRange`, doc-ID extraction, custom error classes. Loaded as a plain `<script>` before `panel.js` so its functions are available globally on `window.DocsCoachGoogleApi`.
- `extension/sidepanel/styles.css` — auth row, button row, disabled state, action button states.
- `extension/__tests__/anchor.test.js` *(new)* — unit tests for `findParagraphRange`.

**Docs**
- `docs/google-oauth-setup.md` *(new)* — step-by-step Cloud project + OAuth client setup walkthrough.
- `extension/TESTING.md` — append "Google Docs API features" manual test section.
- `README.md` — short subsection describing Insert / Post comment / Copy and pointing at the OAuth setup doc.

**Backend** — unchanged.

The `google-api.js` module is loaded as a classic script (not an ES module) because the side panel already uses classic scripts and Manifest V3 ES-module loading in extensions adds friction we don't need. It exposes one global: `window.DocsCoachGoogleApi`.

---

## Phase 1 — Google API module

### Task 1: Scaffold `google-api.js` and the test harness

**Files:**
- Create: `extension/sidepanel/google-api.js`
- Create: `extension/__tests__/anchor.test.js`

- [ ] **Step 1: Create the module skeleton**

Create `extension/sidepanel/google-api.js` with:

```js
/* Docs Coach Google API client. Owns all Docs + Drive HTTP calls
 * and the suggestion→character-range mapping helper.
 *
 * Loaded as a classic <script> by sidepanel/index.html. Exposes one
 * global: window.DocsCoachGoogleApi.
 *
 * This module is also imported by Node's test runner via a tiny
 * shim that captures the global assignment — see __tests__/anchor.test.js.
 */

(function (root) {
  'use strict';

  class AnchorNotFound extends Error {
    constructor(message) {
      super(message);
      this.name = 'AnchorNotFound';
    }
  }

  // --- findParagraphRange ----------------------------------------------------

  /**
   * Locate the character range of the paragraph that matches anchorSnippet.
   * @param {Object} docStructure - The Docs API response (a document resource).
   * @param {string} anchorSnippet - First ~80 chars of the target paragraph.
   * @returns {{startIndex: number, endIndex: number}}
   * @throws {AnchorNotFound} when no paragraph is close enough.
   */
  function findParagraphRange(docStructure, anchorSnippet) {
    throw new Error('not implemented yet');
  }

  // --- exports ---------------------------------------------------------------

  root.DocsCoachGoogleApi = {
    AnchorNotFound,
    findParagraphRange,
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Create the test file**

Create `extension/__tests__/anchor.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// Load google-api.js into a sandbox that exposes `globalThis` as its root.
const modulePath = path.join(__dirname, '..', 'sidepanel', 'google-api.js');
const source = fs.readFileSync(modulePath, 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);
const { findParagraphRange, AnchorNotFound } = context.DocsCoachGoogleApi;

function makeDoc(paragraphTexts) {
  let cursor = 1;
  const content = [
    { sectionBreak: {}, startIndex: 0, endIndex: 1 },
  ];
  for (const text of paragraphTexts) {
    const elements = [{ textRun: { content: text + '\n' } }];
    const endIndex = cursor + text.length + 1;
    content.push({ paragraph: { elements }, startIndex: cursor, endIndex });
    cursor = endIndex;
  }
  return { documentId: 'doc', body: { content } };
}

test('exact prefix match returns the matched paragraph range', () => {
  const doc = makeDoc([
    'Lorem ipsum dolor sit amet.',
    'The product owner is responsible for approving every change.',
    'Refunds over $500 require manager approval.',
  ]);
  const range = findParagraphRange(doc, 'The product owner is responsible');
  assert.equal(range.startIndex, 29); // 1 (sectionBreak) + 27 (para 0 text) + 1 (newline)
  assert.equal(range.endIndex, 90);   // 29 + 60 (para 1 text) + 1 (newline)
});

test('fuzzy match within threshold returns closest paragraph', () => {
  const doc = makeDoc([
    'Lorem ipsum dolor sit amet.',
    'The product owner is responsible for approving every change.',
    'Refunds over $500 require manager approval per policy.',
  ]);
  // One-letter typo in 'responsible' should still match para 1 (ratio ~0.98).
  const range = findParagraphRange(
    doc,
    'The product owner is responsable for approving every change.',
  );
  assert.equal(range.startIndex, 29);
});

test('no match above threshold throws AnchorNotFound', () => {
  const doc = makeDoc([
    'Lorem ipsum dolor sit amet.',
    'Consectetur adipiscing elit.',
  ]);
  assert.throws(
    () => findParagraphRange(doc, 'Completely unrelated content here'),
    AnchorNotFound,
  );
});
```

- [ ] **Step 3: Run tests, expect all three to fail**

```bash
cd /Users/maxmayes/projects/docs-coach
node --test extension/__tests__/
```

Expected: `# pass 0`, `# fail 3`. The first two fail with "not implemented yet"; the third fails because the stub throws `Error` and the test expects `AnchorNotFound`. We will turn them all green in Task 2.

- [ ] **Step 4: Commit the scaffold**

```bash
git add extension/sidepanel/google-api.js extension/__tests__/anchor.test.js
git commit -m "chore(ext): scaffold google-api.js module + node:test harness"
```

---

### Task 2: Implement `findParagraphRange`

**Files:**
- Modify: `extension/sidepanel/google-api.js`

- [ ] **Step 1: Replace the stub implementation**

In `extension/sidepanel/google-api.js`, replace the placeholder `findParagraphRange` with the real implementation:

```js
  function findParagraphRange(docStructure, anchorSnippet) {
    if (!docStructure?.body?.content || !Array.isArray(docStructure.body.content)) {
      throw new AnchorNotFound('docStructure.body.content missing');
    }
    if (typeof anchorSnippet !== 'string' || anchorSnippet.length < 4) {
      throw new AnchorNotFound('anchorSnippet too short to match');
    }

    const paragraphs = [];
    for (const entry of docStructure.body.content) {
      if (!entry.paragraph || !Array.isArray(entry.paragraph.elements)) continue;
      const text = entry.paragraph.elements
        .map((el) => el.textRun?.content || '')
        .join('')
        .replace(/\n+$/, '')
        .trim();
      if (!text) continue;
      paragraphs.push({
        text,
        startIndex: entry.startIndex,
        endIndex: entry.endIndex,
      });
    }

    if (paragraphs.length === 0) {
      throw new AnchorNotFound('document has no paragraphs');
    }

    const target = anchorSnippet.slice(0, 80);

    // 1) Exact prefix match (case-sensitive).
    for (const p of paragraphs) {
      if (p.text.startsWith(target)) {
        return { startIndex: p.startIndex, endIndex: p.endIndex };
      }
    }

    // 2) Fuzzy match: highest Levenshtein ratio against the first 80 chars,
    //    minimum threshold 0.7.
    let best = null;
    let bestRatio = 0;
    for (const p of paragraphs) {
      const head = p.text.slice(0, 80);
      const ratio = levenshteinRatio(head, target);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = p;
      }
    }
    if (best && bestRatio >= 0.7) {
      return { startIndex: best.startIndex, endIndex: best.endIndex };
    }

    throw new AnchorNotFound(
      `no paragraph matched anchor snippet (best ratio=${bestRatio.toFixed(2)})`,
    );
  }

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
          dp[i - 1][j - 1] + cost,
        );
      }
    }
    return 1 - dp[m][n] / Math.max(m, n);
  }
```

- [ ] **Step 2: Run tests, expect all to pass**

```bash
node --test extension/__tests__/
```

Expected: `pass 3` (or `# pass 3`).

- [ ] **Step 3: Syntax-check the module from the extension's POV**

```bash
node --check extension/sidepanel/google-api.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add extension/sidepanel/google-api.js
git commit -m "feat(ext): implement findParagraphRange with fuzzy fallback"
```

---

### Task 3: Add doc-ID extraction and auth-token helpers

**Files:**
- Modify: `extension/sidepanel/google-api.js`

- [ ] **Step 1: Add three helpers to the module**

In `extension/sidepanel/google-api.js`, after `levenshteinRatio` but before the `root.DocsCoachGoogleApi = …` export, insert:

```js
  // --- doc-id + auth helpers -------------------------------------------------

  /**
   * Extract a Google Doc's documentId from its URL.
   * @returns {string} the document ID, or throws.
   */
  function extractDocId(url) {
    if (typeof url !== 'string') throw new Error('Doc URL missing');
    const m = url.match(/\/document\/d\/([^/?#]+)/);
    if (!m) throw new Error('Not a Google Doc URL');
    return m[1];
  }

  /**
   * Wraps chrome.identity.getAuthToken in a Promise.
   * @param {boolean} interactive - whether to prompt the user if no token.
   * @returns {Promise<string|null>}
   */
  function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
      try {
        chrome.identity.getAuthToken({ interactive }, (token) => {
          const err = chrome.runtime.lastError;
          if (err) {
            if (!interactive && /not signed in|user not signed in|OAuth2 not granted/i.test(err.message)) {
              resolve(null);
              return;
            }
            reject(new Error(err.message));
            return;
          }
          resolve(token || null);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Revoke + remove the cached auth token. Resolves once both calls finish.
   */
  async function signOut() {
    const token = await getAuthToken(false);
    if (!token) return;
    try {
      await fetch(
        'https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token),
        { method: 'POST' },
      );
    } catch (_) {
      // Network failure is fine — we still drop the cache below.
    }
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }

  /**
   * Read the signed-in user's email via chrome.identity.getProfileUserInfo.
   * @returns {Promise<string|null>}
   */
  function getUserEmail() {
    return new Promise((resolve) => {
      try {
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
          resolve(info?.email || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }
```

Then update the export block to include the new functions:

```js
  root.DocsCoachGoogleApi = {
    AnchorNotFound,
    findParagraphRange,
    extractDocId,
    getAuthToken,
    signOut,
    getUserEmail,
  };
```

- [ ] **Step 2: Add tests for `extractDocId`**

Append to `extension/__tests__/anchor.test.js`:

```js
const { extractDocId } = context.DocsCoachGoogleApi;

test('extractDocId returns the ID from a normal /edit URL', () => {
  const id = extractDocId('https://docs.google.com/document/d/1abcXYZ_123/edit');
  assert.equal(id, '1abcXYZ_123');
});

test('extractDocId returns the ID from a URL with query and fragment', () => {
  const id = extractDocId('https://docs.google.com/document/d/foo-bar/edit?usp=sharing#heading=h.abc');
  assert.equal(id, 'foo-bar');
});

test('extractDocId throws on a non-doc URL', () => {
  assert.throws(() => extractDocId('https://example.com/foo'));
});

test('extractDocId throws on undefined input', () => {
  assert.throws(() => extractDocId(undefined));
});
```

- [ ] **Step 3: Run tests**

```bash
node --test extension/__tests__/
```

Expected: `pass 7` (3 anchor + 4 extractDocId).

- [ ] **Step 4: Commit**

```bash
git add extension/sidepanel/google-api.js extension/__tests__/anchor.test.js
git commit -m "feat(ext): add extractDocId + chrome.identity wrappers to google-api"
```

---

### Task 4: Add Docs API + Drive Comments API call helpers

**Files:**
- Modify: `extension/sidepanel/google-api.js`

- [ ] **Step 1: Add the three API call functions**

In `extension/sidepanel/google-api.js`, after `getUserEmail` and before the export block, insert:

```js
  // --- HTTP helpers ----------------------------------------------------------

  async function authedFetch(url, options) {
    let token = await getAuthToken(false);
    if (!token) {
      token = await getAuthToken(true);
    }
    if (!token) {
      throw new Error('Not signed in');
    }
    const headers = Object.assign({}, options?.headers || {}, {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    });
    let response = await fetch(url, Object.assign({}, options, { headers }));

    // Token might have just expired; retry once with a fresh one.
    if (response.status === 401) {
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => resolve());
      });
      token = await getAuthToken(true);
      if (!token) throw new Error('Not signed in');
      headers.Authorization = 'Bearer ' + token;
      response = await fetch(url, Object.assign({}, options, { headers }));
    }

    return response;
  }

  /**
   * GET https://docs.googleapis.com/v1/documents/{docId}
   */
  async function fetchDocStructure(docId) {
    const res = await authedFetch(
      'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId),
      { method: 'GET' },
    );
    if (!res.ok) {
      throw await apiError(res, 'fetch doc structure');
    }
    return res.json();
  }

  /**
   * Replace the text in [startIndex, endIndex) with newText.
   * Keeps the trailing newline by deleting through endIndex - 1.
   */
  async function replaceParagraph(docId, range, newText) {
    const body = {
      requests: [
        {
          deleteContentRange: {
            range: {
              startIndex: range.startIndex,
              endIndex: range.endIndex - 1,
            },
          },
        },
        {
          insertText: {
            location: { index: range.startIndex },
            text: newText,
          },
        },
      ],
    };
    const res = await authedFetch(
      'https://docs.googleapis.com/v1/documents/' +
        encodeURIComponent(docId) +
        ':batchUpdate',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!res.ok) {
      throw await apiError(res, 'insert');
    }
    return res.json();
  }

  /**
   * Create a Drive comment anchored to a paragraph range in a Doc.
   */
  async function postComment(docId, range, content) {
    const anchor = JSON.stringify({
      r: 'head',
      a: [{ txt: { o: range.startIndex, l: range.endIndex - range.startIndex } }],
    });
    const res = await authedFetch(
      'https://www.googleapis.com/drive/v3/files/' +
        encodeURIComponent(docId) +
        '/comments?fields=id',
      { method: 'POST', body: JSON.stringify({ content, anchor }) },
    );
    if (!res.ok) {
      throw await apiError(res, 'post comment');
    }
    return res.json();
  }

  async function apiError(res, label) {
    let body = '';
    try {
      body = await res.text();
    } catch (_) {
      // ignore
    }
    const err = new Error(
      label + ' failed: ' + res.status + (body ? ' — ' + body.slice(0, 200) : ''),
    );
    err.status = res.status;
    return err;
  }
```

Update the export block:

```js
  root.DocsCoachGoogleApi = {
    AnchorNotFound,
    findParagraphRange,
    extractDocId,
    getAuthToken,
    signOut,
    getUserEmail,
    fetchDocStructure,
    replaceParagraph,
    postComment,
  };
```

- [ ] **Step 2: Syntax-check**

```bash
node --check extension/sidepanel/google-api.js
node --test extension/__tests__/
```

Expected: both succeed; tests still report `pass 7`.

- [ ] **Step 3: Commit**

```bash
git add extension/sidepanel/google-api.js
git commit -m "feat(ext): add Docs + Drive API call helpers"
```

---

## Phase 2 — Manifest + side panel wiring

### Task 5: Update the manifest

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Add the `identity` permission and `oauth2` block**

Replace `extension/manifest.json` entirely with:

```json
{
  "manifest_version": 3,
  "name": "Docs Coach",
  "description": "Business-documentation coaching side panel for Google Docs.",
  "version": "0.1.0",
  "minimum_chrome_version": "114",
  "permissions": [
    "activeTab",
    "storage",
    "sidePanel",
    "identity"
  ],
  "host_permissions": [
    "https://docs.google.com/document/*",
    "http://localhost:8000/*",
    "https://*.up.railway.app/*",
    "https://docs.googleapis.com/*",
    "https://www.googleapis.com/*",
    "https://oauth2.googleapis.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://docs.google.com/document/d/*"
      ],
      "js": [
        "content-script.js",
        "content-script-overlay.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "action": {
    "default_title": "Open Docs Coach"
  },
  "oauth2": {
    "client_id": "REPLACE_ME.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive"
    ]
  }
}
```

`REPLACE_ME` is intentional — the user fills it in after creating their OAuth client in Task 8.

- [ ] **Step 2: Verify JSON**

```bash
python3 -m json.tool extension/manifest.json > /dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "chore(ext): add identity permission and oauth2 block to manifest"
```

---

### Task 6: Side panel UI scaffolding

**Files:**
- Modify: `extension/sidepanel/index.html`
- Modify: `extension/sidepanel/styles.css`

- [ ] **Step 1: Update the HTML**

Replace `extension/sidepanel/index.html` entirely with:

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

      <section id="auth" class="auth">
        <span id="authState" class="auth__state">Not signed in</span>
        <button id="authButton" class="auth__btn">Sign in to Google</button>
      </section>

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
    <script src="google-api.js"></script>
    <script src="panel.js"></script>
  </body>
</html>
```

Key additions: a new `<section id="auth">` block with state + button, and a `<script src="google-api.js">` tag loaded **before** `panel.js`.

- [ ] **Step 2: Add styles for the new UI bits**

Append the following CSS to the END of `extension/sidepanel/styles.css` (keep the existing rules):

```css

.auth {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 14px 0 4px;
  padding: 8px 10px;
  background: rgba(255,250,240,.78);
  border: 1px solid rgba(31,36,29,.18);
}

.auth__state {
  font-size: 12px;
  color: #5d5a50;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth__btn {
  font-size: 12px;
  padding: 6px 10px;
  box-shadow: none;
}

.card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
  border-top: 1px solid rgba(31,36,29,.12);
  padding-top: 10px;
}

.card__btn {
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border: 1px solid rgba(31,36,29,.22);
  background: #fffaf0;
  color: #1f241d;
  cursor: pointer;
  box-shadow: none;
}

.card__btn--primary {
  background: #1f241d;
  color: #f5f1e8;
  border-color: #1f241d;
}

.card__btn[disabled] {
  cursor: not-allowed;
  opacity: 0.45;
}

.card__status {
  margin: 8px 0 0;
  font-size: 11px;
  color: #5d5a50;
}

.card__status--error {
  color: #9b2f25;
}
```

- [ ] **Step 3: Verify**

```bash
python3 -c "import html.parser; html.parser.HTMLParser().feed(open('extension/sidepanel/index.html').read()); print('html ok')"
```

Expected: `html ok`.

- [ ] **Step 4: Commit**

```bash
git add extension/sidepanel/index.html extension/sidepanel/styles.css
git commit -m "feat(ext): add auth row and per-card action button styles"
```

---

### Task 7: Wire sign-in / sign-out + per-card action handlers

**Files:**
- Modify: `extension/sidepanel/panel.js`

- [ ] **Step 1: Replace `panel.js` entirely with the new version**

Replace `extension/sidepanel/panel.js` entirely with:

```js
const Api = window.DocsCoachGoogleApi;

const apiUrl = document.getElementById('apiUrl');
const reviewMode = document.getElementById('reviewMode');
const reviewButton = document.getElementById('reviewButton');
const pinToggle = document.getElementById('pinOverlayToggle');
const banner = document.getElementById('banner');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const authState = document.getElementById('authState');
const authButton = document.getElementById('authButton');

let lastSuggestions = [];
let canvasDetected = false;
let signedInEmail = null;
let lastDocUrl = null;

// --- Auth ---------------------------------------------------------------

async function refreshAuthDisplay() {
  const token = await Api.getAuthToken(false).catch(() => null);
  if (token) {
    const email = await Api.getUserEmail();
    signedInEmail = email;
    authState.textContent = email || 'Signed in';
    authButton.textContent = 'Sign out';
  } else {
    signedInEmail = null;
    authState.textContent = 'Not signed in';
    authButton.textContent = 'Sign in to Google';
  }
  updateCardButtonStates();
}

authButton.addEventListener('click', async () => {
  authButton.disabled = true;
  try {
    if (signedInEmail) {
      await Api.signOut();
    } else {
      await Api.getAuthToken(true);
    }
  } catch (error) {
    statusEl.textContent = 'Sign-in failed: ' + (error.message || error);
  } finally {
    authButton.disabled = false;
    await refreshAuthDisplay();
  }
});

refreshAuthDisplay();

// --- API URL / pin toggle persistence ----------------------------------

chrome.storage.sync.get(
  ['docsCoachApiUrl', 'docsCoachPinOverlay'],
  ({ docsCoachApiUrl, docsCoachPinOverlay }) => {
    if (docsCoachApiUrl) apiUrl.value = docsCoachApiUrl;
    if (typeof docsCoachPinOverlay === 'boolean') {
      pinToggle.checked = docsCoachPinOverlay;
    }
    syncResultsVisibility();
  },
);

apiUrl.addEventListener('change', () => {
  chrome.storage.sync.set({ docsCoachApiUrl: apiUrl.value.replace(/\/$/, '') });
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

// --- Doc context + review ---------------------------------------------

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
      <div class="meta">${escapeHtml(data.route.document_type)} · ${escapeHtml(data.route.knowledge_bases.join(' → '))}</div>
      <strong>${escapeHtml(String(data.readiness_score))}/10</strong>
      <p>${escapeHtml(data.executive_summary)}</p>
      <p>${escapeHtml(data.next_best_action)}</p>
    </section>
  `;
}

function renderCardList(suggestions) {
  resultsEl.innerHTML = '';
  for (const item of suggestions) {
    resultsEl.appendChild(buildCard(item));
  }
  updateCardButtonStates();
}

function buildCard(item) {
  const card = document.createElement('article');
  card.className = 'card ' + (item.severity || '');
  card.dataset.suggestionId = item.id;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (item.severity || '') + ' · ' + (item.lens || '');
  card.appendChild(meta);

  const title = document.createElement('h2');
  title.textContent = item.title || '';
  card.appendChild(title);

  const why = document.createElement('p');
  why.textContent = item.why_it_matters || '';
  card.appendChild(why);

  const revision = document.createElement('p');
  revision.className = 'revision';
  const revLabel = document.createElement('strong');
  revLabel.textContent = 'Suggested revision: ';
  revision.appendChild(revLabel);
  revision.appendChild(document.createTextNode(item.recommended_revision || ''));
  card.appendChild(revision);

  if (item.follow_up_question) {
    const q = document.createElement('p');
    const qLabel = document.createElement('strong');
    qLabel.textContent = 'Question: ';
    q.appendChild(qLabel);
    q.appendChild(document.createTextNode(item.follow_up_question));
    card.appendChild(q);
  }

  const actions = document.createElement('div');
  actions.className = 'card__actions';

  const insertBtn = mkBtn('Insert ↩', 'card__btn card__btn--primary');
  insertBtn.dataset.action = 'insert';
  insertBtn.addEventListener('click', () => handleInsert(item, insertBtn, card));

  const commentBtn = mkBtn('Post comment 💬', 'card__btn');
  commentBtn.dataset.action = 'comment';
  commentBtn.addEventListener('click', () => handleComment(item, commentBtn, card));

  const copyBtn = mkBtn('Copy 📋', 'card__btn');
  copyBtn.dataset.action = 'copy';
  copyBtn.addEventListener('click', () => handleCopy(item, copyBtn));

  actions.append(insertBtn, commentBtn, copyBtn);
  card.appendChild(actions);

  const status = document.createElement('p');
  status.className = 'card__status';
  status.hidden = true;
  card.appendChild(status);

  return card;
}

function mkBtn(label, className) {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = className;
  return b;
}

function updateCardButtonStates() {
  const signedIn = !!signedInEmail;
  for (const btn of resultsEl.querySelectorAll('.card__btn')) {
    const action = btn.dataset.action;
    if (action === 'insert' || action === 'comment') {
      btn.disabled = !signedIn;
      btn.title = signedIn ? '' : 'Sign in to Google to use this.';
    }
  }
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
    chrome.runtime.sendMessage({ type: 'DOCS_COACH_CLEAR_PINS' }).catch(() => {});
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

// --- Card action handlers ---------------------------------------------

function setCardStatus(card, text, isError) {
  const status = card.querySelector('.card__status');
  status.textContent = text;
  status.hidden = !text;
  status.classList.toggle('card__status--error', !!isError);
}

function flashButton(btn, label, holdMs) {
  const original = btn.dataset.originalLabel || btn.textContent;
  btn.dataset.originalLabel = original;
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
    delete btn.dataset.originalLabel;
    updateCardButtonStates();
  }, holdMs);
}

async function resolveRange(suggestion) {
  if (!lastDocUrl) throw new Error('No doc context. Run Review first.');
  const docId = Api.extractDocId(lastDocUrl);
  const structure = await Api.fetchDocStructure(docId);
  const snippet = suggestion.anchor_snippet;
  if (!snippet) {
    throw new Api.AnchorNotFound('suggestion has no anchor_snippet');
  }
  const range = Api.findParagraphRange(structure, snippet);
  return { docId, range };
}

async function handleInsert(suggestion, btn, card) {
  setCardStatus(card, '', false);
  btn.disabled = true;
  try {
    const { docId, range } = await resolveRange(suggestion);
    await Api.replaceParagraph(docId, range, suggestion.recommended_revision);
    flashButton(btn, 'Inserted ✓', 2000);
  } catch (error) {
    btn.disabled = false;
    setCardStatus(card, errorMessage(error, 'insert'), true);
  }
}

async function handleComment(suggestion, btn, card) {
  setCardStatus(card, '', false);
  btn.disabled = true;
  try {
    const { docId, range } = await resolveRange(suggestion);
    const content =
      (suggestion.title || 'Docs Coach suggestion') +
      '\n\n' +
      (suggestion.recommended_revision || '') +
      '\n\n— Docs Coach';
    await Api.postComment(docId, range, content);
    flashButton(btn, 'Posted ✓', 2000);
  } catch (error) {
    btn.disabled = false;
    setCardStatus(card, errorMessage(error, 'post comment'), true);
  }
}

async function handleCopy(suggestion, btn) {
  try {
    await navigator.clipboard.writeText(suggestion.recommended_revision || '');
    flashButton(btn, 'Copied ✓', 2000);
  } catch (_) {
    flashButton(btn, 'Copy failed', 2000);
  }
}

function errorMessage(error, action) {
  if (error?.name === 'AnchorNotFound') {
    return "Couldn't locate this paragraph in the doc — it may have been edited since the review. Re-run Review.";
  }
  if (error?.status === 403) {
    return 'Permissions missing — please sign out and sign in again to re-grant access.';
  }
  if (error?.status === 404) {
    return "Couldn't find this doc on your Google account. Make sure you're signed in with the right user.";
  }
  if (error?.status === 429) {
    return 'Google rate-limited us. Wait a minute and try again.';
  }
  if (error?.message && /not signed in/i.test(error.message)) {
    return 'Sign in to Google first, then retry.';
  }
  return `Could not ${action}: ${error?.message || String(error)}`;
}

// --- Review trigger ---------------------------------------------------

reviewButton.addEventListener('click', async () => {
  reviewButton.disabled = true;
  statusEl.textContent = 'Collecting Google Docs context…';
  summaryEl.innerHTML = '';
  resultsEl.innerHTML = '';
  hideBanner();
  canvasDetected = false;
  try {
    const context = await getContext();
    if (!context || !Array.isArray(context.paragraphs) || context.paragraphs.length === 0) {
      throw new Error(
        'Could not read any text from this document. Open a Google Doc with content and try again.',
      );
    }
    if (context._anchors_available === false) {
      canvasDetected = true;
      showBanner(
        "This doc uses Google's canvas renderer — in-doc pins aren't available. Falling back to the card list below.",
      );
    }
    lastDocUrl = context.url;
    const base = apiUrl.value.replace(/\/$/, '');
    const { _anchors_available, ...payload } = context;
    const response = await fetch(`${base}/api/document-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, review_mode: reviewMode.value }),
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

- [ ] **Step 2: Syntax-check**

```bash
node --check extension/sidepanel/panel.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add extension/sidepanel/panel.js
git commit -m "feat(ext): wire sign-in/out and per-card Insert/Post/Copy actions"
```

---

## Phase 3 — Docs, manual test, README

### Task 8: Write the Google Cloud / OAuth setup walkthrough

**Files:**
- Create: `docs/google-oauth-setup.md`

- [ ] **Step 1: Create the doc**

Create `docs/google-oauth-setup.md`:

```markdown
# Google Cloud + OAuth setup for Docs Coach

The Insert and Post comment actions call the Google Docs API and the
Google Drive Comments API directly from the Chrome extension. To
authorize those calls you need a Google Cloud project, an OAuth client
ID of type **Chrome Extension**, and the client ID pasted into the
extension's `manifest.json`.

These scopes (`documents` and `drive`) are "restricted" by Google. For
**personal use** the unverified-app warning is fine — you click
**Advanced → Continue (unsafe)** the first time. For wider distribution
through the Chrome Web Store you would need to submit for verification
later; that is out of scope for this round.

## Steps

1. **Get your extension ID.**
   Load the unpacked extension at `chrome://extensions`. Copy the
   32-char ID shown on the Docs Coach card.

2. **Create a Cloud project.**
   Open <https://console.cloud.google.com>, create a new project named
   `docs-coach` (any name works). Make sure it's selected in the
   project picker at the top.

3. **Enable APIs.**
   APIs & Services → Enabled APIs & services → **+ Enable APIs and
   Services**. Enable:
   - **Google Docs API**
   - **Google Drive API**

4. **Configure the OAuth consent screen.**
   APIs & Services → OAuth consent screen → **External** → Create.
   - App name: `Docs Coach`
   - User support email: your email
   - Developer contact email: your email
   - Save and continue.
   On the **Scopes** step click **Add or remove scopes** and add:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
   Save. On the **Test users** step add your own Google account.

5. **Create the OAuth client ID.**
   APIs & Services → Credentials → **+ Create Credentials → OAuth
   client ID**. Application type: **Chrome Extension**. Item ID: the
   32-char extension ID from step 1. Save.

6. **Copy the client ID into the manifest.**
   In `extension/manifest.json`, replace the placeholder in the
   `oauth2` block:

   ```json
   "oauth2": {
     "client_id": "<paste-here>.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/documents",
       "https://www.googleapis.com/auth/drive"
     ]
   }
   ```

7. **Reload the unpacked extension** at `chrome://extensions` so the
   new manifest is picked up.

8. **Sign in.**
   Open the side panel and click **Sign in to Google**. The first
   sign-in shows "Google hasn't verified this app." Click
   **Advanced → Continue (unsafe)**, then **Allow** on the scopes. Your
   email should now appear in the auth row.

## Troubleshooting

- **"OAuth2 not granted or revoked"** in the console after clicking
  Sign in. Usually means the extension ID in the Cloud console
  doesn't match the one Chrome loaded. Verify both, update the Cloud
  console if needed, and reload the extension.
- **403 on Insert / Post comment.** The scope was probably not added
  to the consent screen. Update step 4 then sign out and sign in
  again from the side panel — Chrome will re-prompt for consent.
- **"redirect_uri_mismatch"**. You probably created a Web client
  instead of a Chrome Extension client. Recreate the credentials
  with type **Chrome Extension**.
- **Need to start over?** APIs & Services → Credentials → delete the
  OAuth client, then repeat step 5.
```

- [ ] **Step 2: Commit**

```bash
git add docs/google-oauth-setup.md
git commit -m "docs: walkthrough for Google Cloud + OAuth client setup"
```

---

### Task 9: Append the new manual test section

**Files:**
- Modify: `extension/TESTING.md`

- [ ] **Step 1: Append the new section**

Append the following to the END of `extension/TESTING.md`:

```markdown

## Google Docs API features

These tests cover the Insert / Post comment / Copy actions and the
sign-in flow added in the 2026-05-12 Docs API round.

Prereq: complete `docs/google-oauth-setup.md` so the manifest has a
real OAuth client ID. Reload the extension at `chrome://extensions`
after editing the manifest.

### 11. Sign-in flow (first time)

- Open the side panel. The auth row says **Not signed in** and the
  button says **Sign in to Google**.
- Click **Sign in to Google**.
- Expected: a Google sign-in popup. After choosing the account you
  added as a test user, you see **"Google hasn't verified this app."**
  Click **Advanced → Continue (unsafe)**, then **Allow** on the
  consent screen.
- After the popup closes, the auth row shows your email and the
  button changes to **Sign out**.
- The Insert and Post comment buttons on any rendered card become
  enabled.

### 12. Sign-in flow (subsequent)

- Close and reopen the side panel.
- Expected: the auth row shows your email immediately (silent token
  refresh).

### 13. Sign out

- Click **Sign out**.
- Expected: auth row returns to **Not signed in**; Insert and Post
  comment buttons become disabled with the tooltip "Sign in to
  Google to use this." Copy stays enabled.

### 14. Insert on a Kix-rendered doc

- Toggle **Show suggestions as in-doc pins** OFF (so the side-panel
  cards render — Insert isn't wired into the in-doc overlay card
  this round).
- Click **Review visible doc**.
- On a suggestion card, click **Insert ↩**.
- Expected: the targeted paragraph in the Google Doc is replaced
  with the recommended revision text. Button briefly flashes
  **Inserted ✓**, then returns to **Insert ↩**.
- ⌘Z in the Google Doc reverts the change.

### 15. Insert on a canvas-rendered doc

- Use a Google Doc that doesn't expose `.kix-paragraphrenderer`
  nodes — confirm in DevTools that
  `document.querySelectorAll('.kix-paragraphrenderer').length === 0`.
- Click **Review visible doc**.
- The amber canvas banner shows; the card list renders below.
- Click **Insert ↩** on a card.
- Expected: the targeted paragraph is replaced. This is the core
  feature of this round.

### 16. Post comment

- On any rendered card click **Post comment 💬**.
- Expected: a Google comment appears in the doc's native comments
  sidebar (the comments column on the right of the doc). The
  comment's content is the suggestion title + recommended revision
  + a "— Docs Coach" signature, and it is anchored to the targeted
  paragraph (clicking the comment in the sidebar highlights that
  paragraph).
- The card button briefly flashes **Posted ✓**.

### 17. Edited paragraph after review

- Click **Review visible doc**.
- In the Google Doc, edit the text of a paragraph that has a
  suggestion (delete a few words at the start, for example).
- On the side panel card for that paragraph, click **Insert ↩**.
- Expected: the card status line shows "Couldn't locate this
  paragraph in the doc — it may have been edited since the review.
  Re-run Review."

### 18. Doc you don't have edit access to

- Open someone else's read-only Google Doc; ensure you can read it
  but the toolbar shows **View only**.
- Click **Review visible doc**, then **Insert ↩**.
- Expected: card status: "Permissions missing — please sign out and
  sign in again to re-grant access." (Drive returns 403 for a
  read-only file; we treat that as the closest existing error.)

### 19. Network offline

- DevTools → Network → throttling → **Offline**.
- Click **Insert ↩**.
- Expected: card status shows the failed-fetch error message
  ("Could not insert: …"). When you go back online the next Insert
  click works.

### 20. Copy fallback still works without sign-in

- Sign out.
- Click **Review visible doc** (works without auth; the API call
  hits the public backend).
- Click **Copy 📋** on any card.
- Expected: button flashes **Copied ✓** and the recommended
  revision is on the clipboard.
```

- [ ] **Step 2: Commit**

```bash
git add extension/TESTING.md
git commit -m "docs(ext): manual test plan for Google Docs API actions"
```

---

### Task 10: README note and end-to-end verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README's Chrome extension row in the status table**

Open `README.md`. Find the row that begins with `| Chrome extension |`. Replace it with:

```
| Chrome extension | Load-unpacked MVP | Captures Google Docs context and renders coaching cards in the side panel. On Kix-rendered docs, shows colored margin pins linked to paragraphs. On any doc (canvas or Kix), per-suggestion **Insert** replaces the paragraph in-place via the Google Docs API, **Post comment** creates a native Google comment, and **Copy** sends the revision to the clipboard. Sign-in handled in-extension via `chrome.identity`. |
```

- [ ] **Step 2: Add an "In-doc actions" subsection**

In `README.md`, find the existing `## In-doc pins` subsection added in the previous round. Add this new subsection immediately AFTER it:

```markdown
## In-doc actions (Insert / Post comment / Copy)

Once you've completed the [Google Cloud + OAuth setup](docs/google-oauth-setup.md)
and signed in via the side panel, each suggestion card has three
independent actions:

- **Insert ↩** — replace the targeted paragraph in the Google Doc with
  the recommended revision text. Undo with ⌘Z in the doc.
- **Post comment 💬** — create a native Google comment anchored to the
  targeted paragraph. Appears in the doc's normal comments sidebar.
- **Copy 📋** — copy the recommended revision to the clipboard. Works
  without sign-in.

The Insert and Post comment buttons are disabled until you sign in to
Google. The Copy button is always enabled.

These actions live on the side-panel cards. On Kix-rendered docs, you
can toggle the in-doc pin overlay off to see the card list. On
canvas-rendered docs the card list appears automatically.
```

- [ ] **Step 3: Run a final node:test pass and node --check sweep**

```bash
cd /Users/maxmayes/projects/docs-coach
node --test extension/__tests__/
node --check extension/sidepanel/google-api.js
node --check extension/sidepanel/panel.js
python3 -m json.tool extension/manifest.json > /dev/null && echo manifest-ok
```

Expected: tests pass; node --check produces no output; `manifest-ok`.

- [ ] **Step 4: Run the backend pytest suite one more time as a regression check**

```bash
cd /Users/maxmayes/projects/docs-coach
python3 -m pytest apps/api/tests/ -v 2>&1 | tail -5
```

Expected: `23 passed`.

- [ ] **Step 5: Commit and push**

```bash
cd /Users/maxmayes/projects/docs-coach
git add README.md
git commit -m "docs: describe Insert/Post/Copy actions and link to OAuth setup"
git push origin main
```

The push does not need to trigger a Railway redeploy — the backend hasn't changed. The Vercel site rebuilds for free; nothing depends on the README there.

---

## Done

When all tasks are checked off, the Docs Coach side panel can replace any paragraph in a Google Doc and post native comments — including on canvas-rendered docs, which the pin overlay cannot handle.

The user still has to do the Google Cloud + OAuth client setup manually (Task 8's doc). Until they do that and paste their client ID into `manifest.json`, the Insert and Post comment buttons will fail at sign-in time. That is expected.

Next workstream (separately): replace the side panel with the chat-input UI that was deferred from the in-doc pins round.
