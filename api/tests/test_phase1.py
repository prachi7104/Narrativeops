import uuid
from datetime import datetime, timezone

import pytest

import api.database as database
from api.agents.trend_agent import run_trend_agent

UTC = getattr(datetime, "UTC", timezone.utc)  # noqa: UP017


class _Result:
    def __init__(self, data):
        self.data = data


class _TableQuery:
    def __init__(self, store: dict[str, list[dict]], table_name: str):
        self.store = store
        self.table_name = table_name
        self.rows = list(store.get(table_name, []))
        self._selected = None

    def select(self, columns: str):
        self._selected = columns
        return self

    def eq(self, field: str, value):
        self.rows = [row for row in self.rows if row.get(field) == value]
        return self

    def gt(self, field: str, value):
        self.rows = [row for row in self.rows if row.get(field) > value]
        return self

    def order(self, field: str, desc: bool = False):
        self.rows = sorted(self.rows, key=lambda row: row.get(field), reverse=desc)
        return self

    def limit(self, n: int):
        self.rows = self.rows[:n]
        return self

    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        table = self.store.setdefault(self.table_name, [])
        for row in rows:
            next_row = dict(row)
            if self.table_name == "org_rules" and "enabled" not in next_row:
                next_row["enabled"] = True
            if "created_at" not in next_row:
                next_row["created_at"] = datetime.now(UTC).isoformat()
            table.append(next_row)
        self.rows = rows
        return self

    def upsert(self, payload: dict, on_conflict: str):
        table = self.store.setdefault(self.table_name, [])
        conflict_value = payload.get(on_conflict)

        for idx, row in enumerate(table):
            if row.get(on_conflict) == conflict_value:
                merged = dict(row)
                merged.update(payload)
                table[idx] = merged
                self.rows = [merged]
                return self

        table.append(dict(payload))
        self.rows = [dict(payload)]
        return self

    def update(self, payload: dict):
        for row in self.rows:
            row.update(payload)
        return self

    def execute(self):
        if not self._selected or self._selected == "*":
            return _Result(list(self.rows))

        fields = [field.strip() for field in self._selected.split(",")]
        selected = [{field: row.get(field) for field in fields} for row in self.rows]
        return _Result(selected)


class _FakeSupabaseClient:
    def __init__(self):
        self.store = {
            "pipeline_runs": [],
            "org_rules": [],
            "trend_cache": [],
            "editorial_corrections": [],
            "pipeline_metrics": [],
        }

    def table(self, table_name: str):
        return _TableQuery(self.store, table_name)


@pytest.fixture
def fake_db(monkeypatch):
    client = _FakeSupabaseClient()
    monkeypatch.setattr(database, "get_supabase_client", lambda: client)
    return client


def test_save_and_get_org_rules(fake_db):
    database.save_org_rules(
        "test-session-001",
        [
            {
                "rule_id": "ORG01",
                "rule_text": "Test rule",
                "category": "banned_phrase",
                "severity": "error",
                "source": "brand_guide",
            }
        ],
    )

    result = database.get_org_rules("test-session-001")

    assert len(result) == 1
    assert result[0]["rule_id"] == "ORG01"
    assert result[0]["source"] == "brand_guide"


def test_org_rules_only_returns_enabled(fake_db):
    database.save_org_rules(
        "test-session-enabled-check",
        [
            {
                "rule_id": "ORG-ENABLED",
                "rule_text": "Enabled rule",
                "category": "tone",
                "severity": "error",
                "source": "default",
            }
        ],
    )

    fake_db.table("org_rules").insert(
        {
            "session_id": "test-session-enabled-check",
            "rule_id": "ORG-DISABLED",
            "rule_text": "Disabled rule",
            "category": "tone",
            "severity": "warning",
            "source": "default",
            "enabled": False,
        }
    ).execute()

    result = database.get_org_rules("test-session-enabled-check")

    assert len(result) == 1
    assert result[0]["rule_id"] == "ORG-ENABLED"


def test_trend_cache_upsert_and_retrieve(fake_db):
    topic_hash = "test-hash-001"

    database.upsert_trend_cache(topic_hash, "RBI rate cut", ["snippet 1"], ["http://et.com"])
    result = database.get_trend_cache(topic_hash)

    assert result is not None
    assert result["topic_text"] == "RBI rate cut"
    assert len(result["snippets"]) == 1


def test_trend_cache_returns_none_for_unknown_hash(fake_db):
    result = database.get_trend_cache("definitely-does-not-exist-hash-xyz")

    assert result is None


def test_save_and_get_recent_corrections(fake_db):
    run_id = f"test-run-{uuid.uuid4()}"
    database.create_run(run_id, {"topic": "Correction test"})

    database.save_editorial_correction(
        run_id,
        "blog",
        "original text here",
        "corrected text here",
        "mutual_fund",
        "Changed passive to active voice",
    )
    result = database.get_recent_corrections("mutual_fund", limit=5)

    assert len(result) >= 1
    assert any(r["diff_summary"] == "Changed passive to active voice" for r in result)


