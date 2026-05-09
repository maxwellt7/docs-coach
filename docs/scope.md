# Docs Coach Extension Scope

**Author:** Manus AI  
**Date:** 2026-05-09  
**Baseline inspected:** `maxwellt7/maxmayes-chat`

## Executive recommendation

Yes, your existing `maxmayes-chat` project is a strong baseline for this. The part worth reusing is not primarily the current chat frontend; it is the **backend retrieval and orchestration layer**. The repo already has the hardest part of the Reforge-like experience: a registry of knowledge bases, a router that selects the best Pinecone indexes, multi-index retrieval, reciprocal-rank fusion, optional reranking, an accuracy verifier, and a final synthesis step. The new work should therefore focus on changing the **input surface** from a user-typed chat question into a structured document-review request produced by a Chrome extension.

The lowest-troubleshooting path is to duplicate the repo, preserve the FastAPI backend and Pinecone registry, and add a new Chrome extension package plus one new backend review endpoint. The extension should first support Google Docs with a content-script overlay and side panel. For reliable full-document extraction, it should use the Google Docs API rather than relying entirely on DOM polling. Chrome content scripts can read and modify page DOM and communicate with the extension runtime, but Google’s supported method for extracting a complete document is the Docs API `documents.get` flow that recursively traverses tabs and structural elements such as paragraphs, tables of contents, and tables.[1] [2]

> **Bottom line:** Build this as a Reforge-style document coach, not as another chat app. The user experience should be a quiet sidebar and margin-note reviewer that watches the active document, classifies the document type, routes to the right business knowledge base, and returns prioritized recommendations.

## What Reforge-like behavior should be copied

The useful pattern from Reforge was that advice appeared inside the user’s everyday work surface rather than requiring a separate prompt-and-response workflow. Its extension was described as in-the-moment coaching inside tools such as Google Docs, Notion, Jira, Confluence, Linear, and Coda. It used the current page’s contents to customize advice, provided pre-selected ideas, and grounded responses in expert material rather than generic chatbot output.[3]

| Reforge-style behavior | Proposed equivalent in your tool | Implementation note |
|---|---|---|
| In-document coaching | Chrome side panel and small floating review button in Google Docs | Start with Google Docs; add Notion later after the review loop works. |
| Context-aware suggestions | Extract doc title, selected text, visible section, and full document when authorized | Use DOM/selection for MVP and Docs API for reliable full-document review. |
| Expert-backed recommendations | Route to SOP, contract, policy, operations, sales, hiring, or strategy knowledge bases | Reuse the current Index Registry and router with new document-type metadata. |
| Pre-selected prompts | “Improve SOP clarity,” “Find missing owners,” “Check contract risks,” “Make this executable” | Render as quick actions in the extension side panel. |
| Proactive prompts/notifications | Debounced review after meaningful edits, plus low-noise readiness score changes | Poll/diff document snapshots; never fire on every keystroke. |
| Linked expert context | Show source category and framework used, without overwhelming the user | Add trace metadata from selected indexes/chunks. |

## Existing repo fit

The backend is already close to what this product needs. The current `orchestrator.py` runs a five-step pipeline: query optimization, index routing, retrieval from top candidate indexes, accuracy verification, and final synthesis. It also has a voice-profile lookup and streams results through `/api/chat`. The router returns up to three candidate indexes and marks a request out of domain when no index has sufficient confidence. Retrieval can query multiple Pinecone namespaces, merge ranked results, deduplicate chunks, and rerank before generation. These are exactly the pieces needed for knowledge-base sequencing.

| Existing component | Keep, modify, or replace | Why |
|---|---|---|
| FastAPI backend | **Keep** | It already exposes streaming endpoints and clean service modules. |
| Pinecone registry/admin | **Keep** | This is your knowledge-base control plane. It can become the framework library for SOPs, contracts, policies, and operating docs. |
| Query router | **Modify lightly** | It routes generic questions today; it should route structured document-review tasks next. |
| Retrieval and RRF | **Keep** | Multi-index retrieval is valuable when documents overlap domains, such as SOP plus legal risk. |
| Accuracy verifier | **Keep and specialize** | It prevents unsupported advice; adapt the prompt for document-review evidence. |
| Voice synthesizer | **Modify** | Replace “answer as Max” with “review as a senior operator/business documentation coach.” |
| Current Next.js chat UI | **Mostly replace** | A document coach needs cards, issues, readiness scores, and margin notes, not chat bubbles. |
| Clerk/auth pattern | **Simplify for MVP** | Current bearer-token expectations are lightweight. Extension auth can start simple and harden later. |

