"""
Integration tests for the full pipeline flow.
These use mocked LLM calls but real LangGraph state transitions.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

MOCK_STRATEGY = {
    "format": "multi_platform_pack",
    "tone": "authoritative",
    "word_count": 600,
    "key_messages": ["key message 1"],
    "channels": ["blog", "twitter"],
    "languages": ["en", "hi"],
    "compliance_flags": ["return percentage claims"],
    "best_channel": "blog",
    "strategy_recommendation": None,
    "content_calendar": None,
}

MOCK_DRAFT = """##INTRO
Mutual funds have emerged as a popular investment vehicle for Indian retail investors.
The systematic investment plan (SIP) mechanism allows disciplined monthly contributions.

##BODY
SIP investments have historically delivered competitive returns, subject to market conditions.
Investors should consider their risk tolerance and investment horizon before committing.
SEBI regulations ensure fund houses maintain transparency in their operations.

##CONCLUSION
For investors considering mutual funds, SIP offers a disciplined approach.
Investments are subject to market risk. Please read all scheme-related documents carefully before investing."""

MOCK_COMPLIANCE_PASS = json.dumps(
    {
        "verdict": "PASS",
        "annotations": [],
        "summary": "No compliance violations found.",
    }
)

MOCK_FORMAT_OUTPUTS = json.dumps(
    {
        "blog_html": "<article><h1>Mutual Fund Guide</h1><p>Content here</p></article>",
        "faq_html": "<section><h2>FAQ</h2><p>Q: What is SIP? A: Systematic Investment Plan</p></section>",
        "twitter_thread": ["1/3 SIP investing explained", "2/3 How to start", "3/3 Key considerations"],
        "linkedin_post": "LinkedIn post about mutual fund investing for professionals",
        "whatsapp_message": "Quick guide to SIP investing. Start small, build wealth.",
    }
)


def _make_llm_mock(responses: list[str]):
    """Create a mock that returns responses in sequence."""
    call_count = [0]

    def mock_call(*_args, **_kwargs):
        idx = min(call_count[0], len(responses) - 1)
        call_count[0] += 1
        return responses[idx]

    return mock_call


class TestPipelineIntegration:
    def _get_db_mocks(self):
        """Return patchers for all DB operations touched during pipeline execution."""
        return [
            patch("api.database.get_supabase_client", return_value=None),
            patch("api.database.get_past_feedback", return_value=[]),
            patch("api.database.get_org_rules", return_value=[]),
            patch("api.database.get_trend_cache", return_value=None),
            patch("api.database.upsert_trend_cache"),
            patch("api.database.write_pipeline_outputs"),
            patch("api.database.write_audit_log"),
            patch("api.database.save_pipeline_metrics"),
            patch("api.database.update_run_status"),
            patch("api.database.get_recent_corrections", return_value=[]),
        ]

    def _initial_state(self, run_id: str) -> dict:
        return {
            "run_id": run_id,
            "brief": {
                "topic": "mutual fund SIP investment",
                "description": "A guide to systematic investment plans",
                "content_category": "mutual_fund",
            },
            "engagement_data": None,
            "session_id": "",
            "content_category": "mutual_fund",
            "output_format": "multi_platform_pack",
            "output_options": ["blog", "twitter", "linkedin", "whatsapp", "faq"],
            "target_languages": ["en", "hi"],
            "strategy": {},
            "engagement_strategy": {},
            "trend_context": "",
            "trend_sources": [],
            "trend_cache_hit": False,
            "past_feedback": [],
            "draft": "",
            "draft_version": 0,
            "compliance_verdict": "",
            "compliance_feedback": [],
            "compliance_history": [],
            "compliance_iterations": 0,
            "org_rules_count": 0,
            "rules_source": "",
            "compliance_flags": [],
            "localized_hi": "",
            "blog_html": "",
            "faq_html": "",
            "publisher_brief": "",
            "twitter_thread": [],
            "linkedin_post": "",
            "whatsapp_message": "",
            "whatsapp_hi_message": "",
            "human_approved": False,
            "escalation_required": False,
            "diff_captured": False,
            "error_message": None,
            "pipeline_status": "running",
            "audit_log": [],
            "corrections_applied_this_run": 0,
        }

    def test_full_pipeline_happy_path(self):
        """Full pipeline runs without error and returns expected fields."""
        from api.graph.pipeline import build_pipeline

        llm_responses = [
            json.dumps(MOCK_STRATEGY),
            MOCK_DRAFT,
            MOCK_COMPLIANCE_PASS,
            "हिंदी सामग्री यहां",
            MOCK_FORMAT_OUTPUTS,
        ]
        llm_mock = _make_llm_mock(llm_responses)

        db_patches = self._get_db_mocks()

        with (
            patch("api.agents.trend_agent.TavilyClient") as mock_tavily,
            patch("api.agents.trend_agent.feedparser") as mock_feedparser,
            patch("api.agents.intake_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.draft_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.compliance_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.localization_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.format_agent.call_llm", side_effect=llm_mock),
        ):
            mock_tavily.return_value.search.return_value = {"results": []}
            mock_feedparser.parse.return_value = MagicMock(entries=[])

            for p in db_patches:
                p.start()

            try:
                pipeline = build_pipeline()
                config = {"configurable": {"thread_id": "test-integration-001"}}

                updates = list(
                    pipeline.stream(
                        self._initial_state("test-integration-001"),
                        config,
                        stream_mode="updates",
                    )
                )

                assert len(updates) > 0, "Pipeline produced no updates"

                checkpoint = pipeline.get_state(config)
                final_values = checkpoint.values

                assert final_values.get("compliance_verdict") == "PASS"
                assert final_values.get("draft") != ""
                assert "##INTRO" in final_values.get("draft", "")
                assert "##CONCLUSION" in final_values.get("draft", "")
                assert final_values.get("pipeline_status") == "awaiting_approval"
            finally:
                for p in db_patches:
                    p.stop()

    def test_compliance_revision_loop(self):
        """Pipeline loops back to draft agent on REVISE verdict, then passes."""
        from api.graph.pipeline import build_pipeline

        compliance_revise = json.dumps(
            {
                "verdict": "REVISE",
                "annotations": [
                    {
                        "section": "INTRO",
                        "sentence": "This fund guarantees 15% annual returns.",
                        "rule_id": "SEBI01",
                        "severity": "error",
                        "message": "Guaranteed returns prohibited",
                        "suggested_fix": "Remove guarantee claim, use historical performance language",
                    }
                ],
                "summary": "One SEBI violation found.",
            }
        )

        violation_draft = MOCK_DRAFT.replace(
            "SIP investments have historically delivered competitive returns, subject to market conditions.",
            "This fund guarantees 15% annual returns.",
        )

        llm_responses = [
            json.dumps(MOCK_STRATEGY),
            violation_draft,
            compliance_revise,
            MOCK_DRAFT,
            MOCK_COMPLIANCE_PASS,
            "हिंदी",
            MOCK_FORMAT_OUTPUTS,
        ]
        llm_mock = _make_llm_mock(llm_responses)

        db_patches = self._get_db_mocks()

        with (
            patch("api.agents.trend_agent.TavilyClient") as mock_tavily,
            patch("api.agents.trend_agent.feedparser") as mock_feedparser,
            patch("api.agents.intake_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.draft_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.compliance_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.localization_agent.call_llm", side_effect=llm_mock),
            patch("api.agents.format_agent.call_llm", side_effect=llm_mock),
        ):
            mock_tavily.return_value.search.return_value = {"results": []}
            mock_feedparser.parse.return_value = MagicMock(entries=[])

            for p in db_patches:
                p.start()

            try:
                pipeline = build_pipeline()
                config = {"configurable": {"thread_id": "test-compliance-loop"}}

                list(
                    pipeline.stream(
                        self._initial_state("test-compliance-loop"),
                        config,
                        stream_mode="updates",
                    )
                )

                checkpoint = pipeline.get_state(config)
                final_values = checkpoint.values

                assert final_values.get("compliance_verdict") == "PASS"
                assert int(final_values.get("compliance_iterations") or 0) == 2
                assert int(final_values.get("draft_version") or 0) == 2
            finally:
                for p in db_patches:
                    p.stop()
