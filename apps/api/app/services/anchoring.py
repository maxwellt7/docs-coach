"""Heuristic paragraph anchoring for review suggestions.

Each lens defines a small keyword set. For a given lens and a list of
paragraphs, return the index of the paragraph with the highest count of
lens keywords. Ties resolve to the earlier paragraph. If no keyword
matches anywhere, return None and let the caller decide on a fallback.
"""

from __future__ import annotations

LENS_KEYWORDS: dict[str, list[str]] = {
    'owner_accountability': [
        'owner', 'responsible', 'approve', 'decision', 'team',
        'accountable', 'lead', 'approver',
    ],
    'success_criteria': [
        'complete', 'done', 'deliver', 'criteria', 'metric',
        'success', 'outcome', 'kpi', 'quality bar',
    ],
    'compliance': [
        'must', 'required', 'policy', 'shall', 'comply',
        'regulation', 'mandatory',
    ],
    'clarity': [
        'clearly', 'define', 'mean', 'ambiguous', 'vague', 'confusion',
    ],
    'reader_intent': [
        'reader', 'audience', 'customer', 'user', 'who',
    ],
    'missing_context': [
        'background', 'context', 'why', 'history', 'rationale',
    ],
    'decision_quality': [
        'decide', 'decision', 'choose', 'criteria', 'option', 'trade-off',
    ],
    'exceptions': [
        'except', 'unless', 'edge case', 'exception', 'escalate',
    ],
    'enforcement': [
        'enforce', 'audit', 'monitor', 'review', 'escalate', 'breach',
    ],
    'operating_standard': [
        'standard', 'sla', 'sop', 'process', 'procedure', 'step',
    ],
    'policy_governance': [
        'governance', 'approval', 'owner', 'authority', 'scope',
    ],
    'risk_and_compliance': [
        'risk', 'compliance', 'exposure', 'liability', 'breach',
    ],
    'client_communication': [
        'client', 'customer', 'communicate', 'response', 'sla',
    ],
    'contract_risk': [
        'termination', 'remedy', 'liability', 'notice', 'breach',
        'indemnif',  # matches indemnify, indemnification
    ],
}


def pick_paragraph_for_lens(
    lens: str,
    paragraphs: list[str],
) -> int | None:
    """Return the index of the best-matching paragraph for the given lens.

    Scoring: lowercase each paragraph, count occurrences of each lens
    keyword (substring match), and pick the highest-scoring paragraph.
    Ties resolve to the earliest paragraph. Returns None if the lens is
    unknown, the paragraphs list is empty, or no paragraph scores above 0.
    """
    if not paragraphs:
        return None
    keywords = LENS_KEYWORDS.get(lens)
    if not keywords:
        return None

    best_idx: int | None = None
    best_score = 0
    for idx, paragraph in enumerate(paragraphs):
        lowered = paragraph.lower()
        score = sum(lowered.count(kw) for kw in keywords)
        if score > best_score:
            best_score = score
            best_idx = idx
    return best_idx
