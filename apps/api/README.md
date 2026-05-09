# Docs Coach API

This FastAPI service is the Railway-facing backend starter for Docs Coach. It exposes a health check and a structured document-review endpoint that the Chrome extension side panel can call.

## Local development

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then visit `http://localhost:8000/health`.

## Railway

Create a Railway service from this repository and set the service root to `apps/api`. Railway can build from the included `Dockerfile` and `railway.toml`. Add real LLM, Pinecone, and auth variables in Railway only after the starter endpoint is live.
