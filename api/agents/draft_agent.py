"""
Draft agent: Generates article content with section markers.
"""

import json
import logging
import time

from api.database import get_recent_corrections
from api.graph.state import ContentState
from api.llm import call_llm

logger = logging.getLogger(__name__)

MANDATORY_DISCLAIMER = (
    "Investments are subject to market risk. "
    "Please read all scheme-related documents carefully before investing."
)


def inject_mandatory_disclaimer(draft: str) -> str:
    """Ensure mandatory investment disclaimer is present in the draft."""
    draft_text = draft or ""

    # Case-insensitive presence check across whole draft.
    if "investments are subject to market risk" in draft_text.lower():
        return draft_text

    marker = "##CONCLUSION"
    if marker in draft_text:
        before, after = draft_text.split(marker, 1)
        after_clean = after.lstrip("\n")
        if after_clean:
            return f"{before}{marker}\n{MANDATORY_DISCLAIMER}\n\n{after_clean}"
        return f"{before}{marker}\n{MANDATORY_DISCLAIMER}"

    trimmed = draft_text.rstrip()
    if trimmed:
        return f"{trimmed}\n\n{MANDATORY_DISCLAIMER}"
    return MANDATORY_DISCLAIMER


def run_draft_agent(state: ContentState) -> dict:
    """
    Generate article draft or revise based on compliance feedback.

    Returns:
        dict: State updates with draft, incremented draft_version, cleared compliance_feedback
    """
    brief = state["brief"]
    strategy = state["strategy"]
    compliance_feedback = state.get("compliance_feedback", [])
    current_draft = state.get("draft", "")
    past_feedback = state.get("past_feedback", [])
    content_category = str(state.get("content_category") or "general").strip() or "general"

    recent_corrections: list[dict] = []
    try:
        recent_corrections = get_recent_corrections(content_category, limit=3)
    except Exception as exc:
        logger.warning(
            "Failed to load recent corrections for content_category=%s: %s",
            content_category,
            exc,
        )
        recent_corrections = []

    if len(recent_corrections) > 0:
        lines = ["EDITORIAL CORRECTIONS FROM PREVIOUS SIMILAR CONTENT:"]
        lines.append("Your editors have previously improved AI drafts like this:")
        for correction in recent_corrections:
            lines.append(f"• Previous change: {correction['diff_summary']}")
        lines.append("Apply these patterns to improve this draft.")
        correction_context = "\n".join(lines)
    else:
        correction_context = ""

    # Determine if this is a revision or fresh draft
    is_revision = len(compliance_feedback) > 0

    model = "llama-3.3-70b-versatile"

    if is_revision:
        # REVISION MODE: Fix specific flagged sentences
        system_prompt = f"""You are an editor for Economic Times.
Revise the draft article below by fixing ONLY the specific flagged sentences.

Tone: {strategy.get('tone', 'authoritative')}
Word count target: {strategy.get('word_count', 600)}

CRITICAL: The output MUST contain these exact section markers:
##INTRO
##BODY
##CONCLUSION

Return ONLY the complete revised draft. No explanation."""

        user_prompt = "Current Draft:\n" + current_draft + "\n\n"
        user_prompt += "Compliance Issues to Fix:\n"
        for i, feedback_item in enumerate(compliance_feedback, 1):
            user_prompt += f"{i}. Flagged sentence: \"{feedback_item.get('sentence', '')}\"\n"
            user_prompt += f"   Issue: {feedback_item.get('message', '')}\n"
            user_prompt += f"   Suggested fix: {feedback_item.get('suggested_fix', '')}\n\n"

        user_prompt += "Do not change any other sentence. Return the complete revised draft with ##INTRO, ##BODY, ##CONCLUSION markers."

        if correction_context:
            user_prompt = correction_context + "\n\n" + user_prompt

        action = "revised"
    else:
        # FRESH DRAFT MODE
        system_prompt = f"""You are a content writer for Economic Times (ET).
Write an article based on the content strategy.

Format: {strategy.get('format', 'article')}
Tone: {strategy.get('tone', 'authoritative')}
Word count: {strategy.get('word_count', 600)} words
Key messages: {', '.join(strategy.get('key_messages', []))}

CRITICAL: The output MUST contain these exact section markers:
##INTRO
##BODY
##CONCLUSION

Guidelines:
- Write for ET readers (educated, financially aware audience)
- Tone matches the strategy ({strategy.get('tone', 'authoritative')})
- No sensationalist language
- No unverified return percentage claims
- If writing about investments: Include "Investments are subject to market risk" disclaimer naturally in conclusion

Return ONLY the article text with section markers. No explanation."""

        user_prompt = f"Content Brief:\n{json.dumps(brief, indent=2)}\n\n"

        if correction_context:
            user_prompt = correction_context + "\n\n" + user_prompt

        if state.get("trend_context"):
            user_prompt += (
                "CURRENT TRENDS AND CONTEXT (incorporate these naturally):\n"
                f"{state['trend_context']}\n\n"
            )

        if past_feedback:
            user_prompt += "Learn from past feedback on similar content:\n"
            for i, feedback in enumerate(past_feedback[:3], 1):  # Limit to top 3
                user_prompt += f"{i}. {feedback}\n"
            user_prompt += "\n"

        user_prompt += f"Write a {strategy.get('word_count', 600)}-word {strategy.get('format', 'article')} article."

        action = "drafted"

    # Call LLM with timing
    start_time = time.time()

    draft_content = call_llm(
        model=model,
        system=system_prompt,
        user=user_prompt,
        max_tokens=3000,
        json_mode=False
    )

    draft_content = inject_mandatory_disclaimer(draft_content)

    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)

    # Ensure section markers are present
    if "##INTRO" not in draft_content:
        draft_content = "##INTRO\n" + draft_content

    if "##BODY" not in draft_content:
        # Insert ##BODY after first paragraph
        lines = draft_content.split("\n")
        intro_end = 0
        for i, line in enumerate(lines):
            if line.strip() and not line.startswith("##"):
                intro_end = i + 1
                break
        lines.insert(intro_end, "\n##BODY")
        draft_content = "\n".join(lines)

    if "##CONCLUSION" not in draft_content:
        # Insert ##CONCLUSION before last paragraph
        draft_content = draft_content.rsplit("\n\n", 1)
        if len(draft_content) == 2:
            draft_content = draft_content[0] + "\n\n##CONCLUSION\n" + draft_content[1]
        else:
            draft_content = draft_content[0] + "\n\n##CONCLUSION\nTo be continued."

    # Build audit log entry
    new_version = state.get("draft_version", 0) + 1
    audit_entry = {
        "agent": "draft_agent",
        "action": action,
        "model": model,
        "duration_ms": duration_ms,
        "corrections_applied": len(recent_corrections),
        "content_category": content_category,
        "output_summary": f"version={new_version}, word_count~{len(draft_content.split())}, is_revision={is_revision}"
    }

    return {
        "draft": draft_content,
        "draft_version": new_version,
        "corrections_applied": len(recent_corrections),
        "compliance_feedback": [],  # Clear after processing
        "pipeline_status": "draft_complete",
        "audit_log": state.get("audit_log", []) + [audit_entry]
    }
