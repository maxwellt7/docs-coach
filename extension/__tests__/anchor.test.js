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

const { extractDocId } = context.DocsCoachGoogleApi;

test('extractDocId returns the ID from a normal /edit URL', () => {
  const id = extractDocId('https://docs.google.com/document/d/1abcXYZ_123/edit');
  assert.equal(id, '1abcXYZ_123');
});

test('extractDocId returns the ID from a URL with query and fragment', () => {
  const id = extractDocId('https://docs.google.com/document/d/foo-bar/edit?usp=sharing#heading=h.abc');
  assert.equal(id, 'foo-bar');
});

test('extractDocId throws on a non-doc URL', () => {
  assert.throws(() => extractDocId('https://example.com/foo'));
});

test('extractDocId throws on undefined input', () => {
  assert.throws(() => extractDocId(undefined));
});
