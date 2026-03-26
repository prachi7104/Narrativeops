"""
Pre-demo smoke tests. Run these 30 minutes before any demo or judging session.
All must pass. If any fail, do not demo.
"""

from __future__ import annotations

import os

import pytest
import requests

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


@pytest.mark.smoke
class TestAPIReachable:
    def test_health_check_passes(self):
        """API must be reachable and return ok status."""
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_dashboard_summary_loads(self):
        """Dashboard summary endpoint must respond."""
        response = requests.get(f"{BASE_URL}/api/dashboard/summary", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert "total_runs" in data

    def test_default_rules_seeded(self):
        """Default SEBI/ASCI rules must be present."""
        response = requests.get(f"{BASE_URL}/api/settings/rules", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 12, f"Expected >=12 default rules, got {data['count']}"


@pytest.mark.smoke
class TestScenarioPack:
    """
    Minimal pre-demo validation for each scenario pack.
    These hit real LLM calls; run once and verify run IDs are generated.
    """

    def test_scenario1_brief_starts_pipeline(self):
        """Scenario 1: Product launch brief should start a pipeline."""
        response = requests.post(
            f"{BASE_URL}/api/pipeline/run",
            json={
                "brief": {
                    "topic": "Lumina Mutual Fund launch",
                    "description": "Launching a new large-cap equity mutual fund targeting retail investors. Fund objective: wealth creation over 5-year horizon. NAV: Rs10. Minimum SIP: Rs500/month.",
                    "content_category": "mutual_fund",
                    "output_options": ["blog", "faq", "twitter", "linkedin", "whatsapp"],
                    "tone": "authoritative",
                    "target_languages": ["en", "hi"],
                },
                "engagement_data": None,
            },
            timeout=10,
        )
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data
        assert data["status"] == "started"
        print(f"Scenario 1 run_id: {data['run_id']}")

    def test_scenario2_compliance_violation_brief(self):
        """Scenario 2: Brief with SEBI violation should trigger compliance loop."""
        response = requests.post(
            f"{BASE_URL}/api/pipeline/run",
            json={
                "brief": {
                    "topic": "FinSafe guaranteed investment product",
                    "description": "FinSafe offers a guaranteed 18% annual return on investments. Zero risk to principal. Your money is completely safe with us. Assured returns paid quarterly.",
                    "content_category": "fintech",
                    "output_options": ["blog"],
                    "tone": "authoritative",
                    "target_languages": ["en"],
                },
                "engagement_data": None,
            },
            timeout=10,
        )
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data
        print(f"Scenario 2 run_id: {data['run_id']} - monitor for REVISE compliance verdict")

    def test_scenario3_engagement_data_pivot(self):
        """Scenario 3: Engagement data showing video>text should trigger pivot."""
        response = requests.post(
            f"{BASE_URL}/api/pipeline/run",
            json={
                "brief": {
                    "topic": "How to start SIP investing",
                    "description": "Educational content about systematic investment plans for first-time investors aged 25-35.",
                    "content_category": "mutual_fund",
                    "output_options": ["blog", "linkedin", "twitter"],
                    "tone": "accessible",
                    "target_languages": ["en", "hi"],
                },
                "engagement_data": {
                    "video": {"avg_views": 4200, "engagement_rate": 0.082},
                    "text_article": {"avg_views": 980, "engagement_rate": 0.019},
                },
            },
            timeout=10,
        )
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data
        print(f"Scenario 3 run_id: {data['run_id']} - check /strategy endpoint for pivot")


@pytest.mark.smoke
class TestCriticalFixes:
    """Verify all Phase 1 critical fixes are active."""

    def test_compliance_routing_pass_at_max_iterations(self):
        from api.graph.routing import route_after_compliance

        state = {"compliance_verdict": "PASS", "compliance_iterations": 3}
        assert route_after_compliance(state) == "localization_agent", (
            "CRITICAL: PASS at iteration 3 must NOT escalate"
        )

    def test_llm_null_content_guard(self):
        """LLM wrapper must not crash on None content."""
        from unittest.mock import MagicMock, patch

        from api.llm import call_llm

        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = None

        with patch("api.llm.OpenAI") as mock_openai:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_resp
            mock_openai.return_value = mock_client

            result = call_llm("llama-3.1-8b-instant", "sys", "user", 100)

        assert result == "", "None content must return empty string, not crash"