## Proposed target architecture

The extension should become a three-layer system. The browser extension captures context and renders suggestions. The backend reviews structured document snapshots. The knowledge layer stores business frameworks and examples in Pinecone, organized by document type and review lens.

| Layer | Responsibility | Key modules |
|---|---|---|
| Chrome extension | Detect active Google Doc, extract context, show sidebar, send review requests, receive suggestions | `manifest.json`, `contentScript.ts`, `background.ts`, `sidePanel.tsx`, `documentAdapter.ts` |
| Backend review API | Normalize document context, classify doc type, route knowledge bases, run review pipeline, return structured suggestions | `document_review.py`, `review_orchestrator.py`, `schemas.py`, `prompts/document_*` |
| Knowledge base | Store SOP, contract, operating, policy, sales, client, and hiring frameworks/examples | Existing `index_registry`, Pinecone indexes, namespaces, source metadata |

The backend should expose a new endpoint separate from chat:

```http
POST /api/document-review
Authorization: Bearer <extension-token>
Content-Type: application/json
```

```json
{
  "document_id": "google-doc-id",
  "surface": "google_docs",
  "title": "Client Onboarding SOP",
  "selected_text": "optional selected range",
  "visible_text": "text currently visible or recently edited",
  "full_text": "optional full document text from Docs API",
  "document_type_hint": "sop | contract | policy | proposal | unknown",
  "review_mode": "quick_scan | deep_review | section_review | contract_risk",
  "changed_since_last_hash": "sha256-or-null"
}
```

The response should be structured rather than a free-form answer:

```json
{
  "readiness_score": 7,
  "document_type": "sop",
  "review_lenses": ["clarity", "owner accountability", "handoffs", "risk"],
  "summary": "The SOP is usable but missing escalation rules and success criteria.",
  "suggestions": [
    {
      "id": "sug_001",
      "severity": "high",
      "category": "Missing owner",
      "anchor_text": "When a client submits onboarding materials...",
      "recommendation": "Name the role accountable for validating materials within one business day.",
      "why_it_matters": "Without a clear owner, the handoff can stall without visibility.",
      "suggested_rewrite": "The Client Success Manager validates all submitted onboarding materials within one business day...",
      "source_lens": "SOP execution checklist"
    }
  ]
}
```

## Knowledge-base sequencing logic

The biggest design choice is to stop treating every request as a generic search query. The extension should first understand the document context, then sequence knowledge bases deliberately. A good first version should use deterministic rules plus the existing LLM router.

| Step | Logic | Output |
|---|---|---|
| 1. Surface detection | Detect Google Docs URL and document ID from `docs.google.com/document/d/<id>` | `surface`, `document_id` |
| 2. Document capture | Pull title, selected text, visible text, active heading, and full text if authorized | `DocumentSnapshot` |
| 3. Document type classification | Classify as SOP, contract, policy, proposal, internal memo, onboarding doc, sales doc, etc. | `document_type`, confidence |
| 4. Review mode selection | Choose quick scan, section review, deep review, contract risk, or rewrite pass | `review_mode` |
| 5. Mandatory base lenses | Always apply universal business-document lenses: clarity, audience, owner, decision/usefulness, risk, next action | Base rubric |
| 6. Domain routing | Call the existing index router using a structured review query, not the raw document | Top candidate indexes |
| 7. Cross-index retrieval | Retrieve from top indexes and namespaces; use RRF/rerank | Grounding context |
| 8. Review synthesis | Return structured suggestions, readiness score, missing questions, and suggested rewrites | Suggestion cards |

A practical routing query should look like this rather than “review this doc”:

> Document type: SOP. Business function: client onboarding. Review mode: deep_review. User needs proactive coaching on clarity, operational handoffs, missing owners, escalation rules, success criteria, and business risk. Find the most relevant SOP, operations, client onboarding, and documentation-quality frameworks.

## MVP scope that avoids heavy troubleshooting

The mistake to avoid is trying to solve Chrome extension packaging, Google OAuth, full Docs API extraction, realtime collaboration, Notion, and production auth in the first pass. The first build should prove the review loop with narrow constraints.

