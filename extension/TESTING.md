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

## Google Docs API features

These tests cover the Insert / Post comment / Copy actions and the
sign-in flow added in the 2026-05-12 Docs API round.

Prereq: complete `docs/google-oauth-setup.md` so the manifest has a
real OAuth client ID. Reload the extension at `chrome://extensions`
after editing the manifest.

### 11. Sign-in flow (first time)

- Open the side panel. The auth row says **Not signed in** and the
  button says **Sign in to Google**.
- Click **Sign in to Google**.
- Expected: a Google sign-in popup. After choosing the account you
  added as a test user, you see **"Google hasn't verified this app."**
  Click **Advanced → Continue (unsafe)**, then **Allow** on the
  consent screen.
- After the popup closes, the auth row shows your email and the
  button changes to **Sign out**.
- The Insert and Post comment buttons on any rendered card become
  enabled.

### 12. Sign-in flow (subsequent)

- Close and reopen the side panel.
- Expected: the auth row shows your email immediately (silent token
  refresh).

### 13. Sign out

- Click **Sign out**.
- Expected: auth row returns to **Not signed in**; Insert and Post
  comment buttons become disabled with the tooltip "Sign in to
  Google to use this." Copy stays enabled.

### 14. Insert on a Kix-rendered doc

- Toggle **Show suggestions as in-doc pins** OFF (so the side-panel
  cards render — Insert isn't wired into the in-doc overlay card
  this round).
- Click **Review visible doc**.
- On a suggestion card, click **Insert ↩**.
- Expected: the targeted paragraph in the Google Doc is replaced
  with the recommended revision text. Button briefly flashes
  **Inserted ✓**, then returns to **Insert ↩**.
- ⌘Z in the Google Doc reverts the change.

### 15. Insert on a canvas-rendered doc

- Use a Google Doc that doesn't expose `.kix-paragraphrenderer`
  nodes — confirm in DevTools that
  `document.querySelectorAll('.kix-paragraphrenderer').length === 0`.
- Click **Review visible doc**.
- The amber canvas banner shows; the card list renders below.
- Click **Insert ↩** on a card.
- Expected: the targeted paragraph is replaced. This is the core
  feature of this round.

### 16. Post comment

- On any rendered card click **Post comment 💬**.
- Expected: a Google comment appears in the doc's native comments
  sidebar (the comments column on the right of the doc). The
  comment's content is the suggestion title + recommended revision
  + a "— Docs Coach" signature, and it is anchored to the targeted
  paragraph (clicking the comment in the sidebar highlights that
  paragraph).
- The card button briefly flashes **Posted ✓**.

### 17. Edited paragraph after review

- Click **Review visible doc**.
- In the Google Doc, edit the text of a paragraph that has a
  suggestion (delete a few words at the start, for example).
- On the side panel card for that paragraph, click **Insert ↩**.
- Expected: the card status line shows "Couldn't locate this
  paragraph in the doc — it may have been edited since the review.
  Re-run Review."

### 18. Doc you don't have edit access to

- Open someone else's read-only Google Doc; ensure you can read it
  but the toolbar shows **View only**.
- Click **Review visible doc**, then **Insert ↩**.
- Expected: card status: "Permissions missing — please sign out and
  sign in again to re-grant access." (Drive returns 403 for a
  read-only file; we treat that as the closest existing error.)

### 19. Network offline

- DevTools → Network → throttling → **Offline**.
- Click **Insert ↩**.
- Expected: card status shows the failed-fetch error message
  ("Could not insert: …"). When you go back online the next Insert
  click works.

### 20. Copy fallback still works without sign-in

- Sign out.
- Click **Review visible doc** (works without auth; the API call
  hits the public backend).
- Click **Copy 📋** on any card.
- Expected: button flashes **Copied ✓** and the recommended
  revision is on the clipboard.
