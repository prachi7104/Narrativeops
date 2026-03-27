"""
Unit tests for pipeline routing logic.
"""

import pytest

from api.graph.pipeline import build_pipeline
from api.graph.routing import route_after_compliance


@pytest.fixture
def base_state():
    """Base ContentState with minimal required fields for routing tests."""
    return {
        "run_id": "test-123",
        "brief": {},
        "engagement_data": None,
        "strategy": {},
        "past_feedback": [],
        "draft": "",
        "draft_version": 0,
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
        "pipeline_status": "",
        "audit_log": [],
    }


def test_compliance_pass_routes_to_localization(base_state):
    """Test that PASS verdict routes to localization_agent."""
    base_state["compliance_verdict"] = "PASS"
    base_state["compliance_iterations"] = 1

    result = route_after_compliance(base_state)

    assert result == "localization_agent"


def test_compliance_revise_routes_to_draft(base_state):
    """Test that REVISE verdict with errors and iterations < 3 routes to draft_agent."""
    base_state["compliance_verdict"] = "REVISE"
    base_state["compliance_iterations"] = 1
    base_state["compliance_feedback"] = [{"severity": "error", "message": "test error"}]

    result = route_after_compliance(base_state)

    assert result == "draft_agent"


def test_compliance_iter3_with_errors_still_routes_to_draft(base_state):
    """Test that iteration=3 with errors still routes to draft_agent (not escalation — threshold is now 5)."""
    base_state["compliance_verdict"] = "REVISE"
    base_state["compliance_iterations"] = 3
    base_state["compliance_feedback"] = [{"severity": "error", "message": "unfixed error"}]

    result = route_after_compliance(base_state)

    assert result == "draft_agent"


def test_compliance_soft_pass_warnings_only_after_iter3(base_state):
    """Test soft-pass: after iteration >= 3, if only warnings remain, route to localization."""
    base_state["compliance_verdict"] = "REVISE"
    base_state["compliance_iterations"] = 3
    base_state["compliance_feedback"] = [{"severity": "warning", "message": "minor style warning"}]

    result = route_after_compliance(base_state)

    assert result == "localization_agent"


def test_compliance_soft_pass_empty_feedback_after_iter3(base_state):
    """Test soft-pass: after iteration >= 3, if no feedback items, route to localization."""
    base_state["compliance_verdict"] = "REVISE"
    base_state["compliance_iterations"] = 3
    base_state["compliance_feedback"] = []

    result = route_after_compliance(base_state)

    assert result == "localization_agent"


def test_compliance_max_iterations_escalates(base_state):
    """Test that max iterations (5) with errors routes to human_escalation."""
    base_state["compliance_verdict"] = "REVISE"
    base_state["compliance_iterations"] = 5
    base_state["compliance_feedback"] = [{"severity": "error", "message": "persistent error"}]

    result = route_after_compliance(base_state)

    assert result == "human_escalation"


def test_compliance_reject_escalates_immediately(base_state):
    """Test that REJECT verdict immediately routes to human_escalation."""
    base_state["compliance_verdict"] = "REJECT"
    base_state["compliance_iterations"] = 1

    result = route_after_compliance(base_state)

    assert result == "human_escalation"


def test_compliance_reject_at_zero_iterations_escalates(base_state):
    """Test that REJECT escalates even at zero iterations."""
    base_state["compliance_verdict"] = "REJECT"
    base_state["compliance_iterations"] = 0

    result = route_after_compliance(base_state)

    assert result == "human_escalation"


def test_pipeline_compiles_without_error():
    """Test that the pipeline compiles successfully."""
    pipeline = build_pipeline()

    assert pipeline is not None
