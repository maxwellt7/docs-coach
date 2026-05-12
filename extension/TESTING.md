# Docs Coach — Manual Test Plan

These are the steps to validate the in-doc pin overlay before shipping a
release. Run them against a freshly reloaded unpacked extension and a
freshly reloaded Google Doc.

## Setup

1. Open `chrome://extensions` and click **Reload** on the Docs Coach card.
2. Open or create a Google Doc with **at least four paragraphs** covering
   a mix of business topics. Suggested test paragraphs:

   > We need to ship the refund-handling feature by end of quarter.
   >
   > The product owner is responsible for approving every refund
   > over $500.
   >
   > Refunds must be processed within five business days per company
   > policy.
   >
   > Document the reason for each refund decision in the CRM so the
   > finance team can audit later.

3. Open the side panel via the Docs Coach toolbar icon.
4. Confirm the **API URL** field is set to
   `https://docs-coachweb-production.up.railway.app`.
5. Make sure the **Show suggestions as in-doc pins** toggle is ON.

## 1. Pins render at the right paragraphs

- Click **Review visible doc**.
- Expected: doc-wide summary appears in the panel; pins appear in the
  right gutter of the document next to relevant paragraphs.
- Check the colors: high = red, medium = amber, low = blue.

## 2. Card popup

- Click any pin.
- Expected: a card opens to the right of the pin (or to the left if it
  would overflow). The card shows severity, lens, title, why-it-matters,
  suggested revision, optional follow-up question, Apply, Dismiss.
- Click outside the card or press Escape: card closes.

## 3. Apply copies to clipboard

- Click a pin; the card opens.
- Click **Apply ↗**.
- Expected: button label changes to **Copied ✓** for 2 seconds.
- Open a scratchpad (e.g., Notes or a new doc) and paste — the
  recommended revision text should be there verbatim.

## 4. Dismiss removes the pin

- Click a pin; click **Dismiss ×**.
- Expected: card closes and the pin disappears from the document.
- The other pins remain.

## 5. Scroll repositioning

- Scroll the doc up and down.
- Expected: pins stay anchored to their paragraphs and remain in the
  right gutter; they don't drift, overlap with body text, or stick to
  the viewport.

## 6. Re-run wipes and re-inserts

- Click **Review visible doc** again.
- Expected: all existing pins disappear and a fresh set inserts. Any
  pin you dismissed earlier may reappear (dismissal is per-run only).

## 7. Toggle off falls back to card list

- Toggle **Show suggestions as in-doc pins** OFF.
- Expected: pins clear from the document; the panel shows the
  suggestion cards in a stack below the summary.
- Toggle ON again: pins reappear, panel card list hides.

## 8. Canvas-rendered fallback

- In Chrome DevTools, run on the Google Doc tab:

  ```js
  document.querySelectorAll('.kix-paragraphrenderer').forEach((n) => n.remove());
  ```

  (This simulates a canvas-rendered doc by destroying the queryable DOM.)
- Click **Review visible doc**.
- Expected: a banner appears in the panel saying canvas rendering was
  detected; the card list shows in the panel instead of pins.

## 9. Multiple pins on one paragraph

- Edit your test doc so that one paragraph contains words from several
  lenses (e.g. "owner approves every refund within five days"). Re-run
  review.
- Expected: more than one pin stacks vertically next to that paragraph.
  The bottom pin shows a small numeric badge.
- Clicking any pin in the stack opens that suggestion's card.

## 10. Edge cases worth eyeballing once

- Doc with **one paragraph**: pins still render; same paragraph may
  carry several stacked pins.
- Doc with **very long paragraph**: pin aligns to the vertical middle
  of the paragraph block; card position remains sane.
- Window resize: pins reposition to the new gutter location.
