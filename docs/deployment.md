# Deployment guide

Docs Coach is split into three deployable surfaces: a Vercel-hosted web dashboard, a Railway-hosted FastAPI backend, and a manually installed Chrome extension starter.

| Surface | Directory | Platform | Notes |
|---|---|---|---|
| Web dashboard | `apps/web` | Vercel | Use the repository root with the included `vercel.json`, or set the Vercel root directory to `apps/web`. |
| API backend | `apps/api` | Railway | Use the included `Dockerfile` and `railway.toml`; set service root to `apps/api`. |
| Chrome extension | `extension` | Chrome unpacked install first | Later package and publish after OAuth, permissions, and privacy review are finalized. |

## Vercel setup

Create a new Vercel project from `maxwellt7/docs-coach`. The included root `vercel.json` runs `cd apps/web && pnpm install --frozen-lockfile=false && pnpm build` and serves `apps/web/dist`.

Set `VITE_API_BASE_URL` to the Railway API URL after Railway deployment. The current scope dashboard is static, so it can deploy before the API is connected.

## Railway setup

Create a Railway service from the same GitHub repository and set the root directory to `apps/api`. Railway will use the `Dockerfile` and expose `/health`.

Set these Railway variables when you connect the real maxmayes-chat intelligence layer:

```bash
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app|chrome-extension://.*
OPENAI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=...
```

## Extension setup

The extension defaults to `http://localhost:8000` for local testing. After Railway is live, open the side panel and change the API URL to the Railway service URL.

The MVP uses visible DOM extraction from Google Docs. Production-grade full-document review should add Google OAuth and Google Docs API extraction after the review endpoint contract is stable.
