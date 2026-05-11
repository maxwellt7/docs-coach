from typing import Literal
from pydantic import BaseModel, Field, model_validator

DocumentSurface = Literal['google_docs', 'notion', 'manual']
ReviewMode = Literal['auto', 'sop', 'contract', 'policy', 'proposal', 'general']
Severity = Literal['high', 'medium', 'low']


class DocumentContext(BaseModel):
    surface: DocumentSurface = 'manual'
    url: str | None = None
    title: str | None = None
    document_text: str = Field(default='', max_length=50000)
    paragraphs: list[str] = Field(default_factory=list)
    selected_text: str | None = Field(default=None, max_length=12000)
    review_mode: ReviewMode = 'auto'

    @model_validator(mode='after')
    def derive_paragraphs(self):
        if not self.paragraphs and self.document_text:
            self.paragraphs = [
                p.strip()
                for p in self.document_text.split('\n\n')
                if p.strip()
            ]
        if not self.document_text and self.paragraphs:
            self.document_text = '\n\n'.join(self.paragraphs)
        if not self.paragraphs and not self.document_text:
            raise ValueError(
                'Either document_text or paragraphs must be provided.'
            )
        return self


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
    paragraph_index: int | None = None
    anchor_snippet: str | None = None


class DocumentReviewResponse(BaseModel):
    readiness_score: float = Field(..., ge=0, le=10)
    route: KnowledgeRoute
    executive_summary: str
    suggestions: list[Suggestion]
    next_best_action: str
