"""Tests verifying Phase 1 critical bug fixes."""

from unittest.mock import MagicMock, patch


class TestFormatAgentRecovery:
    def test_partial_json_recovery_extracts_available_fields(self):
        from api.agents.format_agent import _partial_recover_json

        truncated = '{"blog_html": "Hello world", "linkedin_post": "Great post'  # truncated
        result = _partial_recover_json(truncated)

        assert result["blog_html"] == "Hello world"
        assert result["linkedin_post"] == ""  # incomplete, not extracted

    def test_format_agent_does_not_crash_on_truncated_response(self):
        from api.agents.format_agent import run_format_agent

        state = {
            "run_id": "test-123",
            "draft": "##INTRO\nTest intro\n##BODY\nTest body\n##CONCLUSION\nTest conclusion",
            "output_options": ["blog"],
            "output_format": "multi_platform_pack",
            "strategy": {},
            "audit_log": [],
            "localized_hi": "",
            "trend_sources": [],
            "content_category": "general",
            "org_rules_count": 8,
            "compliance_iterations": 1,
        }

        with patch("api.agents.format_agent.call_llm", return_value="TRUNCATED_JSON_NO_CLOSING_BRACE"):
            with (
                patch("api.agents.format_agent.write_pipeline_outputs"),
                patch("api.agents.format_agent.save_pipeline_metrics"),
                patch("api.agents.format_agent.update_run_status"),
            ):
                result = run_format_agent(state)

        assert "pipeline_status" in result


class TestComplianceRouting:
    def test_pass_on_iteration_3_goes_to_localization_not_escalation(self):
        from api.graph.routing import route_after_compliance

        state = {
            "compliance_verdict": "PASS",
            "compliance_iterations": 3,
        }
        assert route_after_compliance(state) == "localization_agent"

    def test_revise_under_max_iterations_goes_to_draft(self):
        from api.graph.routing import route_after_compliance

        state = {
            "compliance_verdict": "REVISE",
            "compliance_iterations": 2,
        }
        assert route_after_compliance(state) == "draft_agent"

    def test_revise_at_max_iterations_escalates(self):
        from api.graph.routing import route_after_compliance

        state = {
            "compliance_verdict": "REVISE",
            "compliance_iterations": 3,
        }
        assert route_after_compliance(state) == "human_escalation"

    def test_reject_always_escalates(self):
        from api.graph.routing import route_after_compliance

        for iterations in [0, 1, 2, 3]:
            state = {"compliance_verdict": "REJECT", "compliance_iterations": iterations}
            assert route_after_compliance(state) == "human_escalation"


class TestLocalizationLanguageSelection:
    def test_hindi_skipped_when_not_in_top_level_target_languages(self):
        from api.agents.localization_agent import run_localization_agent

        state = {
            "target_languages": ["en"],
            "brief": {"topic": "test"},
            "draft": "##INTRO\nTest\n##BODY\nTest\n##CONCLUSION\nTest",
            "audit_log": [],
        }
        result = run_localization_agent(state)

        assert result["localized_hi"] == ""
        assert result["pipeline_status"] == "localization_skipped"

    def test_hindi_runs_when_hi_in_top_level_target_languages(self):
        from api.agents.localization_agent import run_localization_agent

        state = {
            "target_languages": ["en", "hi"],
            "brief": {"topic": "test"},
            "draft": "##INTRO\nTest intro\n##BODY\nTest body\n##CONCLUSION\nTest conclusion",
            "audit_log": [],
        }
        with patch("api.agents.localization_agent.call_llm", return_value="हिंदी सामग्री"):
            result = run_localization_agent(state)

        assert result["localized_hi"] == "हिंदी सामग्री"


class TestLLMNullContentGuard:
    def test_null_content_returns_empty_string_not_crash(self):
        from api.llm import call_llm

        mock_response = MagicMock()
        mock_response.choices[0].message.content = None

        with patch("api.llm.OpenAI") as mock_openai:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_client
            result = call_llm("llama-3.1-8b-instant", "system", "user", 100)

        assert result == ""
