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
