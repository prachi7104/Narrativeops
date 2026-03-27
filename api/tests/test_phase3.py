from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from api.agents.compliance_agent import run_compliance_agent
from api.agents.draft_agent import run_draft_agent
from api.agents.format_agent import run_format_agent
from api.agents.intake_agent import run_intake_agent
from api.main import app

UTC = getattr(datetime, "UTC", timezone.utc)  # noqa: UP017


class _DiffQuery:
    def __init__(self, client: _DiffClient, table_name: str):
        self.client = client
        self.table_name = table_name
        self._select_columns = ""
        self._count_mode = None
        self._update_payload: dict = {}
        self._filters: dict[str, object] = {}

    def select(self, columns: str, count: str | None = None):
        self._select_columns = columns
        self._count_mode = count
        return self

    def update(self, payload: dict):
        self._update_payload = dict(payload)
        return self

    def eq(self, field: str, value):
        self._filters[field] = value
        return self

    def limit(self, _n: int):
        return self

    def execute(self):
        if self.table_name == "pipeline_runs" and self._select_columns == "status":
            return SimpleNamespace(data=[{"status": self.client.current_status}])

        if self.table_name == "pipeline_runs" and self._update_payload:
            if self._update_payload.get("status"):
                self.client.current_status = str(self._update_payload["status"])
            return SimpleNamespace(data=[])

        if self.table_name == "editorial_corrections":
            rows = [{"id": i + 1} for i in range(self.client.corrections_count)]
            if self._count_mode == "exact":
                return SimpleNamespace(data=rows, count=self.client.corrections_count)
            return SimpleNamespace(data=rows)

        return SimpleNamespace(data=[])


class _DiffClient:
    def __init__(self, current_status: str = "running", corrections_count: int = 2):
        self.current_status = current_status
        self.corrections_count = corrections_count

    def table(self, table_name: str):
        return _DiffQuery(self, table_name)


class _DashboardQuery:
    def __init__(self, rows: list[dict]):
        self.rows = list(rows)
        self.count: int | None = None

    def select(self, _columns: str, count: str | None = None):
        if count == "exact":
            self.count = len(self.rows)
        return self

    def order(self, _field: str, desc: bool = False):
        self.rows = sorted(self.rows, key=lambda row: row.get("created_at"), reverse=desc)
        return self

    def limit(self, n: int):
        self.rows = self.rows[:n]
        return self

    def execute(self):
        return SimpleNamespace(data=list(self.rows))


class _DashboardClient:
    def __init__(self, runs: list[dict], metrics_rows: list[dict]):
        self.runs = runs
        self.metrics_rows = metrics_rows

    def table(self, table_name: str):
        if table_name == "pipeline_runs":
            return _DashboardQuery(self.runs)
        if table_name == "pipeline_metrics":
            return _DashboardQuery(self.metrics_rows)
        return _DashboardQuery([])


def _minimal_draft_state(content_category: str = "general") -> dict:
    return {
        "run_id": "draft-run-001",
        "brief": {"topic": "SIP investing"},
        "strategy": {
            "format": "article",
            "tone": "authoritative",
            "word_count": 400,
            "key_messages": ["risk awareness", "discipline"],
        },
        "content_category": content_category,
        "compliance_feedback": [],
        "draft": "",
        "past_feedback": [],
        "draft_version": 0,
        "audit_log": [],
    }


def _minimal_format_state() -> dict:
    return {
        "run_id": "format-run-001",
        "draft": "##INTRO\nHello\n##BODY\nWorld\n##CONCLUSION\nDone",
        "localized_hi": "##INTRO\nहिंदी परिचय\n##BODY\nमुख्य अंश\n##CONCLUSION\nसमापन",
        "output_options": ["blog", "faq", "publisher_brief", "twitter", "linkedin", "whatsapp"],
        "strategy": {
            "best_channel": "twitter",
            "strategy_recommendation": "Prefer short threaded distribution based on recent engagement.",
        },
        "compliance_iterations": 2,
        "corrections_applied_this_run": 2,
        "org_rules_count": 12,
        "rules_source": "org_rules",
        "trend_sources": ["https://example.com/1", "https://example.com/2"],
        "content_category": "mutual_fund",
        "audit_log": [
            {"agent": "intake_agent", "duration_ms": 1200},
            {"agent": "draft_agent", "duration_ms": 2400},
        ],
    }


