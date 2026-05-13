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

  // --- exports ---------------------------------------------------------------

  root.DocsCoachGoogleApi = {
    AnchorNotFound,
    findParagraphRange,
  };
})(typeof window !== 'undefined' ? window : globalThis);
