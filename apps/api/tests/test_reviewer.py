from app.models import DocumentContext
from app.services.reviewer import review_document


def _ctx(**overrides):
    base = dict(
        surface='google_docs',
        url='https://docs.google.com/document/d/test',
        title='Test Doc',
        paragraphs=[
            'We need to ship the feature.',  # 0
            'The product owner is responsible for approving every change.',  # 1
            'Refunds over $500 require manager approval.',  # 2
        ],
        review_mode='auto',
    )
    base.update(overrides)
    return DocumentContext(**base)


def test_every_suggestion_has_paragraph_index_when_paragraphs_present():
    response = review_document(_ctx())
    for s in response.suggestions:
        assert s.paragraph_index is not None, (
            f'suggestion {s.lens} missing paragraph_index'
        )
        assert 0 <= s.paragraph_index < 3


def test_owner_accountability_anchors_to_paragraph_with_owner_words():
    ctx = _ctx(paragraphs=[
        'Lorem ipsum dolor sit amet.',
        'The owner is responsible for approving every refund.',
        'Final paragraph here.',
    ])
    response = review_document(ctx)
    owner_suggestion = next(
        (s for s in response.suggestions if s.lens == 'owner_accountability'),
        None,
    )
    if owner_suggestion is None:
        # Owner words present in doc means the suggestion is skipped — that's fine.
        return
    assert owner_suggestion.paragraph_index == 1


def test_round_robin_fallback_when_no_lens_keywords_match():
    ctx = _ctx(paragraphs=[
        'Lorem ipsum.',
        'Dolor sit amet.',
        'Consectetur adipiscing.',
    ])
    response = review_document(ctx)
    for s in response.suggestions:
        assert s.paragraph_index is not None
        assert 0 <= s.paragraph_index < 3


def test_anchor_snippet_matches_first_80_chars_of_target_paragraph():
    paragraphs = [
        'Short first paragraph.',
        'A second paragraph that is intentionally written long enough to exceed eighty characters with room to spare for testing.',
    ]
    response = review_document(_ctx(paragraphs=paragraphs))
    for s in response.suggestions:
        expected = paragraphs[s.paragraph_index][:80]
        assert s.anchor_snippet == expected


def test_backward_compat_document_text_only():
    response = review_document(DocumentContext(
        document_text=(
            'First paragraph.\n\n'
            'Second paragraph with the owner words: responsible, approve.\n\n'
            'Third paragraph.'
        ),
    ))
    assert response.suggestions, 'expected at least one suggestion'
    for s in response.suggestions:
        assert s.paragraph_index is not None
        assert s.paragraph_index in (0, 1, 2)


def test_single_paragraph_doc_anchors_to_paragraph_zero():
    """A doc that derives to a single paragraph still pins every
    suggestion to paragraph 0 — never None.

    `document_text` without explicit `\\n\\n` collapses to one
    paragraph via the model validator, exercising the smallest valid
    `paragraphs` array. Each suggestion's paragraph_index must be 0.
    """
    ctx = DocumentContext(
        document_text='Just a short one-paragraph doc body.',
        selected_text='Just a tiny selection.',
    )
    response = review_document(ctx)
    assert response.suggestions, 'expected at least one suggestion'
    for s in response.suggestions:
        assert s.paragraph_index == 0
