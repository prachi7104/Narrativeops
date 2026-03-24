"""Format agent: generates channel-specific content formats."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from api.database import (
    get_recent_corrections,
    save_pipeline_metrics,
    update_run_status,
    write_audit_log,
    write_pipeline_outputs,
)
from api.graph.state import ContentState
from api.llm import call_llm

logger = logging.getLogger(__name__)


def _clean_json_response(raw_response: str) -> dict[str, Any]:
    cleaned = raw_response.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    return json.loads(cleaned)


def _validate_twitter_thread(thread: list[str]) -> list[str]:
    validated: list[str] = []
    for tweet in thread:
        text = str(tweet)
        if len(text) > 280:
            text = text[:280]
        validated.append(text)
    return validated


def run_format_agent(state: ContentState) -> dict:
    """Format compliance-passed draft into channel-specific outputs."""
    draft = state.get("draft", "")
    run_id = state.get("run_id", "")
    model = "llama-3.1-8b-instant"

    system_prompt = """You are a content formatting specialist.
Format the compliance-passed English draft into channel-specific outputs.

Return ONLY a JSON object with this exact schema:
{
  "blog_html": "<article> element with semantic HTML — h1 for title, h2 for sections,
                p for paragraphs. Include all content from the draft.",
  "twitter_thread": ["1/N tweet text (max 280 chars)", "2/N ...", ...],
  "linkedin_post": "150-300 word post. First sentence must create curiosity or state
                    a surprising fact. Professional but conversational tone.",
  "whatsapp_message": "80-100 words. Plain text only. No asterisks, no dashes,
                       no markdown. Short sentences. Easy to read on a phone screen."
}

Twitter rules:
- Number every tweet: 1/N format where N is the total tweet count
- Maximum 7 tweets
- Each tweet must be 280 characters or fewer (enforce this strictly)
- Last tweet should direct readers to the full article"""

    user_prompt = f"DRAFT:\n{draft}"

    start_time = time.time()
    raw_response = call_llm(
        model=model,
        system=system_prompt,
        user=user_prompt,
        max_tokens=2500,
        json_mode=True,
    )
    duration_ms = int((time.time() - start_time) * 1000)

    result = _clean_json_response(raw_response)

    blog_html = str(result.get("blog_html", ""))
    linkedin_post = str(result.get("linkedin_post", ""))
    whatsapp_message = str(result.get("whatsapp_message", ""))

    raw_thread = result.get("twitter_thread", [])
    if isinstance(raw_thread, list):
        twitter_thread = _validate_twitter_thread([str(tweet) for tweet in raw_thread])
    else:
        twitter_thread = _validate_twitter_thread([str(raw_thread)])

    output_payload = {
        "blog_html": blog_html,
        "twitter_thread": twitter_thread,
        "linkedin_post": linkedin_post,
        "whatsapp_message": whatsapp_message,
    }

    audit_entry = {
        "agent": "format_agent",
        "action": "formatted_channels",
        "model": model,
        "duration_ms": duration_ms,
        "channels": ["blog_html", "twitter_thread", "linkedin_post", "whatsapp_message"],
        "twitter_count": len(twitter_thread),
    }
    full_audit_log = state.get("audit_log", []) + [audit_entry]

    try:
        write_pipeline_outputs(
            run_id=run_id,
            outputs=output_payload,
            localized_hi=state.get("localized_hi", ""),
        )
    except Exception as exc:
        logger.exception("Failed to write pipeline outputs to Supabase: %s", exc)

    try:
        write_audit_log(run_id=run_id, audit_log=full_audit_log)
    except Exception as exc:
        logger.exception("Failed to write audit log to Supabase: %s", exc)

    try:
        total_duration_ms = sum(
            int(entry.get("duration_ms") or 0) for entry in state.get("audit_log", [])
        )
        agent_count = len([entry for entry in state.get("audit_log", []) if entry.get("agent")])

        category = str(state.get("content_category") or "general").strip() or "general"
        recent = get_recent_corrections(category, limit=10)
        corrections_applied = len(recent)

        MANUAL_HOURS_PER_PIECE = 7.5
        COST_PER_HOUR_INR = 1500

        trend_sources = state.get("trend_sources", [])
        trend_sources_used = len(trend_sources) if isinstance(trend_sources, list) else 0

        metrics_dict = {
            "total_duration_ms": total_duration_ms,
            "agent_count": agent_count,
            "compliance_iterations": state.get("compliance_iterations", 0),
            "corrections_applied": corrections_applied,
            "rules_checked": state.get("org_rules_count", 8),
            "trend_sources_used": trend_sources_used,
            "estimated_hours_saved": MANUAL_HOURS_PER_PIECE,
            "estimated_cost_saved_inr": MANUAL_HOURS_PER_PIECE * COST_PER_HOUR_INR,
        }
        save_pipeline_metrics(state["run_id"], metrics_dict)

        audit_entry["metrics_saved"] = True
        audit_entry["estimated_hours_saved"] = MANUAL_HOURS_PER_PIECE
    except Exception as exc:
        logger.exception("Failed to calculate/save pipeline metrics for run_id=%s: %s", run_id, exc)

    try:
        update_run_status(run_id=run_id, status="awaiting_approval")
    except Exception as exc:
        logger.exception("Failed to update run status in Supabase: %s", exc)

    return {
        **output_payload,
        "pipeline_status": "awaiting_approval",
        "audit_log": full_audit_log,
    }
