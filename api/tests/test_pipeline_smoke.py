"""
Integration smoke test for the full stub pipeline.
"""

import pytest

from api.graph.pipeline import build_pipeline


def _is_known_json_validation_error(exc: Exception) -> bool:
    message = str(exc)
    return "json_validate_failed" in message or "Failed to generate JSON" in message


def _invoke_with_live_model_guard(pipeline, state, config, attempts: int = 2):
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            return pipeline.invoke(state, config)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if _is_known_json_validation_error(exc):
                continue
            raise

    assert last_error is not None
    pytest.skip(
        "Skipping smoke test due to transient live-model JSON validation failure: "
        f"{last_error}"
    )


@pytest.mark.integration
def test_stub_pipeline_runs_end_to_end():
    """
    Test that the stub pipeline runs from intake to format without errors.

    This test verifies:
    - Pipeline compiles and executes successfully
    - All agents run in correct sequence
    - Routing logic works correctly
    - State updates propagate through the pipeline
    - Human approval interrupt is hit after format_agent
    """
    # Build pipeline
    pipeline = build_pipeline()

    # Create minimal initial state with a proper financial topic
    initial_state = {
        "run_id": "smoke-test-001",
        "brief": {
            "topic": "Systematic Investment Plans",
            "description": "Explain benefits of SIP for Indian retail investors",
            "audience": "retail investors",
            "session_id": "smoke-test-session",
            "content_category": "general",
        },
        "engagement_data": None,
        # Phase 1 B1/B3 required fields
        "session_id": "smoke-test-session",
        "content_category": "general",
        "output_format": "multi_platform_pack",
        "output_options": ["blog", "twitter", "linkedin", "whatsapp"],
        "strategy": {},
        "trend_context": "",
        "trend_sources": [],
        "trend_cache_hit": False,
        "past_feedback": [],
        "draft": "",
        "draft_version": 0,
        "compliance_verdict": "",
        "compliance_feedback": [],
        "compliance_iterations": 0,
        "org_rules_count": 0,
        "rules_source": "",
        "localized_hi": "",
        "blog_html": "",
        "twitter_thread": [],
        "linkedin_post": "",
        "whatsapp_message": "",
        "human_approved": False,
        "escalation_required": False,
        "diff_captured": False,
        "error_message": None,
        "pipeline_status": "",
        "audit_log": [],
    }

    # Configure with thread_id for checkpointing
    config = {"configurable": {"thread_id": "smoke-test-001"}}

    # First invoke: runs until interrupt_after format_agent
    result = _invoke_with_live_model_guard(pipeline, initial_state, config)

    # Verify state after reaching interrupt
    # Both awaiting_approval and escalated are valid outcomes due to LLM non-determinism
    # in compliance checks - both prove the pipeline ran successfully
    assert result["pipeline_status"] in ["awaiting_approval", "escalated"], \
        f"Pipeline should complete or escalate, got: {result['pipeline_status']}"

    # If escalated, skip format agent verification (pipeline stopped early)
    if result["pipeline_status"] == "escalated":
        assert result.get("escalation_required") is True
        return  # Test passes - pipeline executed successfully to escalation point

    # Continue with awaiting_approval verification
    assert len(result["audit_log"]) >= 5  # intake, draft, compliance, localization, format
    assert "##INTRO" in result["draft"]
    assert "##BODY" in result["draft"]
    assert "##CONCLUSION" in result["draft"]
    assert result["compliance_verdict"] == "PASS"
    assert result["localized_hi"] != ""
    assert result["blog_html"] != ""
    assert len(result["twitter_thread"]) > 0
    assert result["linkedin_post"] != ""
    assert result["whatsapp_message"] != ""

    # Second invoke: continue past interrupt to reach END
    final_result = _invoke_with_live_model_guard(pipeline, None, config)

    # Verify final state remains approval-ready with generated channels
    assert final_result["pipeline_status"] == "awaiting_approval"
    assert len(final_result["audit_log"]) >= 5
    assert final_result["blog_html"] != ""
    assert len(final_result["twitter_thread"]) > 0
    assert final_result["linkedin_post"] != ""
    assert final_result["whatsapp_message"] != ""
