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

  // Close the card on Escape.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openCardSuggestionId) {
      closeCard();
    }
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
  window.__docsCoach = { renderPins, clearPins, openCard };
})();
