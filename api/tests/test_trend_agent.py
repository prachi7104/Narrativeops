import pytest

from api.agents.trend_agent import run_trend_agent
from api.graph.state import ContentState


def make_state(topic: str, audit_log: list[dict] | None = None) -> ContentState:
    return {
        "brief": {"topic": topic},
        "audit_log": audit_log or [],
    }


def test_returns_empty_string_on_failure(mocker):
    mocker.patch("api.agents.trend_agent.get_trend_cache", return_value=None)
    mocker.patch("api.agents.trend_agent.settings", mocker.Mock(TAVILY_API_KEY=""))
    mocker.patch("api.agents.trend_agent.feedparser.parse", side_effect=RuntimeError("RSS failure"))

    result = run_trend_agent(make_state("mutual funds"))

    assert result["trend_context"] == ""
    assert result["trend_sources"] == []
    assert result["trend_cache_hit"] is False


def test_appends_to_audit_log(mocker):
    mocker.patch("api.agents.trend_agent.get_trend_cache", return_value=None)
    mocker.patch("api.agents.trend_agent.settings", mocker.Mock(TAVILY_API_KEY="test-key"))
    mock_tavily = mocker.Mock()
    mock_tavily.search.return_value = {
        "results": [
            {"content": "Trend 1", "url": "https://example.com/1"},
            {"content": "Trend 2", "url": "https://example.com/2"},
        ]
    }
    mocker.patch("api.agents.trend_agent.TavilyClient", return_value=mock_tavily)
    mocker.patch("api.agents.trend_agent.upsert_trend_cache", return_value=None)

    existing_audit = [
        {"agent": "intake_agent", "action": "planned"},
        {"agent": "draft_agent", "action": "drafted"},
    ]

    result = run_trend_agent(make_state("market outlook", audit_log=existing_audit))

    assert len(result["audit_log"]) == 3
    assert result["audit_log"][-1]["agent"] == "trend_agent"


def test_trend_context_stored_in_state(mocker):
    mocker.patch(
        "api.agents.trend_agent.get_trend_cache",
        return_value={
            "snippets": ["RBI rate cut expected", "SIP inflows at record high"],
            "sources": ["https://economictimes.indiatimes.com/markets/rss.cms"],
        },
    )

    result = run_trend_agent(make_state("SIP investing"))

    assert (
        result["trend_context"]
        == "• RBI rate cut expected\n• SIP inflows at record high\n"
        "Sources: https://economictimes.indiatimes.com/markets/rss.cms"
    )
    assert result["trend_cache_hit"] is True


@pytest.mark.integration
def test_real_groq_call_returns_non_empty_string():
    # Name kept for backwards compatibility with existing test references.
    result = run_trend_agent(make_state("mutual fund investment for beginners"))

    assert isinstance(result["trend_context"], str)
    assert isinstance(result["trend_sources"], list)
    assert result["audit_log"][-1]["agent"] == "trend_agent"
