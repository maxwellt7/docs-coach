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