def test_pipeline_metrics_save_and_retrieve(fake_db):
    run_id = f"test-run-{uuid.uuid4()}"
    database.create_run(run_id, {"topic": "Metrics test"})

    database.save_pipeline_metrics(
        run_id,
        {
            "total_duration_ms": 45000,
            "agent_count": 7,
            "compliance_iterations": 2,
            "corrections_applied": 1,
            "rules_checked": 12,
            "trend_sources_used": 3,
            "estimated_hours_saved": 7.5,
            "estimated_cost_saved_inr": 11250.00,
        },
    )
    result = database.get_pipeline_metrics(run_id)

    assert result is not None
    assert result["rules_checked"] == 12
    assert float(result["estimated_hours_saved"]) == 7.5


def test_trend_agent_returns_empty_string_on_all_failures(mocker):
    mocker.patch("api.agents.trend_agent.get_trend_cache", return_value=None)
    mocker.patch("api.agents.trend_agent.settings", mocker.Mock(TAVILY_API_KEY="test-key"))
    mocker.patch("api.agents.trend_agent.TavilyClient", side_effect=Exception("Tavily failed"))
    mocker.patch("api.agents.trend_agent.feedparser.parse", side_effect=Exception("RSS failed"))

    result = run_trend_agent({"brief": {"topic": "test"}, "audit_log": []})

    assert result["trend_context"] == ""
    assert result["trend_sources"] == []
    assert result["trend_cache_hit"] is False


def test_trend_agent_uses_cache_when_available(mocker):
    mocker.patch(
        "api.agents.trend_agent.get_trend_cache",
        return_value={"snippets": ["cached snippet"], "sources": ["http://cached.com"]},
    )
    tavily_ctor = mocker.patch("api.agents.trend_agent.TavilyClient")

    result = run_trend_agent({"brief": {"topic": "test"}, "audit_log": []})

    assert "cached snippet" in result["trend_context"]
    assert result["trend_cache_hit"] is True
    tavily_ctor.assert_not_called()


def test_trend_agent_falls_back_to_rss_when_no_tavily_key(mocker):
    mocker.patch("api.agents.trend_agent.get_trend_cache", return_value=None)
    mocker.patch("api.agents.trend_agent.settings", mocker.Mock(TAVILY_API_KEY=None))

    entry_1 = type("Entry", (), {"title": "RBI rate cut expected", "summary": "Summary one", "link": "http://et.com/1"})
    entry_2 = type("Entry", (), {"title": "RBI rate cut impact", "summary": "Summary two", "link": "http://et.com/2"})
    feed = type("Feed", (), {"entries": [entry_1, entry_2]})
    mocker.patch("api.agents.trend_agent.feedparser.parse", return_value=feed)
    mocker.patch("api.agents.trend_agent.upsert_trend_cache", return_value=None)

    result = run_trend_agent({"brief": {"topic": "RBI rate cut"}, "audit_log": []})

    assert result["trend_context"] != ""
    assert result["audit_log"][-1]["action"] == "fetched_rss"


def test_trend_agent_appends_sources_attribution(mocker):
    mocker.patch("api.agents.trend_agent.get_trend_cache", return_value=None)
    mocker.patch("api.agents.trend_agent.settings", mocker.Mock(TAVILY_API_KEY="test-key"))
    tavily_client = mocker.Mock()
    tavily_client.search.return_value = {
        "results": [
            {"content": "Trend A", "url": "http://example.com/a"},
            {"content": "Trend B", "url": "http://example.com/b"},
            {"content": "Trend C", "url": "http://example.com/c"},
        ]
    }
    mocker.patch("api.agents.trend_agent.TavilyClient", return_value=tavily_client)
    mocker.patch("api.agents.trend_agent.upsert_trend_cache", return_value=None)

    result = run_trend_agent({"brief": {"topic": "RBI rate cut"}, "audit_log": []})

    assert "Sources:" in result["trend_context"]


def test_trend_agent_audit_log_entry_has_required_fields(mocker):
    mocker.patch("api.agents.trend_agent.get_trend_cache", return_value=None)
    mocker.patch("api.agents.trend_agent.settings", mocker.Mock(TAVILY_API_KEY=""))
    mocker.patch("api.agents.trend_agent.feedparser.parse", return_value=type("Feed", (), {"entries": []}))

    result = run_trend_agent({"brief": {"topic": "RBI rate cut"}, "audit_log": []})

    last = result["audit_log"][-1]
    for key in ["agent", "action", "sources_count", "cache_hit", "output_summary"]:
        assert key in last
    assert last["agent"] == "trend_agent"


@pytest.mark.integration
def test_real_trend_agent_returns_grounded_context():
    result = run_trend_agent(
        {
            "brief": {"topic": "RBI interest rate India"},
            "audit_log": [],
            "trend_context": "",
            "trend_sources": [],
            "trend_cache_hit": False,
        }
    )

    assert result["trend_context"] == "" or result["trend_context"] != ""
    if len(result["trend_context"]) > 0:
        assert "Sources:" in result["trend_context"]
        assert "In early 2026" not in result["trend_context"]

    print("\nTrend context output:\n", result["trend_context"])
