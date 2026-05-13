const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// Load google-api.js into a sandbox that exposes `globalThis` as its root.
const modulePath = path.join(__dirname, '..', 'sidepanel', 'google-api.js');
const source = fs.readFileSync(modulePath, 'utf8');
const context = { console, Error };
vm.createContext(context);
vm.runInContext(source, context);
const { findParagraphRange, AnchorNotFound } = context.DocsCoachGoogleApi;

function makeDoc(paragraphTexts) {
  let cursor = 1;
  const content = [
    { sectionBreak: {}, startIndex: 0, endIndex: 1 },
  ];
  for (const text of paragraphTexts) {
    const elements = [{ textRun: { content: text + '\n' } }];
    const endIndex = cursor + text.length + 1;
    content.push({ paragraph: { elements }, startIndex: cursor, endIndex });
    cursor = endIndex;
  }
  return { documentId: 'doc', body: { content } };
}

test('exact prefix match returns the matched paragraph range', () => {
  const doc = makeDoc([
    'Lorem ipsum dolor sit amet.',
    'The product owner is responsible for approving every change.',
    'Refunds over $500 require manager approval.',
  ]);
  const range = findParagraphRange(doc, 'The product owner is responsible');
  assert.equal(range.startIndex, 29); // 1 (sectionBreak) + 27 (para 0 text) + 1 (newline)
  assert.equal(range.endIndex, 90);   // 29 + 60 (para 1 text) + 1 (newline)
});

test('fuzzy match within threshold returns closest paragraph', () => {
  const doc = makeDoc([
    'Lorem ipsum dolor sit amet.',
    'The product owner is responsible for approving every change.',
    'Refunds over $500 require manager approval per policy.',
  ]);
  // One-letter typo in 'responsible' should still match para 1 (ratio ~0.98).
  const range = findParagraphRange(
    doc,
    'The product owner is responsable for approving every change.',
  );
  assert.equal(range.startIndex, 29);
});

test('no match above threshold throws AnchorNotFound', () => {
  const doc = makeDoc([
    'Lorem ipsum dolor sit amet.',
    'Consectetur adipiscing elit.',
  ]);
  assert.throws(
    () => findParagraphRange(doc, 'Completely unrelated content here'),
    { name: 'AnchorNotFound' },
  );
});
