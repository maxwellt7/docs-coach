from __future__ import annotations

from app.models import DocumentContext, KnowledgeRoute

SOP_TERMS = {'sop', 'procedure', 'process', 'workflow', 'handoff', 'operator', 'checklist', 'escalation'}
CONTRACT_TERMS = {'agreement', 'contract', 'clause', 'party', 'term', 'liability', 'indemnity', 'termination'}
POLICY_TERMS = {'policy', 'must', 'compliance', 'approval', 'exception', 'standard'}
PROPOSAL_TERMS = {'proposal', 'scope', 'pricing', 'timeline', 'deliverable', 'client'}


def infer_document_type(context: DocumentContext) -> str:
    if context.review_mode != 'auto':
        return context.review_mode

    text = f"{context.title or ''}\n{context.document_text}".lower()
    scores = {
        'sop': sum(term in text for term in SOP_TERMS),
        'contract': sum(term in text for term in CONTRACT_TERMS),
        'policy': sum(term in text for term in POLICY_TERMS),
        'proposal': sum(term in text for term in PROPOSAL_TERMS),
    }
    winner, score = max(scores.items(), key=lambda item: item[1])
    return winner if score else 'general'


def route_knowledge(context: DocumentContext) -> KnowledgeRoute:
    document_type = infer_document_type(context)

    base_lenses = ['clarity', 'reader_intent', 'missing_context', 'decision_quality']
    routes = {
        'sop': (
            base_lenses + ['owner_accountability', 'handoffs', 'success_criteria', 'operational_risk'],
            ['business_best_practices', 'sop_operations', 'delegation_and_accountability'],
            'The document looks operational, so the review prioritizes accountable owners, handoffs, escalation, and measurable completion criteria.',
        ),
        'contract': (
            base_lenses + ['obligations', 'ambiguity', 'risk_allocation', 'commercial_terms'],
            ['business_best_practices', 'contract_review_playbook', 'risk_and_compliance'],
            'The document looks contractual, so the review prioritizes obligations, ambiguous terms, remedies, timelines, and business risk.',
        ),
        'policy': (
            base_lenses + ['compliance', 'exceptions', 'enforcement', 'operating_standard'],
            ['business_best_practices', 'policy_governance', 'risk_and_compliance'],
            'The document looks like a policy, so the review prioritizes enforceability, exceptions, decision rights, and implementation clarity.',
        ),
        'proposal': (
            base_lenses + ['buyer_outcome', 'scope_clarity', 'value_case', 'commercial_next_step'],
            ['business_best_practices', 'proposal_and_gtm', 'client_communication'],
            'The document looks like a proposal, so the review prioritizes buyer clarity, value, scope boundaries, and commercial next steps.',
        ),
        'general': (
            base_lenses + ['accountability', 'risk', 'specificity'],
            ['business_best_practices', 'executive_communication', 'operating_principles'],
            'The document type is general, so the review uses a broad business-documentation coaching sequence.',
        ),
    }
    lenses, knowledge_bases, rationale = routes.get(document_type, routes['general'])
    return KnowledgeRoute(
        document_type=document_type,
        primary_lenses=lenses,
        knowledge_bases=knowledge_bases,
        rationale=rationale,
    )
