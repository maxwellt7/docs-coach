# Docs Coach

Docs Coach is a starter codebase for a Reforge-style business-documentation coach that reviews SOPs, contracts, policies, proposals, and operating documents from Google Docs. It combines a Chrome extension side panel, a Vercel-hosted web dashboard, and a Railway-hosted FastAPI API.

This repository intentionally starts with a low-troubleshooting MVP. The backend returns deterministic structured review cards today, while the next implementation phase can swap the reviewer service into the existing `maxmayes-chat` orchestration, Pinecone retrieval, verifier, and synthesis stack.

## Repository structure

| Path | Purpose |
|---|---|
| `apps/web` | Vercel-ready React/Vite scope dashboard and product UI starter. |
| `apps/api` | Railway-ready FastAPI service with `/health` and `/api/document-review`. |
| `extension` | Manifest V3 Chrome extension side panel for Google Docs. |
| `docs` | Architecture, implementation, deployment, and design notes. |

## Local quick start

```bash
pnpm install
pnpm build:web

cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In another terminal, run the web dashboard:

```bash
pnpm dev:web
```

Then load the `extension` directory in Chrome through `chrome://extensions` with Developer Mode enabled.

## Deployment targets

| Layer | Platform | Configuration |
|---|---|---|
| Web dashboard | Vercel | Root `vercel.json`, output `apps/web/dist`. |
| API backend | Railway | `apps/api/Dockerfile` and `apps/api/railway.toml`. |
| Extension | Chrome | Load unpacked from `extension` first; package later after OAuth and privacy review. |

## API contract

The extension calls `POST /api/document-review` with document context:

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

The API returns a readiness score, the selected knowledge-route sequence, and prioritized suggestion cards.

## Next implementation phase

The next phase is to replace `apps/api/app/services/reviewer.py` with the real `maxmayes-chat` orchestration path. The intended sequence is document classification, knowledge-base routing, retrieval, verification, synthesis, and structured suggestion output.

See `docs/deployment.md` and `docs/implementation_checklist.md` for the deployment and build path.
