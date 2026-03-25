"""
Intake agent: Analyzes brief and creates content strategy.
"""

import json
import logging
import time

from api.graph.state import ContentState
from api.llm import call_llm

logger = logging.getLogger(__name__)


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
            "strategy_recommendation": None,
            "content_calendar": None,
        }

    # F2: Override LLM-chosen tone with user-selected tone if provided
    if brief.get("tone"):
        strategy["tone"] = brief["tone"]

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
        "pipeline_status": "intake_complete",
        "audit_log": state.get("audit_log", []) + [audit_entry]
    }
