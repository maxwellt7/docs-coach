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
