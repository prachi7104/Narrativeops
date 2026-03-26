"""
Intake agent: Analyzes brief and creates content strategy.
"""

import json
import logging
import time

from api.graph.state import ContentState
from api.llm import call_llm

logger = logging.getLogger(__name__)


def _detect_content_category(brief: dict) -> str:
    """Detect content category from brief topic/description keywords."""
    text = (
        str(brief.get("description", "")) + " " + str(brief.get("topic", ""))
    ).lower()
    if any(word in text for word in ["mutual fund", "sip", "nav", "amc", "nfo"]):
        return "mutual_fund"
    if any(word in text for word in ["fintech", "payment", "insurance", "upi", "neft"]):
        return "fintech"
    if any(
        word in text
        for word in ["stock", "equity", "share", "nse", "bse", "sensex", "nifty"]
    ):
        return "equity"
    return "general"


def _derive_best_channel(engagement_data: dict | None, default_channel: str = "blog") -> str:
    if not isinstance(engagement_data, dict) or not engagement_data:
        return default_channel

    best_channel = default_channel
    best_score = float("-inf")

    for channel, payload in engagement_data.items():
        if not isinstance(payload, dict):
            continue

        engagement_rate = payload.get("engagement_rate", 0)
        avg_views = payload.get("avg_views", 0)

        try:
            rate_value = float(engagement_rate)
        except (TypeError, ValueError):
            rate_value = 0.0

        try:
            views_value = float(avg_views)
        except (TypeError, ValueError):
            views_value = 0.0

        score = (rate_value * 100) + (views_value / 1000)
        if score > best_score:
            best_score = score
            best_channel = str(channel).strip() or default_channel

    channel_map = {
        "text_article": "blog",
        "article": "blog",
        "video": "linkedin",
        "short_video": "twitter",
    }
    return channel_map.get(best_channel, best_channel)


