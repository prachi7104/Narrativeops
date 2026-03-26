"""Tests verifying Phase 3 scenario coverage."""

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app


class TestScenario3EngagementStrategy:
    def test_intake_agent_sets_pivot_when_channel_gap_is_large(self):
        from api.agents.intake_agent import run_intake_agent

        state = {
            "brief": {
                "topic": "Mutual fund guide",
                "description": "SIP and NAV explainer for new investors",
            },
            "engagement_data": {
                "linkedin": {"engagement_rate": 0.06, "avg_views": 12000},
                "twitter": {"engagement_rate": 0.02, "avg_views": 9000},
            },
            "output_format": "multi_platform_pack",
            "audit_log": [],
        }

        mock_strategy = {
            "format": "multi_platform_pack",
            "tone": "authoritative",
            "word_count": 600,
            "key_messages": ["Long-term investing discipline"],
            "channels": ["blog", "twitter", "linkedin", "whatsapp"],
            "languages": ["en", "hi"],
            "compliance_flags": [],
            "best_channel": "linkedin",
            "strategy_recommendation": "Prioritize high-performing channels and rebalance weak ones.",
            "content_calendar": [
                {"week": 1, "items": [{"format": "blog", "topic": "SIP basics", "channel": "blog"}]}
            ],
        }

        with patch("api.agents.intake_agent.call_llm", return_value=json.dumps(mock_strategy)):
            result = run_intake_agent(state)

        strategy = result["engagement_strategy"]
        assert strategy["pivot_recommended"] is True
        assert strategy["top_channel"] == "linkedin"
        assert strategy["underperforming_channel"] == "twitter"
        assert strategy["performance_ratio"] >= 2.0
        assert "outperforms" in (strategy.get("pivot_reason") or "")


class TestScenario3StrategyEndpoint:
    @pytest.mark.asyncio
    async def test_strategy_endpoint_returns_checkpoint_values(self):
        checkpoint = SimpleNamespace(
            values={
                "engagement_strategy": {
                    "pivot_recommended": True,
                    "pivot_reason": "linkedin outperforms twitter by 3.0x",
                    "content_calendar": [{"week": 1, "items": []}],
                },
                "strategy": {"strategy_recommendation": "Shift budget toward linkedin."},
            }
        )
        pipeline = SimpleNamespace(get_state=lambda _config: checkpoint)

        with patch("api.graph.pipeline.get_pipeline", return_value=pipeline):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/pipeline/run-phase3-1/strategy")

        assert response.status_code == 200
        body = response.json()
        assert body["run_id"] == "run-phase3-1"
        assert body["pivot_recommended"] is True
        assert body["strategy_recommendation"] == "Shift budget toward linkedin."
        assert isinstance(body["content_calendar"], list)

    @pytest.mark.asyncio
    async def test_strategy_endpoint_falls_back_safely_on_error(self):
        with patch("api.graph.pipeline.get_pipeline", side_effect=RuntimeError("checkpoint missing")):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/pipeline/run-phase3-2/strategy")

        assert response.status_code == 200
        body = response.json()
        assert body["run_id"] == "run-phase3-2"
        assert body["engagement_strategy"] == {}
        assert body["pivot_recommended"] is False
        assert body["content_calendar"] is None


class TestScenarioRejectFeedbackLoop:
    @pytest.mark.asyncio
    async def test_reject_approve_endpoint_persists_rejection_reason(self, mocker):
        mocker.patch("api.main.database.update_run_status", return_value=None)

        update_query = mocker.Mock()
        update_query.update.return_value = update_query
        update_query.eq.return_value = update_query
        update_query.execute.return_value = SimpleNamespace(data=[])

        mock_client = mocker.Mock()
        mock_client.table.return_value = update_query
        mocker.patch("api.main.database.get_supabase_client", return_value=mock_client)

        payload = {"approved": False, "rejection_reason": "Need less promotional tone and stronger sourcing."}

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/pipeline/run-phase3-3/approve", json=payload)

        assert response.status_code == 200
        assert response.json() == {"status": "rejected"}
        mock_client.table.assert_called_once_with("pipeline_runs")
        update_query.update.assert_called_once_with(
            {"rejection_reason": "Need less promotional tone and stronger sourcing."}
        )
        update_query.eq.assert_called_once_with("id", "run-phase3-3")