# TEST GROUP 1: Diff capture endpoint

@pytest.mark.asyncio
async def test_diff_endpoint_saves_correction(mocker):
    save_corr = mocker.patch("api.main.database.save_editorial_correction", return_value=None)
    mocker.patch("api.main.database.get_pipeline_metrics", return_value=None)
    mocker.patch("api.main.database.save_pipeline_metrics", return_value=None)
    mocker.patch("api.main.database.get_supabase_client", return_value=_DiffClient())

    payload = {
        "channel": "blog",
        "original_text": "AI wrote this.",
        "corrected_text": "Editor improved this sentence.",
        "content_category": "mutual_fund",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/pipeline/test-run-id/diff", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "captured"
    assert isinstance(body["diff_summary"], str)
    assert body["diff_summary"]

    save_corr.assert_called_once_with(
        run_id="test-run-id",
        channel="blog",
        original_text="AI wrote this.",
        corrected_text="Editor improved this sentence.",
        content_category="mutual_fund",
        diff_summary=body["diff_summary"],
    )


@pytest.mark.asyncio
async def test_diff_summary_detects_no_changes(mocker):
    mocker.patch("api.main.database.save_editorial_correction", return_value=None)
    mocker.patch("api.main.database.get_supabase_client", return_value=_DiffClient())

    payload = {
        "channel": "blog",
        "original_text": "No changes",
        "corrected_text": "No changes",
        "content_category": "general",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/pipeline/test-run-id/diff", json=payload)

    assert response.status_code == 200
    assert response.json()["diff_summary"] == "No changes detected"


@pytest.mark.asyncio
async def test_diff_summary_counts_added_removed_lines(mocker):
    mocker.patch("api.main.database.save_editorial_correction", return_value=None)
    mocker.patch("api.main.database.get_supabase_client", return_value=_DiffClient())

    payload = {
        "channel": "blog",
        "original_text": "Line one\nLine two\nLine three",
        "corrected_text": "Line one\nLine two improved\nLine four",
        "content_category": "general",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/pipeline/test-run-id/diff", json=payload)

    assert response.status_code == 200
    assert "lines" in response.json()["diff_summary"]


# TEST GROUP 2: Metrics endpoint

@pytest.mark.asyncio
async def test_metrics_endpoint_returns_formatted_display(mocker):
    mocker.patch(
        "api.main.database.get_pipeline_metrics",
        return_value={
            "total_duration_ms": 87000,
            "agent_count": 7,
            "compliance_iterations": 2,
            "corrections_applied": 1,
            "rules_checked": 12,
                "rules_source": "org_rules",
            "trend_sources_used": 3,
            "estimated_hours_saved": "7.50",
            "estimated_cost_saved_inr": "11250.00",
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/pipeline/test-run-id/metrics")

    assert response.status_code == 200
    body = response.json()
    assert body["time_saved_display"] == "7.5 hours"
    assert "₹" in body["cost_saved_display"]
    assert body["brand_rules_used"] is True
    assert body["rules_source_label"] == "Custom brand guide"


@pytest.mark.asyncio
async def test_metrics_endpoint_returns_error_when_not_found(mocker):
    mocker.patch("api.main.database.get_pipeline_metrics", return_value=None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/pipeline/nonexistent-run/metrics")

    assert response.status_code == 200
    assert "error" in response.json()


@pytest.mark.asyncio
async def test_metrics_endpoint_includes_runtime_and_baseline_fields(mocker):
    mocker.patch(
        "api.main.database.get_pipeline_metrics",
        return_value={
            "total_duration_ms": 90000,
            "actual_duration_ms": 90000,
            "baseline_manual_hours": 6.0,
            "estimated_hours_saved": 5.97,
            "estimated_cost_saved_inr": 8955.0,
            "compliance_iterations": 1,
            "corrections_applied": 0,
            "rules_checked": 8,
                "rules_source": "default",
            "trend_sources_used": 1,
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/pipeline/runtime-fields-run/metrics")

    assert response.status_code == 200
    body = response.json()
    assert body["actual_duration_ms"] == 90000
    assert body["actual_duration_display"]
    assert body["baseline_manual_hours"] == 6.0


# TEST GROUP 3: Dashboard summary

@pytest.mark.asyncio
async def test_dashboard_summary_returns_aggregate_stats(mocker):
    runs = [
        {
            "id": "run-1",
            "brief_topic": "Topic 1",
            "status": "completed",
            "created_at": datetime.now(UTC),
        },
        {
            "id": "run-2",
            "brief_topic": "Topic 2",
            "status": "awaiting_approval",
            "created_at": datetime.now(UTC),
        },
    ]
    metrics_rows = [
        {
            "estimated_hours_saved": 7.5,
            "estimated_cost_saved_inr": 11250,
            "corrections_applied_this_run": 2,
            "rules_source": "org_rules",
            "corrections_applied": 2,
        },
        {
            "estimated_hours_saved": 3.0,
            "estimated_cost_saved_inr": 4500,
            "corrections_applied": 1,
        },
    ]
    mocker.patch(
        "api.main.database.get_supabase_client",
        return_value=_DashboardClient(runs=runs, metrics_rows=metrics_rows),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert "total_runs" in body
    assert "total_time_saved_hours" in body
    assert "total_cost_saved_inr" in body
    assert "total_corrections_captured" in body
    assert "avg_cycle_reduction_pct" in body
    assert "most_recent_runs" in body
    assert isinstance(body["most_recent_runs"], list)
    assert body["total_runs"] == len(runs)


@pytest.mark.asyncio
async def test_dashboard_handles_zero_runs(mocker):
    mocker.patch(
        "api.main.database.get_supabase_client",
        return_value=_DashboardClient(runs=[], metrics_rows=[]),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["total_runs"] == 0
    assert body["most_recent_runs"] == []


# TEST GROUP 4: Correction memory in draft agent

def test_draft_agent_injects_correction_context_when_available(mocker):
    captured = {"user": ""}

    def _mock_call_llm(**kwargs):
        captured["user"] = kwargs.get("user", "")
        return "##INTRO\nIntro\n##BODY\nBody\n##CONCLUSION\nConclusion"

    mocker.patch(
        "api.agents.draft_agent.get_recent_corrections",
        return_value=[
            {
                "diff_summary": "Changed passive to active voice",
                "original_text": "X",
                "corrected_text": "Y",
            }
        ],
    )
    mocker.patch("api.agents.draft_agent.call_llm", side_effect=_mock_call_llm)

    run_draft_agent(_minimal_draft_state(content_category="mutual_fund"))

    assert "EDITORIAL CORRECTIONS FROM PREVIOUS SIMILAR CONTENT" in captured["user"]
    assert "Changed passive to active voice" in captured["user"]


def test_draft_agent_works_without_corrections(mocker):
    captured = {"user": ""}

    def _mock_call_llm(**kwargs):
        captured["user"] = kwargs.get("user", "")
        return "##INTRO\nIntro\n##BODY\nBody\n##CONCLUSION\nConclusion"

    mocker.patch("api.agents.draft_agent.get_recent_corrections", return_value=[])
    mocker.patch("api.agents.draft_agent.call_llm", side_effect=_mock_call_llm)

    result = run_draft_agent(_minimal_draft_state(content_category="general"))

    assert "EDITORIAL CORRECTIONS FROM PREVIOUS SIMILAR CONTENT" not in captured["user"]
    assert result["corrections_applied_this_run"] == 0


def test_draft_agent_continues_when_db_fails(mocker):
    mocker.patch("api.agents.draft_agent.get_recent_corrections", side_effect=Exception("DB error"))
    mocker.patch(
        "api.agents.draft_agent.call_llm",
        return_value="##INTRO\nIntro\n##BODY\nBody\n##CONCLUSION\nConclusion",
    )

    result = run_draft_agent(_minimal_draft_state(content_category="fintech"))

    assert result["draft"]


# TEST GROUP 5: Format agent metrics

def test_format_agent_saves_metrics(mocker):
    mocker.patch(
        "api.agents.format_agent.call_llm",
        return_value=json.dumps(
            {
                "blog_html": "<article>Blog</article>",
                "faq_html": "<section><h2>FAQ</h2></section>",
                "publisher_brief": "Headline options: A, B, C",
                "twitter_thread": ["1/2 tweet", "2/2 tweet"],
                "linkedin_post": "LinkedIn post",
                "whatsapp_message": "WhatsApp message",
            }
        ),
    )
    mocker.patch("api.agents.format_agent.write_pipeline_outputs", return_value=None)
    mocker.patch("api.agents.format_agent.update_run_status", return_value=None)
    save_metrics = mocker.patch("api.agents.format_agent.save_pipeline_metrics", return_value=None)

    run_format_agent(_minimal_format_state())

    save_metrics.assert_called_once()
    _, metrics_payload = save_metrics.call_args.args
    assert "estimated_hours_saved" in metrics_payload
    assert 0 <= float(metrics_payload["estimated_hours_saved"]) <= 8.0
    assert "estimated_cost_saved_inr" in metrics_payload
    assert 0 <= float(metrics_payload["estimated_cost_saved_inr"]) <= 12000.0
    assert metrics_payload["corrections_applied"] == 2
    assert metrics_payload["rules_source"] == "org_rules"


def test_format_agent_continues_if_metrics_fails(mocker):
    mocker.patch(
        "api.agents.format_agent.call_llm",
        return_value=json.dumps(
            {
                "blog_html": "<article>Blog</article>",
                "faq_html": "<section><h2>FAQ</h2></section>",
                "publisher_brief": "Publisher note",
                "twitter_thread": ["1/1 tweet"],
                "linkedin_post": "LinkedIn post",
                "whatsapp_message": "WhatsApp message",
            }
        ),
    )
    mocker.patch("api.agents.format_agent.write_pipeline_outputs", return_value=None)
    mocker.patch("api.agents.format_agent.update_run_status", return_value=None)
    mocker.patch(
        "api.agents.format_agent.save_pipeline_metrics",
        side_effect=Exception("metrics fail"),
    )

    result = run_format_agent(_minimal_format_state())

    assert result["pipeline_status"] == "awaiting_approval"


def test_format_agent_generates_faq_and_publisher_outputs(mocker):
    mocker.patch(
        "api.agents.format_agent.call_llm",
        return_value=json.dumps(
            {
                "blog_html": "<article>Blog</article>",
                "faq_html": "<section><h2>FAQ</h2><p>Q1/A1</p></section>",
                "publisher_brief": "Topline: Market context\nSEO: sip, investing",
                "twitter_thread": ["1/1 tweet"],
                "linkedin_post": "LinkedIn post",
                "whatsapp_message": "WhatsApp message",
            }
        ),
    )
    write_outputs = mocker.patch("api.agents.format_agent.write_pipeline_outputs", return_value=None)
    mocker.patch("api.agents.format_agent.update_run_status", return_value=None)
    mocker.patch("api.agents.format_agent.save_pipeline_metrics", return_value=None)

    result = run_format_agent(_minimal_format_state())

    assert "faq_html" in result
    assert "publisher_brief" in result
    assert result["faq_html"]
    assert result["publisher_brief"]

    _, write_kwargs = write_outputs.call_args
    assert "faq_html" in write_kwargs["outputs"]
    assert "publisher_brief" in write_kwargs["outputs"]


def test_compliance_agent_parse_failure_fails_closed(mocker, minimal_content_state):
    mocker.patch(
        "api.agents.compliance_agent.call_llm",
        return_value="not-json-response",
    )

    result = run_compliance_agent(minimal_content_state("##INTRO\nTest draft"))

    assert result["compliance_verdict"] == "REVISE"
    assert isinstance(result["compliance_feedback"], list)
    assert len(result["compliance_feedback"]) >= 1
    assert result["compliance_feedback"][0].get("rule_id") == "SYSTEM_PARSE"


def test_format_agent_prioritizes_best_channel_in_selected_output_options(mocker):
    mocker.patch(
        "api.agents.format_agent.call_llm",
        return_value=json.dumps(
            {
                "blog_html": "<article>Blog</article>",
                "faq_html": "<section><h2>FAQ</h2></section>",
                "publisher_brief": "Publisher note",
                "twitter_thread": ["1/1 tweet"],
                "linkedin_post": "LinkedIn post",
                "whatsapp_message": "WhatsApp message",
            }
        ),
    )
    mocker.patch("api.agents.format_agent.write_pipeline_outputs", return_value=None)
    mocker.patch("api.agents.format_agent.update_run_status", return_value=None)
    mocker.patch("api.agents.format_agent.save_pipeline_metrics", return_value=None)

    result = run_format_agent(_minimal_format_state())

    summary = json.loads(result["audit_log"][-1]["output_summary"])
    assert summary["selected_output_options"][0] == "twitter"


def test_format_agent_builds_hindi_whatsapp_variant(mocker):
    mocker.patch(
        "api.agents.format_agent.call_llm",
        return_value=json.dumps(
            {
                "blog_html": "<article>Blog</article>",
                "faq_html": "<section><h2>FAQ</h2></section>",
                "publisher_brief": "Publisher note",
                "twitter_thread": ["1/1 tweet"],
                "linkedin_post": "LinkedIn post",
                "whatsapp_message": "WhatsApp message",
            }
        ),
    )
    write_outputs = mocker.patch("api.agents.format_agent.write_pipeline_outputs", return_value=None)
    mocker.patch("api.agents.format_agent.update_run_status", return_value=None)
    mocker.patch("api.agents.format_agent.save_pipeline_metrics", return_value=None)

    run_format_agent(_minimal_format_state())

    _, write_kwargs = write_outputs.call_args
    assert "whatsapp_hi_message" in write_kwargs["outputs"]
    assert write_kwargs["outputs"]["whatsapp_hi_message"]


def test_intake_agent_derives_best_channel_from_engagement_data(mocker):
    mocker.patch(
        "api.agents.intake_agent.call_llm",
        return_value=json.dumps(
            {
                "format": "multi_platform_pack",
                "tone": "authoritative",
                "word_count": 600,
                "key_messages": ["one"],
                "channels": ["blog", "twitter", "linkedin", "whatsapp"],
                "languages": ["en", "hi"],
                "compliance_flags": [],
                "best_channel": "",
                "strategy_recommendation": "Shift mix to channels with higher engagement.",
                "content_calendar": [{"week": 1, "items": []}],
            }
        ),
    )

    state = {
        "brief": {"topic": "Performance pivot brief"},
        "engagement_data": {
            "twitter": {"avg_views": 5000, "engagement_rate": 0.09},
            "blog": {"avg_views": 900, "engagement_rate": 0.02},
        },
        "output_format": "multi_platform_pack",
        "audit_log": [],
    }

    result = run_intake_agent(state)

    assert result["strategy"]["best_channel"] == "twitter"
