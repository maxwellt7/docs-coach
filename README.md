# Docs Coach

Docs Coach is a Chrome extension and web application starter for **real-time business-documentation coaching inside Google Docs**. It is designed for SOPs, contracts, policies, proposals, operating memos, and general business documentation. The product goal is not to behave like a generic AI chat box or grammar checker; it should feel like a business coach that reads the current document type, routes the review through the right knowledge lens, and returns prioritized suggestions that improve operational clarity, accountability, risk control, and decision quality.

This repository is intentionally structured as a low-troubleshooting MVP. The Chrome extension can be loaded unpacked, the web dashboard is ready for Vercel, and the FastAPI backend is ready for Railway. The backend currently returns deterministic structured suggestion cards so the full end-to-end surface can be tested before wiring in the deeper `maxmayes-chat` retrieval, verification, and synthesis orchestration.

## Current status

The project has three working surfaces: a React/Vite dashboard, a FastAPI review service, and a Manifest V3 Chrome extension side panel for Google Docs. The MVP review loop is already shaped around business-documentation workflows, but the intelligence layer is still a starter implementation.

| Area | Status | Notes |
|---|---|---|
| Web dashboard | Ready for Vercel | Built with React, TypeScript, Vite, Tailwind CSS 4, and shadcn/ui components. |
| API backend | Ready for Railway | FastAPI exposes `/health` and `POST /api/document-review`. |
| Chrome extension | Load-unpacked MVP | Captures Google Docs context through a content script and sends it to the backend. |
| Review logic | Deterministic starter | Replace `apps/api/app/services/reviewer.py` with the real `maxmayes-chat` orchestration in the next implementation phase. |
| CI workflow | Template included | The workflow template is stored at `docs/github_actions_ci_template.yml` because this GitHub token could not create `.github/workflows/*` directly. |

## Repository structure

| Path | Purpose |
|---|---|
| `apps/web` | Vercel-ready React/Vite dashboard and product UI starter. |
| `apps/api` | Railway-ready FastAPI backend with health and document-review endpoints. |
| `extension` | Manifest V3 Chrome extension with side panel, background service worker, and Google Docs content script. |
| `docs` | Architecture notes, deployment guide, implementation checklist, design notes, and CI template. |
| `vercel.json` | Root Vercel configuration for building and serving `apps/web`. |
| `pnpm-workspace.yaml` | pnpm workspace configuration for the monorepo. |

## Architecture

The first production path is intentionally simple: the Chrome extension reads document context from the open Google Doc, sends a structured review request to the FastAPI service, and renders prioritized coaching cards in the side panel. The dashboard provides a polished scope and product surface for the web layer.

| Layer | Technology | Responsibility |
|---|---|---|
| Chrome extension | Manifest V3, side panel API, content script | Detects Google Docs pages, extracts visible document text and selected text, lets the user choose review mode, and displays suggestions. |
| API backend | FastAPI, Pydantic | Validates document review requests, classifies the document type, selects review lenses, and returns structured suggestion cards. |
| Review router | Python service layer | Routes SOP, contract, policy, proposal, and general documents to different review lenses and knowledge-base names. |
| Web dashboard | React 19, TypeScript, Vite, Tailwind CSS 4 | Provides the public/product dashboard surface and deployment-ready frontend shell. |
| Future intelligence layer | `maxmayes-chat` orchestration, Pinecone, OpenAI | Intended path for retrieval, verification, synthesis, and source-grounded business coaching. |

## Local development

Install dependencies from the repository root first. The root workspace scripts keep the most common commands short and consistent.

```bash
pnpm install
```

The web dashboard runs from `apps/web` through the root script:

```bash
pnpm dev:web
```

The API runs locally on port `8000`:

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

You can also start the API from the root after installing the Python dependencies:

```bash
pnpm dev:api
```

## Verification commands

The starter has been validated with frontend, backend, and extension checks. Re-run these commands before deployment or before changing the extension review loop.

| Check | Command |
|---|---|
| TypeScript check | `pnpm check:web` |
| Production web build | `pnpm build:web` |
| Backend import and routes | `cd apps/api && python -c "from app.main import app; print([route.path for route in app.routes])"` |
| Extension JavaScript syntax | `node --check extension/content-script.js && node --check extension/background.js && node --check extension/sidepanel/panel.js` |
| Manifest JSON validation | `python -m json.tool extension/manifest.json` |

## API contract

The extension calls `POST /api/document-review` with a normalized document context. The backend accepts Google Docs, Notion, or manual review surfaces, although the current extension focuses on Google Docs.

```json
{
  "surface": "google_docs",
  "url": "https://docs.google.com/document/d/...",
  "title": "Example SOP",
  "document_text": "...",
  "selected_text": "...",
  "review_mode": "auto"
}
```

The response is intentionally structured so the extension can render coaching cards without parsing free-form chat text.

