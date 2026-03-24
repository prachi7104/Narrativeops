import os
import re
from pathlib import Path

import pytest
from dotenv import load_dotenv

from api.agents.localization_agent import run_localization_agent

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
_GROQ_API_KEY_HEAVY = os.getenv("GROQ_API_KEY_HEAVY", "").strip()

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not _GROQ_API_KEY_HEAVY,
        reason="GROQ_API_KEY_HEAVY is not set",
    ),
]


def test_hindi_output_contains_devanagari_script(minimal_content_state):
    draft = (
        "##INTRO\n"
        "SIP is one of the most practical ways to invest regularly for long-term goals.\n\n"
        "##BODY\n"
        "It helps reduce timing risk by spreading investments across months. "
        "Always remember that market returns can fluctuate and are not guaranteed.\n\n"
        "##CONCLUSION\n"
        "Invest with discipline and review your goals every year."
    )
    state = minimal_content_state(draft)

    result = run_localization_agent(state)
    output = result["localized_hi"]

    assert re.search(r"[\u0900-\u097F]", output) is not None
    assert len(output) > 100


def test_hindi_preserves_section_markers(minimal_content_state):
    draft = (
        "##INTRO\n"
        "Investing regularly can build wealth over time.\n\n"
        "##BODY\n"
        "A SIP approach can smooth market volatility when held for the long term.\n\n"
        "##CONCLUSION\n"
        "Stay patient and align investments with your risk profile."
    )
    state = minimal_content_state(draft)

    result = run_localization_agent(state)
    output = result["localized_hi"]

    assert "##INTRO" in output
    assert "##BODY" in output
    assert "##CONCLUSION" in output


def test_hindi_does_not_use_western_references(minimal_content_state):
    draft = (
        "##INTRO\n"
        "Many professionals use a 401k retirement plan to save consistently.\n\n"
        "##BODY\n"
        "The idea is long-term disciplined contributions with tax efficiency.\n\n"
        "##CONCLUSION\n"
        "Choose the structure that best fits your retirement goals."
    )
    state = minimal_content_state(draft)

    result = run_localization_agent(state)
    output = result["localized_hi"]

    assert "401k" not in output.lower()


def test_hindi_preserves_financial_terms_correctly(minimal_content_state):
    draft = (
        "##INTRO\n"
        "SIP can be effective for goal-based investing.\n\n"
        "##BODY\n"
        "SEBI regulations and NPS structures are important for long-term planning in India.\n\n"
        "##CONCLUSION\n"
        "Use trusted, regulated channels and stay informed."
    )
    state = minimal_content_state(draft)

    result = run_localization_agent(state)
    output = result["localized_hi"]

    assert ("एसआईपी" in output) or ("SIP" in output)
    assert any(term in output for term in ["सेबी", "SEBI", "एनपीएस", "NPS"])
