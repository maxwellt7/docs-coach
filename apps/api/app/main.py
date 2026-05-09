from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models import DocumentContext, DocumentReviewResponse
from app.services.reviewer import review_document


def _origins() -> list[str]:
    raw = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000,chrome-extension://*')
    return [item.strip() for item in raw.split(',') if item.strip()]


app = FastAPI(
    title='Docs Coach API',
    version='0.1.0',
    description='Starter API for reviewing Google Docs, SOPs, contracts, and business documentation.',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins(),
    allow_origin_regex=os.getenv('ALLOWED_ORIGIN_REGEX', r'https://.*\.vercel\.app|chrome-extension://.*'),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'docs-coach-api'}


@app.post('/api/document-review', response_model=DocumentReviewResponse)
def document_review(context: DocumentContext) -> DocumentReviewResponse:
    return review_document(context)