```json
{
  "readiness_score": 7.2,
  "route": {
    "document_type": "sop",
    "primary_lenses": ["ownership", "handoffs", "success criteria"],
    "knowledge_bases": ["operations_sop_library", "business_process_design"],
    "rationale": "..."
  },
  "executive_summary": "...",
  "suggestions": [
    {
      "id": "...",
      "severity": "high",
      "lens": "ownership",
      "title": "Clarify who owns the handoff",
      "why_it_matters": "...",
      "recommended_revision": "...",
      "follow_up_question": "..."
    }
  ],
  "next_best_action": "..."
}
```

## Chrome extension setup

Start the API locally before loading the extension. The extension defaults to `http://localhost:8000` for local testing and can later be pointed to the Railway API URL from the side panel.

| Step | Action |
|---|---|
| 1 | Open Chrome and go to `chrome://extensions`. |
| 2 | Enable **Developer Mode**. |
| 3 | Click **Load unpacked** and select the `extension` directory from this repository. |
| 4 | Open a Google Doc at a URL matching `https://docs.google.com/document/d/*`. |
| 5 | Click the Docs Coach extension action to open the side panel. |
| 6 | Confirm the API URL and click the review button to receive coaching suggestions. |

The MVP uses conservative DOM-based extraction from Google Docs. It captures visible editor text, selected text, title, URL, and a lightweight document-change hash. Production-grade full-document review should add Google OAuth and Google Docs API extraction so the backend can review the complete document structure reliably.

## Vercel deployment

Use the **repository root** as the Vercel root directory. The included root-level `vercel.json` already tells Vercel how to install, build, and serve the dashboard from `apps/web`.

| Vercel setting | Value |
|---|---|
| Root Directory | Repository root, `./`, or leave blank |
| Install Command | `pnpm install --frozen-lockfile=false` |
| Build Command | `cd apps/web && pnpm install --frozen-lockfile=false && pnpm build` |
| Output Directory | `apps/web/dist` |

Set `VITE_API_BASE_URL` to the Railway API URL after the backend is deployed. The current dashboard is mostly static, so the frontend can deploy before the production API is connected.

## Railway deployment

Create a Railway service from the same GitHub repository and set the service root to `apps/api`. Railway should use the included Dockerfile and health check configuration.

| Railway setting | Value |
|---|---|
| Service root | `apps/api` |
| Dockerfile | `apps/api/Dockerfile` |
| Health check path | `/health` |
| Start command | Provided by the Dockerfile / Procfile configuration |

Add these environment variables when connecting the real intelligence layer:

| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated allowed frontend origins, such as local dev and the Vercel app URL. |
| `ALLOWED_ORIGIN_REGEX` | Regex for preview deployments and Chrome extension origins. |
| `OPENAI_API_KEY` | OpenAI key for the future LLM review path. |
| `PINECONE_API_KEY` | Pinecone key for retrieval against business-documentation knowledge bases. |
| `PINECONE_INDEX_NAME` | Pinecone index name used by the retrieval layer. |

## GitHub Actions note

A CI workflow template is included at `docs/github_actions_ci_template.yml`. It is not currently placed under `.github/workflows/ci.yml` because the GitHub App token used for the initial push did not have permission to create or update workflow files. If you want GitHub Actions enabled, copy that template into `.github/workflows/ci.yml` manually from GitHub or grant workflow permissions and commit it in a follow-up change.

## Next implementation phase

The next important engineering task is replacing the deterministic reviewer in `apps/api/app/services/reviewer.py` with the real `maxmayes-chat` intelligence path. The intended sequence is document classification, knowledge-base routing, Pinecone retrieval, retrieved-source verification, synthesis, and structured suggestion-card formatting.

| Phase | Outcome |
|---|---|
| Integrate `maxmayes-chat` orchestration | Reviews become knowledge-grounded instead of deterministic heuristics. |
| Add Google OAuth and Docs API ingestion | Extension can review full document structure instead of visible DOM text only. |
| Add changed-section review | The extension can provide lightweight coaching after edits without re-reviewing the entire document. |
| Add safe apply actions | Users can copy suggested rewrites or explicitly insert changes after confirmation. |
| Package for Chrome Web Store | Publish only after OAuth, permissions, privacy copy, and review-quality guardrails are complete. |

## Useful docs

| Document | Purpose |
|---|---|
| `docs/deployment.md` | Vercel, Railway, and extension deployment notes. |
| `docs/implementation_checklist.md` | Step-by-step path from MVP to production-ready document coach. |
| `docs/scope.md` | Product scope, user flow, and business-documentation focus. |
| `docs/design_ideas.md` | Visual design direction used for the dashboard prototype. |
| `docs/github_actions_ci_template.yml` | CI workflow template that can be moved into `.github/workflows/ci.yml` later. |

## Product boundary

Docs Coach is focused on business documentation. The first-class document types are SOPs, contracts, policies, proposals, operating memos, and general business process documents. Product-management templates, roadmap coaching, and PRD-specific review modes are intentionally out of scope for this starter unless they are added as separate review lenses later.
