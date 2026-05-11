from __future__ import annotations

import hashlib
from app.models import DocumentContext, DocumentReviewResponse, Suggestion
from app.services.anchoring import pick_paragraph_for_lens
from app.services.router import route_knowledge


def _id(text: str) -> str:
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:10]


def _snippet(paragraph: str) -> str:
    return paragraph[:80]


def _attach_anchor(
    suggestion: Suggestion,
    paragraphs: list[str],
    fallback_index: int,
) -> Suggestion:
    """Set paragraph_index + anchor_snippet on a suggestion.

    Uses the keyword-density helper. If the helper returns None and we
    do have paragraphs, fall back to the provided round-robin index.
    """
    if not paragraphs:
        return suggestion
    idx = pick_paragraph_for_lens(suggestion.lens, paragraphs)
    if idx is None:
        idx = fallback_index % len(paragraphs)
    return suggestion.model_copy(update={
        'paragraph_index': idx,
        'anchor_snippet': _snippet(paragraphs[idx]),
    })


def review_document(context: DocumentContext) -> DocumentReviewResponse:
    route = route_knowledge(context)
    text = context.selected_text or context.document_text
    lower = text.lower()
    raw: list[Suggestion] = []

    if not any(term in lower for term in ['owner', 'responsible', 'accountable', 'approver']):
        raw.append(Suggestion(
            id=_id('owner' + text[:300]),
            severity='high',
            lens='owner_accountability',
            title='Name the accountable owner before publishing',
            why_it_matters='Business documentation fails when readers cannot tell who owns execution, approval, or escalation.',
            recommended_revision='Add a short accountability block that names the owner role, backup role, approver, and escalation path.',
            follow_up_question='Who is accountable if this document creates confusion or the process breaks?',
        ))

    if not any(term in lower for term in ['success', 'metric', 'done when', 'complete when', 'kpi', 'quality bar']):
        raw.append(Suggestion(
            id=_id('success' + text[:300]),
            severity='medium',
            lens='success_criteria',
            title='Define how the reader knows the work is complete',
            why_it_matters='A document can be clear sentence-by-sentence but still weak operationally if it lacks a completion standard.',
            recommended_revision='Add explicit success criteria, acceptance criteria, or a short "done when" section.',
            follow_up_question='What evidence should prove that this SOP, policy, or agreement worked as intended?',
        ))

    if route.document_type == 'contract' and not any(term in lower for term in ['termination', 'remedy', 'liability', 'notice']):
        raw.append(Suggestion(
            id=_id('contract-risk' + text[:300]),
            severity='high',
            lens='contract_risk',
            title='Add business-risk guardrails around obligations',
            why_it_matters='Contract language should make obligations, remedies, timelines, and exit paths hard to misinterpret.',
            recommended_revision='Review whether the agreement needs clearer notice, termination, liability, remedy, and timeline language.',
            follow_up_question='What is the business consequence if the other party underperforms or interprets this differently?',
        ))

    if len(text.split()) < 120:
        raw.append(Suggestion(
            id=_id('context' + text[:300]),
            severity='low',
            lens='missing_context',
            title='Provide more context before asking for a full review',
            why_it_matters='Short excerpts can produce useful suggestions, but whole-section context improves routing and recommendation quality.',
            recommended_revision='Run the review on a full section or entire document once Google Docs API ingestion is connected.',
            follow_up_question=None,
        ))

    if not raw:
        raw.append(Suggestion(
            id=_id('polish' + text[:300]),
            severity='low',
            lens='clarity',
            title='Tighten the reader promise at the top',
            why_it_matters='Strong business documents tell the reader what decision, action, or standard the document enables.',
            recommended_revision='Add a one-sentence opening that says who this is for, what it helps them do, and when to use it.',
            follow_up_question='What should a busy operator understand in the first thirty seconds?',
        ))

    # Cap at 5 suggestions, then attach anchors using the keyword helper
    # with a round-robin fallback so every suggestion has a paragraph_index
    # as long as we have at least one paragraph.
    capped = raw[:5]
    anchored = [
        _attach_anchor(s, context.paragraphs, fallback_index=i)
        for i, s in enumerate(capped)
    ]

    penalty = min(len(anchored) * 0.85, 4.5)
    score = round(max(10 - penalty, 1), 1)
    return DocumentReviewResponse(
        readiness_score=score,
        route=route,
        executive_summary=f'This starter review classified the document as {route.document_type} and routed it through {", ".join(route.knowledge_bases)}.',
        suggestions=anchored,
        next_best_action='Address the highest-severity suggestion, then rerun the review on the revised section.',
    )
