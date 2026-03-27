"""Tests verifying Phase 2 agent quality upgrades."""

import json
from unittest.mock import patch


class TestComplianceFlagsFlow:
    def test_compliance_flags_from_intake_reach_state(self):
        from api.agents.intake_agent import run_intake_agent

        state = {
            "brief": {
                "topic": "mutual fund returns",
                "description": "Guaranteed 20% returns on SIP",
            },
            "engagement_data": None,
            "output_format": "multi_platform_pack",
            "audit_log": [],
        }
        mock_strategy = {
            "format": "multi_platform_pack",
            "tone": "authoritative",
            "word_count": 600,
            "key_messages": [],
            "channels": ["blog"],
            "languages": ["en"],
            "compliance_flags": [
                "guaranteed returns claim",
                "unverified return percentage",
            ],
            "best_channel": "blog",
            "strategy_recommendation": None,
            "content_calendar": None,
        }
        with patch("api.agents.intake_agent.call_llm", return_value=json.dumps(mock_strategy)):
            result = run_intake_agent(state)

        assert "compliance_flags" in result
        assert len(result["compliance_flags"]) > 0

    def test_compliance_flags_injected_into_compliance_prompt(self):
        """Verify that compliance_flags from state appear in the compliance agent prompt."""
        from api.agents.compliance_agent import run_compliance_agent

        prompts_seen: list[str] = []

        def capture_prompt(model, system, user, **kwargs):  # noqa: ARG001
            prompts_seen.append(system + user)
            return '{"verdict": "PASS", "annotations": [], "summary": "No issues"}'

        state = {
            "draft": "##INTRO\nTest\n##BODY\nTest\n##CONCLUSION\nTest",
            "compliance_iterations": 0,
            "session_id": "",
            "audit_log": [],
            "compliance_flags": [
                "guaranteed returns claim",
                "unverified return percentage",
            ],
            "compliance_history": [],
        }
        with patch("api.agents.compliance_agent.call_llm", side_effect=capture_prompt):
            with patch("api.agents.compliance_agent.settings") as mock_settings:
                mock_settings.SUPABASE_URL = ""
                mock_settings.SUPABASE_ANON_KEY = ""
                with patch(
                    "api.agents.compliance_agent._emergency_fallback_rules",
                    return_value=[
                        {
                            "rule_id": "R01",
                            "rule_text": "no guaranteed returns",
                            "category": "banned_phrase",
                            "severity": "error",
                            "source": "test",
                        }
                    ],
                ):
                    run_compliance_agent(state)

        assert any("guaranteed returns claim" in p for p in prompts_seen)


class TestReflexionMemory:
    def test_compliance_history_accumulates_across_iterations(self):
        from api.agents.compliance_agent import run_compliance_agent

        state = {
            "draft": "##INTRO\nTest\n##BODY\nTest\n##CONCLUSION\nTest",
            "compliance_iterations": 1,
            "compliance_history": [
                {
                    "iteration": 1,
                    "verdict": "REVISE",
                    "violations_count": 2,
                    "summary": "guaranteed returns found",
                }
            ],
            "session_id": "",
            "audit_log": [],
            "compliance_flags": [],
        }
        with patch(
            "api.agents.compliance_agent.call_llm",
            return_value=(
                '{"verdict": "REVISE", "annotations": '
                '[{"section": "BODY", "sentence": "test", "rule_id": "R01", '
                '"severity": "error", "message": "issue", "suggested_fix": "fix"}], '
                '"summary": "still issues"}'
            ),
        ):
            with patch("api.agents.compliance_agent.settings") as mock_settings:
                mock_settings.SUPABASE_URL = ""
                mock_settings.SUPABASE_ANON_KEY = ""
                with patch("api.agents.compliance_agent._emergency_fallback_rules", return_value=[]):
                    result = run_compliance_agent(state)

        assert len(result["compliance_history"]) == 2
        assert result["compliance_history"][1]["iteration"] == 2


class TestContentCategoryDetection:
    def test_mutual_fund_category_detected(self):
        from api.agents.intake_agent import _detect_content_category

        brief = {"topic": "SIP investments", "description": "How mutual fund NAV affects returns"}
        assert _detect_content_category(brief) == "mutual_fund"

    def test_fintech_category_detected(self):
        from api.agents.intake_agent import _detect_content_category

        brief = {"topic": "UPI payments", "description": "Digital fintech revolution in India"}
        assert _detect_content_category(brief) == "fintech"

    def test_general_fallback(self):
        from api.agents.intake_agent import _detect_content_category

        brief = {"topic": "technology trends", "description": "AI and ML in modern applications"}
        assert _detect_content_category(brief) == "general"
