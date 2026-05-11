import pytest
from pydantic import ValidationError
from app.models import DocumentContext, Suggestion


def test_document_context_accepts_paragraphs():
    ctx = DocumentContext(
        document_text='unused',
        paragraphs=['First paragraph.', 'Second paragraph.'],
    )
    assert ctx.paragraphs == ['First paragraph.', 'Second paragraph.']


def test_document_context_derives_paragraphs_from_document_text():
    ctx = DocumentContext(
        document_text='Para one.\n\nPara two.\n\n  Para three.  ',
    )
    assert ctx.paragraphs == ['Para one.', 'Para two.', 'Para three.']


def test_document_context_paragraphs_preserved_when_both_present():
    ctx = DocumentContext(
        document_text='ignored\n\nignored2',
        paragraphs=['Real para.'],
    )
    assert ctx.paragraphs == ['Real para.']


def test_document_context_requires_some_text():
    with pytest.raises(ValidationError):
        DocumentContext(document_text='', paragraphs=[])


def test_suggestion_accepts_anchor_fields():
    s = Suggestion(
        id='abc',
        severity='high',
        lens='owner_accountability',
        title='t',
        why_it_matters='w',
        recommended_revision='r',
        paragraph_index=2,
        anchor_snippet='A short excerpt.',
    )
    assert s.paragraph_index == 2
    assert s.anchor_snippet == 'A short excerpt.'


def test_suggestion_anchor_fields_default_to_none():
    s = Suggestion(
        id='abc', severity='low', lens='clarity',
        title='t', why_it_matters='w', recommended_revision='r',
    )
    assert s.paragraph_index is None
    assert s.anchor_snippet is None


def test_document_context_rejects_all_whitespace_paragraphs():
    with pytest.raises(ValidationError):
        DocumentContext(paragraphs=['', '  ', '\t'])


def test_document_context_syncs_document_text_from_paragraphs():
    ctx = DocumentContext(
        document_text='ignored\n\nignored2',
        paragraphs=['Real para.'],
    )
    assert ctx.paragraphs == ['Real para.']
    assert ctx.document_text == 'Real para.'


def test_document_context_strips_whitespace_from_provided_paragraphs():
    ctx = DocumentContext(paragraphs=['  one  ', '', 'two', '   '])
    assert ctx.paragraphs == ['one', 'two']
    assert ctx.document_text == 'one\n\ntwo'
