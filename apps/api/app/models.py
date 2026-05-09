from typing import Literal
from pydantic import BaseModel, Field

DocumentSurface = Literal['google_docs', 'notion', 'manual']
ReviewMode = Literal['auto', 'sop', 'contract', 'policy', 'proposal', 'general']
Severity = Literal['high', 'medium', 'low']


class DocumentContext(BaseModel):
    surface: DocumentSurface = 'manual'
    url: str | None = None
    title: str | None = None
    document_text: str = Field(..., min_length=1, max_length=50000)
    selected_text: str | None = Field(default=None, max_length=12000)
    review_mode: ReviewMode = 'auto'


class KnowledgeRoute(BaseModel):
    document_type: str
    primary_lenses: list[str]
    knowledge_bases: list[str]
    rationale: str


class Suggestion(BaseModel):
    id: str
    severity: Severity
    lens: str
    title: str
    why_it_matters: str
    recommended_revision: str
    follow_up_question: str | None = None


class DocumentReviewResponse(BaseModel):
    readiness_score: float = Field(..., ge=0, le=10)
    route: KnowledgeRoute
    executive_summary: str
    suggestions: list[Suggestion]
    next_best_action: str
