"""
Integration smoke test for the full stub pipeline.
"""

import pytest

from api.graph.pipeline import build_pipeline


@pytest.mark.integration
def test_stub_pipeline_runs_end_to_end():
    """
    Test that the stub pipeline runs from intake to format without errors.

    This test verifies:
    - Pipeline compiles and executes successfully
    - All agents run in correct sequence
    - Routing logic works correctly
    - State updates propagate through the pipeline
    - Human approval interrupt is hit before format_agent
    """
    # Build pipeline
    pipeline = build_pipeline()

    # Create minimal initial state
    initial_state = {
        "run_id": "smoke-test-001",
        "brief": {"topic": "test", "audience": "general"},
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
        "audit_log": []
    }

    # Configure with thread_id for checkpointing
    config = {"configurable": {"thread_id": "smoke-test-001"}}

    # First invoke: runs until interrupt_before format_agent
    result = pipeline.invoke(initial_state, config)

    # Verify state after reaching interrupt
    assert result["pipeline_status"] == "localization_complete"
    assert len(result["audit_log"]) >= 4  # intake, draft, compliance, localization
    assert "##INTRO" in result["draft"]
    assert "##BODY" in result["draft"]
    assert "##CONCLUSION" in result["draft"]
    assert result["compliance_verdict"] == "PASS"
    assert result["localized_hi"] != ""

    # Second invoke: continue past interrupt to run format_agent
    final_result = pipeline.invoke(None, config)

    # Verify final state after format_agent completes
    assert final_result["pipeline_status"] == "awaiting_approval"
    assert len(final_result["audit_log"]) >= 5  # all agents including format
    assert final_result["blog_html"] != ""
    assert len(final_result["twitter_thread"]) > 0
    assert final_result["linkedin_post"] != ""
    assert final_result["whatsapp_message"] != ""
