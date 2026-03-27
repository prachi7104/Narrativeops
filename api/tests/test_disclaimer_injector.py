from api.agents.disclaimer_injector import run_disclaimer_injector
from api.graph.state import ContentState


def make_state(draft: str) -> ContentState:
    return {
        "run_id": "test-disclaimer-001",
        "brief": {},
        "engagement_data": None,
        "strategy": {},
        "past_feedback": [],
        "draft": draft,
        "draft_version": 1,
        "compliance_verdict": "",
        "compliance_feedback": [],
        "compliance_iterations": 0,
        "localized_hi": "",
        "blog_html": "",
        "twitter_thread": [],
        "linkedin_post": "",
        "whatsapp_message": "",
        "human_approved": False,
        "escalation_required": False,
        "error_message": None,
        "pipeline_status": "draft_complete",
        "audit_log": [],
    }


def test_injects_disclaimer_when_missing():
    draft = "##INTRO\nHere is an intro.\n\n##BODY\nHere is the body.\n\n##CONCLUSION\nHere is the conclusion."

    result = run_disclaimer_injector(make_state(draft))

    assert "investments are subject to market risk" in result["draft"].lower()
    assert result["audit_log"][-1]["action"] == "injected"


def test_does_not_duplicate_disclaimer_when_present():
    draft = (
        "##INTRO\nIntro.\n\n##BODY\nBody.\n\n##CONCLUSION\n"
        "Investments are subject to market risk. Please read all scheme-related documents carefully before investing."
    )

    result = run_disclaimer_injector(make_state(draft))

    count = result["draft"].lower().count("investments are subject to market risk")
    assert count == 1
    assert result["audit_log"][-1]["action"] == "skipped"


def test_disclaimer_placed_after_conclusion_marker():
    draft = "##INTRO\nIntro.\n\n##BODY\nBody.\n\n##CONCLUSION\nConclusion text."

    result = run_disclaimer_injector(make_state(draft))

    conclusion_position = result["draft"].find("##CONCLUSION")
    disclaimer_position = result["draft"].lower().find("investments are subject to market risk")

    assert disclaimer_position > conclusion_position


def test_disclaimer_appended_when_no_conclusion_marker():
    draft = "Some content with no section markers and no disclaimer."

    result = run_disclaimer_injector(make_state(draft))

    assert result["draft"].endswith(
        "Investments are subject to market risk. "
        "Please read all scheme-related documents carefully before investing."
    )
    assert result["audit_log"][-1]["action"] == "injected"


def test_audit_log_entry_always_appended():
    state = make_state("##CONCLUSION\nConclusion text.")
    state["audit_log"] = [
        {"agent": "intake_agent", "action": "done"},
        {"agent": "draft_agent", "action": "done"},
    ]

    result = run_disclaimer_injector(state)

    assert len(result["audit_log"]) == 3


def test_agent_name_is_correct_in_audit_log():
    result = run_disclaimer_injector(make_state("##CONCLUSION\nConclusion text."))

    assert result["audit_log"][-1]["agent"] == "disclaimer_injector"


def test_partial_disclaimer_gets_replaced_with_canonical():
    """A draft with only part of the disclaimer should have the partial removed and full canonical injected."""
    draft = (
        "##INTRO\nIntro.\n\n##BODY\nBody.\n\n##CONCLUSION\n"
        "Investments are subject to market risk, and users should carefully evaluate their options."
    )

    result = run_disclaimer_injector(make_state(draft))

    full_canonical = (
        "Investments are subject to market risk. "
        "Please read all scheme-related documents carefully before investing."
    )
    assert full_canonical in result["draft"]
    # Action must be 'injected' (not 'skipped') since the canonical form wasn't present
    assert result["audit_log"][-1]["action"] == "injected"
    # Must appear exactly once — no duplicates
    assert result["draft"].lower().count("investments are subject to market risk") == 1


def test_exact_canonical_skips_injection():
    """If EXACT canonical disclaimer is present, action must be 'skipped'."""
    draft = (
        "##CONCLUSION\n"
        "Investments are subject to market risk. "
        "Please read all scheme-related documents carefully before investing."
    )

    result = run_disclaimer_injector(make_state(draft))

    assert result["audit_log"][-1]["action"] == "skipped"
    # Still only one occurrence
    assert result["draft"].lower().count("investments are subject to market risk") == 1
