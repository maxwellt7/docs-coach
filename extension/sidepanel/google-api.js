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

  // --- exports ---------------------------------------------------------------

  root.DocsCoachGoogleApi = {
    AnchorNotFound,
    findParagraphRange,
    extractDocId,
    getAuthToken,
    signOut,
    getUserEmail,
  };
})(typeof window !== 'undefined' ? window : globalThis);
