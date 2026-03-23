"""Trend agent: builds grounded context from cache, Tavily, and ET RSS."""

from __future__ import annotations

import hashlib
import logging

import feedparser
from tavily import TavilyClient

from api.config import settings
from api.database import get_trend_cache, upsert_trend_cache
from api.graph.state import ContentState

logger = logging.getLogger(__name__)

RSS_URL = "https://economictimes.indiatimes.com/markets/rss.cms"
ALLOWED_DOMAINS = [
    "economictimes.com",
    "moneycontrol.com",
    "livemint.com",
    "businesstoday.in",
    "ndtv.com",
]


def _to_list(value) -> list:
    if isinstance(value, list):
        return value
    return []


def _format_trend_context(snippets: list[str], sources: list[str]) -> str:
    cleaned = [str(item).strip() for item in snippets[:4] if str(item).strip()]
    if not cleaned:
        return ""

    lines = [f"• {item}" for item in cleaned]
    source_subset = [str(url).strip() for url in sources[:3] if str(url).strip()]
    if source_subset:
        lines.append(f"Sources: {', '.join(source_subset)}")
    return "\n".join(lines)


def _fetch_from_tavily(topic: str) -> tuple[list[str], list[str]]:
    api_key = (settings.TAVILY_API_KEY or "").strip()
    if not api_key:
        return [], []

    client = TavilyClient(api_key=api_key)
    results = client.search(
        query=topic,
        max_results=5,
        include_domains=ALLOWED_DOMAINS,
    )
    rows = results.get("results", []) if isinstance(results, dict) else []

    snippets = [str(row.get("content", ""))[:200] for row in rows[:4] if row.get("content")]
    sources = [str(row.get("url", "")) for row in rows[:4] if row.get("url")]
    return snippets, sources


def _fetch_from_rss(topic: str) -> tuple[list[str], list[str]]:
    feed = feedparser.parse(RSS_URL)
    entries = getattr(feed, "entries", []) or []
    topic_words = {word for word in topic.lower().split() if word}

    filtered = []
    for entry in entries:
        title = str(getattr(entry, "title", "") or "")
        title_lower = title.lower()
        if any(word in title_lower for word in topic_words):
            filtered.append(entry)
        if len(filtered) >= 4:
            break

    snippets: list[str] = []
    sources: list[str] = []
    for entry in filtered:
        summary = str(getattr(entry, "summary", "") or "")
        title = str(getattr(entry, "title", "") or "")
        link = str(getattr(entry, "link", "") or "")

        snippets.append((summary[:200] if summary else title)[:200])
        if link:
            sources.append(link)

    return snippets, sources


def run_trend_agent(state: ContentState) -> dict:
    """Generate trend context from cache first, then Tavily, then ET RSS fallback."""
    topic = str(state.get("brief", {}).get("topic", "") or "")
    topic_hash = hashlib.md5(topic.lower().strip().encode()).hexdigest()

    snippets: list[str] = []
    sources: list[str] = []
    cache_hit = False
    action = "failed"

    cached = get_trend_cache(topic_hash)
    if cached:
        snippets = _to_list(cached.get("snippets"))
        sources = _to_list(cached.get("sources"))
        cache_hit = True
        action = "cache_hit"
    else:
        fetched = False

        try:
            snippets, sources = _fetch_from_tavily(topic)
            if snippets or sources:
                action = "fetched_tavily"
                fetched = True
        except Exception as exc:
            logger.exception("Tavily trend fetch failed for topic '%s': %s", topic, exc)

        if not fetched:
            try:
                snippets, sources = _fetch_from_rss(topic)
                if snippets or sources:
                    action = "fetched_rss"
                    fetched = True
            except Exception as exc:
                logger.exception("RSS trend fetch failed for topic '%s': %s", topic, exc)

        if fetched:
            upsert_trend_cache(topic_hash, topic, snippets, sources)
        else:
            logger.warning("Trend agent failed to fetch grounded context for topic '%s'", topic)
            snippets = []
            sources = []
            action = "failed"

    trend_context = _format_trend_context(snippets, sources)
    if not snippets:
        trend_context = ""

    audit_entry = {
        "agent": "trend_agent",
        "action": action,
        "sources_count": len(sources),
        "cache_hit": cache_hit,
        "output_summary": f"Trend context: {len(trend_context)} chars from {len(sources)} sources",
    }

    return {
        "trend_context": trend_context,
        "trend_sources": sources,
        "trend_cache_hit": cache_hit,
        "audit_log": state.get("audit_log", []) + [audit_entry],
    }
