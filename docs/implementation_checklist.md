# Docs Coach Extension Implementation Checklist

**Author:** Manus AI  
**Date:** 2026-05-09

## Objective

This checklist translates the scope into a build sequence designed to avoid the usual Chrome-extension and Google Docs troubleshooting traps. The guiding principle is to prove the **document-review loop** before adding fragile realtime behaviors, OAuth complexity, or direct document editing.

## Phase 0: Repository duplication and guardrails

| Task | Acceptance criteria | Notes |
|---|---|---|
| Duplicate `maxwellt7/maxmayes-chat` into a new repo such as `docs-coach-extension` | Backend starts locally with the same env variables as the current project | Do not mutate the original repo until the new flow is proven. |
| Preserve backend package boundaries | Existing `backend/app/services/orchestrator.py` remains runnable | Treat current chat as legacy surface, not as the core product. |
| Add a new `extension/` package | `extension/package.json`, `manifest.json`, `src/background.ts`, `src/contentScript.ts`, and `src/sidepanel/App.tsx` exist | Keep this separate from the current Next.js frontend. |
| Add a `docs/` folder | Architecture, env, and local install notes are documented | This is the cheapest way to reduce build troubleshooting later. |

## Phase 1: Backend review endpoint first

| Task | Acceptance criteria | Notes |
|---|---|---|
| Add `DocumentReviewRequest` and `DocumentReviewResponse` schemas | Pydantic validates sample SOP and contract review requests | Use structured responses; do not stream free-form chat for the MVP. |
| Add `/api/document-review` | A pasted document returns a readiness score and suggestion cards | This can be tested with curl/Postman before Chrome is involved. |
| Add `document_classifier.py` | Classifies SOP, contract, policy, proposal, internal memo, sales doc, or unknown | Deterministic hints plus LLM fallback. |
| Add `review_orchestrator.py` | Converts document snapshot into router query, retrieves context, verifies, and formats suggestions | Reuse existing router/retrieval functions where possible. |
| Add review prompts | Prompts live under `backend/app/prompts/document_*` | Separate SOP review from contract-risk mode. |

## Phase 2: Chrome extension MVP without OAuth

| Task | Acceptance criteria | Notes |
|---|---|---|
| Build Manifest V3 extension shell | Can be loaded unpacked in Chrome | Include host permissions for `https://docs.google.com/document/*`. |
| Add Google Docs content script | Detects document ID, title, selected text, and visible editor text | DOM extraction is acceptable only for MVP context. |
| Add side panel UI | Shows connection status, review button, readiness score, and suggestion cards | Avoid inline document mutation in the first version. |
| Add API client | Sends bearer token and document snapshot to backend | Mirror the current `Authorization: Bearer <token>` pattern. |
| Add manual review flow | User clicks “Review this doc” and gets structured suggestions | This proves end-to-end value before polling. |

## Phase 3: Debounced changed-section review

| Task | Acceptance criteria | Notes |
|---|---|---|
| Add document hashing | Extension does not re-review unchanged content | Hash normalized text and title. |
| Add debounce scheduler | Reviews only after 10–20 seconds of inactivity or on manual click | Prevent notification fatigue. |
| Add changed-section mode | Backend receives only changed section plus surrounding context | Faster, cheaper, less noisy. |
| Add severity gating | Only high-severity or score-drop changes trigger proactive nudges | This is what makes it feel like a business coach rather than a grammar checker. |

## Phase 4: Google Docs API ingestion

| Task | Acceptance criteria | Notes |
|---|---|---|
| Add Chrome identity/OAuth setup | User can authorize Google Docs read access | Add after the MVP side panel works. |
| Add Docs API extractor | Full document text is retrieved by document ID | Use Google’s structural traversal pattern instead of relying on the DOM. |
| Add section map | Suggestions can reference headings/sections | Required before precise anchoring or comment insertion. |
| Add permission fallback | If API auth is missing, extension falls back to visible/selected text | Keeps the tool usable even before OAuth is configured. |

## Phase 5: Knowledge-base sequencing improvements

| Task | Acceptance criteria | Notes |
|---|---|---|
| Add registry metadata for document types | Indexes can be tagged as SOP, contract, policy, operations, sales, hiring, etc. | This improves router precision. |
| Add default review lenses per document type | SOP reviews differ from contract reviews | Reduces generic suggestions. |
| Add review-mode routing | Quick scan, deep review, section review, and contract-risk mode select different prompts | Enables lighter realtime scans and deeper manual reviews. |
| Add source trace metadata | Suggestion cards can show which framework or lens informed them | Builds trust without exposing too much retrieval detail. |

## Phase 6: Safe apply actions

| Task | Acceptance criteria | Notes |
|---|---|---|
| Add copy suggested rewrite | User can copy rewrite text from a suggestion card | Safe first action. |
| Add insert-at-cursor option | Extension can paste a rewrite at cursor with explicit user action | Requires user confirmation. |
| Add Google Docs comments only after stable anchoring | Comment insertion works on selected text/known ranges | Do not attempt this before Docs API section mapping works. |

## MVP definition of done

The MVP is done when a user can load the unpacked extension, open a Google Doc, click a review button, and receive five to ten prioritized recommendations that identify business-documentation issues such as missing owners, unclear handoffs, weak success criteria, contract ambiguity, undefined terms, or operational risk. The output should feel like a senior operator reviewed the document, not like a grammar checker.

## Defer intentionally

The following should be deferred until the review loop is useful: Notion support, automatic inline edits, comment insertion, multi-user collaboration state, public Chrome Web Store packaging, enterprise SSO, full billing, and legal-grade contract review claims.
