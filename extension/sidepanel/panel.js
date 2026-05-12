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
      <div class="meta">${escapeHtml(data.route.document_type)} · ${escapeHtml(data.route.knowledge_bases.join(' → '))}</div>
      <strong>${escapeHtml(String(data.readiness_score))}/10</strong>
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
    if (!context || !Array.isArray(context.paragraphs) || context.paragraphs.length === 0) {
      throw new Error(
        'Could not read any text from this document. Open a Google Doc with content and try again.'
      );
    }
    if (context._anchors_available === false) {
      canvasDetected = true;
      showBanner(
        "This doc uses Google's canvas renderer — in-doc pins aren't " +
          'available. Falling back to the card list below.'
      );
    }
    const base = apiUrl.value.replace(/\/$/, '');
    // Strip extension-internal fields before sending to the API.
    const { _anchors_available, ...payload } = context;
    const response = await fetch(`${base}/api/document-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
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
