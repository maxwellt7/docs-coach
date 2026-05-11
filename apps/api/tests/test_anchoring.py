from app.services.anchoring import pick_paragraph_for_lens, LENS_KEYWORDS


def test_picks_paragraph_with_highest_keyword_density():
    paragraphs = [
        'The team writes quarterly reports.',
        'The owner is responsible for approving every change.',
        'We monitor the system continuously.',
    ]
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx == 1


def test_returns_none_when_no_keyword_matches():
    paragraphs = [
        'Lorem ipsum dolor sit amet.',
        'Consectetur adipiscing elit.',
    ]
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx is None


def test_unknown_lens_returns_none():
    paragraphs = ['Any text.']
    idx = pick_paragraph_for_lens('does_not_exist', paragraphs)
    assert idx is None


def test_empty_paragraphs_returns_none():
    idx = pick_paragraph_for_lens('clarity', [])
    assert idx is None


def test_ties_resolve_to_earliest_paragraph():
    paragraphs = [
        'The owner must approve.',
        'The owner must approve.',
    ]
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx == 0


def test_known_lenses_have_keyword_lists():
    expected = {
        'owner_accountability', 'success_criteria', 'compliance',
        'clarity', 'reader_intent', 'missing_context', 'decision_quality',
        'exceptions', 'enforcement', 'operating_standard',
        'policy_governance', 'risk_and_compliance', 'client_communication',
        'contract_risk',
    }
    assert expected.issubset(LENS_KEYWORDS.keys())


def test_case_insensitive_matching():
    paragraphs = ['THE OWNER IS RESPONSIBLE.']
    idx = pick_paragraph_for_lens('owner_accountability', paragraphs)
    assert idx == 0