| Phase | Goal | What ships |
|---|---|---|
| 1. Duplicate and stabilize | Copy `maxmayes-chat` into a new repo and keep the backend working | Existing backend tests pass; env variables documented. |
| 2. Add review endpoint | Add `/api/document-review` using structured JSON output | Manual API tests can review pasted document text. |
| 3. Build local Chrome extension | Add Manifest V3 extension with side panel and Google Docs content script | Extension detects Docs, captures title/selection/visible text, calls review API. |
| 4. Add document diffing | Debounce edits and send only meaningful changes | Local hash cache, “review changed sections” mode. |
| 5. Add Docs API ingestion | OAuth and whole-document extraction | Reliable full-document reviews by document ID. |
| 6. Add knowledge-base admin improvements | Add doc-type tags and default review lenses to registry | Better routing and fewer irrelevant suggestions. |

## Recommended repository structure

The duplicated repo should become a monorepo with separate packages. This keeps the existing backend mostly intact and avoids forcing a browser extension into the current Next.js app.

```text
docs-coach/
  backend/
    app/
      routers/
        chat.py
        admin.py
        document_review.py       # new
      services/
        orchestrator.py          # existing chat pipeline
        review_orchestrator.py   # new structured review pipeline
        document_classifier.py   # new
        google_docs_extractor.py # later server-side helper if needed
      prompts/
        document_classifier.txt
        document_reviewer.txt
        suggestion_formatter.txt
  extension/
    manifest.json
    src/
      background.ts
      contentScript.ts
      sidepanel/
        App.tsx
        SuggestionCard.tsx
        ReadinessMeter.tsx
      adapters/
        googleDocsDomAdapter.ts
        googleDocsApiAdapter.ts
      lib/
        apiClient.ts
        diff.ts
        documentHash.ts
  web-admin/
    # optional: current admin/chat frontend or a simplified registry console
```

## Key implementation decisions

The first version should not inject inline edits directly into the Google Doc. Inline editing, comments, and precise anchoring are much more fragile than a side panel. Instead, it should show suggestions with anchor snippets and copy/apply actions. Once the review engine works, you can add safer “copy rewrite” and “insert comment” actions.

Polling should not run on every keystroke. The extension should watch for document changes, debounce for 10–20 seconds, hash the current snapshot, and only request a new review when the hash changes materially or the user clicks “review now.” This is more useful and less noisy than realtime grammar-checker behavior.

For contracts, the tool should be explicit that it is giving business-risk review and clarity suggestions, not legal advice. If contracts become a primary use case, it should have a separate contract-risk mode with conservative disclaimers and specialized legal-review knowledge bases.

## Build-risk assessment

| Risk | Severity | Mitigation |
|---|---:|---|
| Google Docs DOM extraction is incomplete or unstable | High | Use DOM for MVP context and Docs API for reliable full text. |
| OAuth setup slows the first build | Medium | Ship manual/visible-text MVP first; add OAuth in phase two. |
| Suggestions feel generic | High | Add document-type classification, mandatory review lenses, and source-specific knowledge bases. |
| Too many notifications become annoying | Medium | Use readiness-score changes and high-severity issues only for proactive nudges. |
| Contract review creates liability concerns | Medium | Separate legal-risk mode from business-clarity mode and include clear disclaimers. |
| Current backend auth is too light for production | Medium | Keep simple bearer auth for private MVP; add signed extension auth and user management before wider release. |

## What I would build first

I would build a private local MVP that works like this: open a Google Doc, click the extension icon, see a right-side review panel, click “Review this doc,” and receive five to ten prioritized suggestions grouped by clarity, missing owner, operational risk, handoff, and readiness. It would use the current backend pipeline after converting the document into a structured review request. Once that works, I would add debounced background polling and Docs API full-document extraction.

This approach gives you the Reforge-style “coach in the document” feeling without spending weeks fighting fragile build issues. It also protects the most valuable part of your current system: your knowledge-base routing and retrieval infrastructure.

## References

[1]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts "Chrome Developers: Content scripts"
[2]: https://developers.google.com/workspace/docs/api/samples/extract-text "Google Developers: Extract the text from a document with Docs API"
[3]: https://reforge.helpscoutdocs.com/article/199-reforge-browser-extension "Reforge Knowledge Base: Reforge Extension"
