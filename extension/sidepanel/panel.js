const apiUrl = document.getElementById('apiUrl');
const reviewMode = document.getElementById('reviewMode');
const reviewButton = document.getElementById('reviewButton');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

chrome.storage.sync.get(['docsCoachApiUrl'], ({ docsCoachApiUrl }) => {
  if (docsCoachApiUrl) apiUrl.value = docsCoachApiUrl;
});

apiUrl.addEventListener('change', () => {
  chrome.storage.sync.set({ docsCoachApiUrl: apiUrl.value.replace(/\/$/, '') });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'DOCS_COACH_CONTEXT_CHANGED') {
    statusEl.textContent = `Document context changed: ${message.payload.title || 'Untitled document'}. Click review to refresh suggestions.`;
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://docs.google.com/document/')) {
    throw new Error('Open a Google Docs document before running a review.');
  }
  return tab;
}

async function getContext() {
  const tab = await getActiveTab();
  return chrome.tabs.sendMessage(tab.id, { type: 'DOCS_COACH_GET_CONTEXT' });
}

function render(data) {
  const cards = data.suggestions.map((item) => `
    <article class="card ${item.severity}">
      <div class="meta">${item.severity} · ${item.lens}</div>
      <h2>${item.title}</h2>
      <p>${item.why_it_matters}</p>
      <p class="revision"><strong>Suggested revision:</strong> ${item.recommended_revision}</p>
      ${item.follow_up_question ? `<p><strong>Question:</strong> ${item.follow_up_question}</p>` : ''}
    </article>
  `).join('');

  resultsEl.innerHTML = `
    <section class="score">
      <div class="meta">${data.route.document_type} · ${data.route.knowledge_bases.join(' → ')}</div>
      <strong>${data.readiness_score}/10</strong>
      <p>${data.executive_summary}</p>
      <p>${data.next_best_action}</p>
    </section>
    ${cards}
  `;
}

reviewButton.addEventListener('click', async () => {
  reviewButton.disabled = true;
  statusEl.textContent = 'Collecting Google Docs context…';
  resultsEl.innerHTML = '';
  try {
    const context = await getContext();
    const base = apiUrl.value.replace(/\/$/, '');
    const response = await fetch(`${base}/api/document-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, review_mode: reviewMode.value }),
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    statusEl.textContent = 'Review complete.';
    render(data);
  } catch (error) {
    statusEl.textContent = error.message || String(error);
  } finally {
    reviewButton.disabled = false;
  }
});
