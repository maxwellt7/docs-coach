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

function extractFlatFallback() {
  // Last-resort extraction when no .kix-paragraphrenderer nodes exist
  // (canvas-rendered docs or non-Kix surfaces). Returns one big string
  // split into paragraphs on double-newlines. No DOM anchors — pins
  // won't render in this mode; the panel falls back to the card list.
  const lineNodes = Array.from(
    document.querySelectorAll(
      '.kix-lineview-text-block, .kix-wordhtmlgenerator-word-node'
    )
  );
  const lineText = lineNodes
    .map((n) => n.textContent || '')
    .join('\n')
    .trim();
  const raw = (lineText || document.body?.innerText || '').trim();
  if (!raw) return [];
  return raw
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_PARAGRAPHS)
    .map((p) => p.slice(0, MAX_PARAGRAPH_LENGTH));
}

function extractGoogleDoc() {
  const title = String(document.title || '').replace(/ - Google Docs$/, '');
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

  // If the structured path found nothing, drop to the flat fallback so
  // the API still gets text to review. We deliberately leave
  // paragraphAnchors empty in that case — the panel will detect zero
  // anchors and render the card list instead of pins.
  let finalParagraphs = paragraphs;
  let anchorsAvailable = paragraphs.length > 0;
  if (paragraphs.length === 0) {
    finalParagraphs = extractFlatFallback();
  }

  window.__docsCoachState.paragraphAnchors = paragraphAnchors;

  return {
    surface: 'google_docs',
    url: window.location.href,
    title,
    paragraphs: finalParagraphs,
    selected_text: window.getSelection()?.toString()?.slice(0, 12000) || null,
    review_mode: 'auto',
    _anchors_available: anchorsAvailable,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DOCS_COACH_GET_CONTEXT') {
    try {
      sendResponse(extractGoogleDoc());
    } catch (error) {
      console.warn('[Docs Coach] extraction failed:', error);
      sendResponse({
        surface: 'google_docs',
        url: window.location.href,
        title: String(document.title || ''),
        paragraphs: [],
        selected_text: null,
        review_mode: 'auto',
        _anchors_available: false,
        _error: error?.message || String(error),
      });
    }
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
