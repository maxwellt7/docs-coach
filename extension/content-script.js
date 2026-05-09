const MAX_TEXT_LENGTH = 30000;
let lastHash = '';
let notifyTimer = null;

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return String(h);
}

function extractGoogleDocText() {
  const title = document.title.replace(/ - Google Docs$/, '');
  const lineNodes = Array.from(document.querySelectorAll('.kix-lineview-text-block, .kix-wordhtmlgenerator-word-node'));
  const lineText = lineNodes.map((node) => node.textContent || '').join('\n').trim();
  const fallback = document.body?.innerText || '';
  const documentText = (lineText || fallback).replace(/\n{3,}/g, '\n\n').slice(0, MAX_TEXT_LENGTH);

  return {
    surface: 'google_docs',
    url: window.location.href,
    title,
    document_text: documentText || 'No editable Google Docs text was detected. Try selecting text or connecting the Google Docs API ingestion path.',
    selected_text: window.getSelection()?.toString()?.slice(0, 12000) || null,
    review_mode: 'auto',
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DOCS_COACH_GET_CONTEXT') {
    sendResponse(extractGoogleDocText());
    return true;
  }
  return false;
});

function notifyChanged() {
  const context = extractGoogleDocText();
  const nextHash = hash(`${context.title}\n${context.document_text}\n${context.selected_text || ''}`);
  if (nextHash === lastHash) return;

  lastHash = nextHash;
  chrome.runtime
    .sendMessage({ type: 'DOCS_COACH_CONTEXT_CHANGED', payload: { title: context.title, hash: nextHash } })
    .catch(() => {});
}

const observer = new MutationObserver(() => {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(notifyChanged, 2500);
});

observer.observe(document.body, { subtree: true, childList: true, characterData: true });
setTimeout(notifyChanged, 1500);