def _safe_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def run_intake_agent(state: ContentState) -> dict:
    """
    Process brief and engagement data to create content strategy.

    Returns:
        dict: State updates with strategy, pipeline_status, and audit_log entry
    """
    brief = state["brief"]
    engagement_data = state.get("engagement_data")
    requested_output_format = str(state.get("output_format") or "multi_platform_pack")

    format_hint_map = {
        "et_op_ed": "et_op_ed",
        "et_explainer_box": "et_explainer_box",
        "multi_platform_pack": "multi_platform_pack",
    }
    enforced_format = format_hint_map.get(requested_output_format, "multi_platform_pack")

    # Build system prompt with exact JSON schema
    system_prompt = """You are a content strategist for Economic Times.
Analyze the user's content brief and create a comprehensive content strategy.

The editorial format is already chosen by the user. You MUST set "format" to "__ENFORCED_FORMAT__".

Return ONLY a JSON object with this exact schema:
{
    "format": "et_op_ed | et_explainer_box | multi_platform_pack",
  "tone": "authoritative | accessible | analytical",
  "word_count": <number between 400 and 800>,
  "key_messages": ["string"],
  "channels": ["blog", "twitter", "linkedin", "whatsapp"],
  "languages": ["en", "hi"],
  "compliance_flags": ["list of risk areas mentioned in the brief"],
  "best_channel": "blog | twitter | linkedin | whatsapp | faq | publisher_brief | null",
  "strategy_recommendation": "string or null",
  "content_calendar": [{"week": 1, "items": [{"format": "...", "topic": "...", "channel": "..."}]}] or null
}

Return ONLY the JSON object. No explanation, no markdown, no preamble."""
    system_prompt = system_prompt.replace("__ENFORCED_FORMAT__", enforced_format)

    # Build user prompt
    user_prompt = f"Content Brief:\n{json.dumps(brief, indent=2)}\n\n"

    if engagement_data:
        user_prompt += f"Engagement Data from Previous Content:\n{json.dumps(engagement_data, indent=2)}\n\n"
        user_prompt += """Based on the engagement data, include:
- strategy_recommendation: A 2-sentence recommendation based on engagement patterns
- content_calendar: 4 weeks with 3 items per week (format, topic, channel for each item)
"""
    else:
        user_prompt += "Note: No engagement data provided. Set strategy_recommendation and content_calendar to null.\n"

    # Call LLM with timing
    start_time = time.time()
    model = "llama-3.1-8b-instant"

    raw_response = call_llm(
        model=model,
        system=system_prompt,
        user=user_prompt,
        max_tokens=2000,
        json_mode=True
    )

    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)

    # Strip markdown code fences if present
    cleaned_response = raw_response.strip()
    if cleaned_response.startswith("```json"):
        cleaned_response = cleaned_response[7:]
    if cleaned_response.startswith("```"):
        cleaned_response = cleaned_response[3:]
    if cleaned_response.endswith("```"):
        cleaned_response = cleaned_response[:-3]
    cleaned_response = cleaned_response.strip()

    # Parse JSON
    try:
        strategy = json.loads(cleaned_response)
    except (json.JSONDecodeError, ValueError) as parse_exc:
        logger.warning("Failed to parse intake strategy JSON: %s", parse_exc)
        strategy = {
            "format": enforced_format,
            "tone": "authoritative",
            "word_count": 600,
            "key_messages": [],
            "channels": ["blog", "twitter", "linkedin", "whatsapp"],
            "languages": ["en", "hi"],
            "compliance_flags": [],
            "best_channel": None,
            "strategy_recommendation": None,
            "content_calendar": None,
        }

    # F2: Override LLM-chosen tone with user-selected tone if provided
    if brief.get("tone"):
        strategy["tone"] = brief["tone"]

    inferred_best_channel = _derive_best_channel(engagement_data)
    allowed_channels = {"blog", "twitter", "linkedin", "whatsapp", "faq", "publisher_brief"}
    llm_best_channel = str(strategy.get("best_channel") or "").strip()

    if llm_best_channel not in allowed_channels:
        strategy["best_channel"] = inferred_best_channel
    else:
        strategy["best_channel"] = llm_best_channel

    detected_category = _detect_content_category(brief)
    raw_flags = strategy.get("compliance_flags", [])
    compliance_flags = raw_flags if isinstance(raw_flags, list) else []

    engagement_strategy: dict = {}
    if isinstance(engagement_data, dict) and engagement_data:
        content_calendar = strategy.get("content_calendar")
        strategy_rec = strategy.get("strategy_recommendation")

        scored_channels: list[tuple[str, dict, float]] = []
        for channel, payload in engagement_data.items():
            if not isinstance(payload, dict):
                continue
            rate = _safe_float(payload.get("engagement_rate"))
            views = _safe_float(payload.get("avg_views"))
            score = (rate * 100) + (views / 1000)
            scored_channels.append((str(channel), payload, score))

        scored_channels.sort(key=lambda item: item[2], reverse=True)

        if len(scored_channels) >= 2:
            top_ch, top_perf, _ = scored_channels[0]
            bot_ch, bot_perf, _ = scored_channels[-1]
            top_rate = _safe_float(top_perf.get("engagement_rate"))
            bot_rate = _safe_float(bot_perf.get("engagement_rate"))
            ratio = (top_rate / bot_rate) if bot_rate > 0 else float("inf")
            ratio_value = round(ratio, 1) if ratio != float("inf") else 99.9
            pivot_recommended = ratio > 2.0

            engagement_strategy = {
                "recommendation": strategy_rec,
                "content_calendar": content_calendar,
                "top_channel": top_ch,
                "underperforming_channel": bot_ch,
                "performance_ratio": ratio_value,
                "pivot_recommended": pivot_recommended,
                "pivot_reason": (
                    f"{top_ch} outperforms {bot_ch} by {ratio_value}x "
                    f"(engagement rate: {top_rate:.1%} vs {bot_rate:.1%})"
                ) if pivot_recommended else None,
            }
        else:
            engagement_strategy = {
                "recommendation": strategy_rec,
                "content_calendar": content_calendar,
            }

    # Build audit log entry
    audit_entry = {
        "agent": "intake_agent",
        "action": "analyzed_brief",
        "model": model,
        "duration_ms": duration_ms,
        "output_summary": f"format={strategy.get('format')}, tone={strategy.get('tone')}, word_count={strategy.get('word_count')}",
    }

    return {
        "strategy": strategy,
        "content_category": detected_category,
        "compliance_flags": [str(flag) for flag in compliance_flags if str(flag).strip()],
        "engagement_strategy": engagement_strategy,
        "pipeline_status": "intake_complete",
        "audit_log": state.get("audit_log", []) + [audit_entry]
    }
