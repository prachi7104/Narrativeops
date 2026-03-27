"""
Compliance agent: Checks draft against compliance rules.
"""

import json
import logging
import time

from api.config import settings
from api.database import get_org_rules, query_brand_knowledge
from api.graph.state import ContentState
from api.llm import call_llm
from api.llm_router import log_routing_decision, route_model

logger = logging.getLogger(__name__)


def _emergency_fallback_rules() -> list[dict]:
    """Hard-coded fallback used when Supabase rules are unavailable."""
    return [
        {
            "rule_id": "SEBI01",
            "category": "banned_phrase",
            "rule_text": "Do not use 'guaranteed returns', 'guaranteed profit', or 'assured returns'.",
            "severity": "error",
            "source": "emergency_fallback",
        },
        {
            "rule_id": "SEBI02",
            "category": "banned_phrase",
            "rule_text": "Do not use 'risk-free investment', 'zero-risk', or 'no-risk'.",
            "severity": "error",
            "source": "emergency_fallback",
        },
        {
            "rule_id": "SEBI03",
            "category": "required_disclaimer",
            "rule_text": (
                "Investment content must include: 'Investments are subject to market risk. "
                "Please read all scheme-related documents carefully before investing.'"
            ),
            "severity": "error",
            "source": "emergency_fallback",
        },
        {
            "rule_id": "ASCI01",
            "category": "factual_claim",
            "rule_text": "Content must not be misleading through omission of material risk facts.",
            "severity": "error",
            "source": "emergency_fallback",
        },
    ]


def run_compliance_agent(state: ContentState) -> dict:
    """
    Check draft against compliance rules and provide verdict.

    Returns:
        dict: State updates with verdict, feedback, incremented iterations
    """
    draft = state.get("draft", "")
    current_iterations = state.get("compliance_iterations", 0)
    session_id = str(state.get("session_id", "") or "").strip()

    # Load rules from Supabase with a hard-coded emergency fallback.
    rules_source = "default"
    combined_rules: list[dict] = []
    try:
        if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
            default_rules = get_org_rules("default")
            session_rules = get_org_rules(session_id) if session_id else []

            if session_rules:
                session_rule_ids = {str(r.get("rule_id", "")) for r in session_rules}
                combined_rules = session_rules + [
                    r for r in default_rules if str(r.get("rule_id", "")) not in session_rule_ids
                ]
                rules_source = "org_rules"
            else:
                combined_rules = default_rules
                rules_source = "default"
    except Exception as exc:
        logger.warning(
            "Failed to fetch Supabase rules for session_id=%s. Using emergency fallback: %s",
            session_id,
            exc,
        )

    if not combined_rules:
        combined_rules = _emergency_fallback_rules()
        rules_source = "emergency_fallback"

    brand_knowledge: list[dict] = []
    if session_id:
        try:
            brand_knowledge = query_brand_knowledge(session_id)
        except Exception as exc:
            logger.warning("Failed to load brand knowledge for compliance session_id=%s: %s", session_id, exc)

    # Format rules for prompt, including source attribution.
    formatted_rules = "\n".join(
        [
            f"{str(r.get('rule_id', ''))}: "
            f"[{str(r.get('source', 'json_file')).upper()}] "
            f"[{str(r.get('category', ''))}] "
            f"{str(r.get('rule_text', ''))}"
            for r in combined_rules
        ]
    )

    compliance_flags = state.get("compliance_flags", []) or []
    flag_lines = [f"- {str(flag).strip()}" for flag in compliance_flags if str(flag).strip()]

    compliance_history = state.get("compliance_history", []) or []

    # Canonical disclaimer — used to build the prompt instruction
    _CANONICAL_DISCLAIMER = (
        "Investments are subject to market risk. "
        "Please read all scheme-related documents carefully before investing."
    )

    # Build prior-iteration context to prevent re-flagging
    resolved_context = ""
    if len(compliance_history) > 0:
        resolved_context = (
            "\n\nPREVIOUS ITERATIONS — DO NOT RE-FLAG THESE ISSUES:\n"
            "The following issues were flagged in previous iterations and the draft has "
            "been revised to address them. Do NOT flag them again unless the fix was "
            "clearly undone in the current draft:\n"
        )
        for entry in compliance_history:
            resolved_context += (
                f"  Iteration {entry.get('iteration', '?')}: "
                f"{entry.get('violations_count', 0)} violation(s) — "
                f"{entry.get('summary', '')[:150]}\n"
            )

    # Check if the canonical disclaimer is already present in draft
    disclaimer_present = _CANONICAL_DISCLAIMER.lower() in draft.lower()
    disclaimer_instruction = (
        "\n- SEBI03 CHECK: The exact canonical disclaimer "
        "'Investments are subject to market risk. Please read all scheme-related "
        "documents carefully before investing.' IS present verbatim in the draft. "
        "Do NOT flag SEBI03 or any required-disclaimer rule."
        if disclaimer_present
        else ""
    )

    # System prompt with exact JSON schema
    system_prompt = """You are a compliance checker for Economic Times financial content.
Review the draft article against the compliance rules below.

VERDICT rules:
- PASS: No rule violations found
- REVISE: Rule violations exist, but can be corrected with targeted rewrites
- REJECT: Factually false claims that cannot be fixed by rewording

Annotation requirements:
- Return each violation as an annotation with:
  - section: INTRO, BODY, or CONCLUSION
  - sentence: The exact sentence from the draft (verbatim)
  - rule_id: The rule violated (e.g., R01)
  - severity: error or warning
  - message: Violation description
  - suggested_fix: How to fix it

Return ONLY a JSON object with this schema:
{
  "verdict": "PASS | REVISE | REJECT",
  "annotations": [
    {
      "section": "INTRO | BODY | CONCLUSION",
      "sentence": "exact verbatim sentence from draft",
      "rule_id": "R01",
      "severity": "error | warning",
      "message": "violation description",
      "suggested_fix": "how to fix"
    }
  ],
  "summary": "brief summary of findings"
}

Critical rules:
1. If verdict is PASS, annotations must be an empty array []
2. REJECT only for factually false claims that cannot be fixed by rewording
3. REVISE when violations exist but can be corrected with targeted rewrites
4. Annotate EVERY violation you find — but do NOT re-flag issues already fixed in prior iterations
5. Return ONLY the JSON object. No explanation, no markdown.""" + disclaimer_instruction + resolved_context

    if flag_lines:
        system_prompt += (
            "\n\nPRIORITY RISK AREAS (identified during intake analysis):\n"
            + "\n".join(flag_lines)
            + "\nPay extra attention to these topics when reviewing the draft."
        )

    # Build user prompt
    user_prompt = f"""RULES:
{formatted_rules}

DRAFT:
{draft}"""

    if brand_knowledge:
        prohibitions = [item for item in brand_knowledge if item.get("relation") == "prohibits"]
        requirements = [item for item in brand_knowledge if item.get("relation") == "requires"]
        kg_lines = ["BRAND KNOWLEDGE CONSTRAINTS:"]
        if prohibitions:
            kg_lines.append("- Prohibited patterns:")
            kg_lines.extend(f"  - {str(item.get('value', ''))}" for item in prohibitions[:8])
        if requirements:
            kg_lines.append("- Required patterns:")
            kg_lines.extend(f"  - {str(item.get('value', ''))}" for item in requirements[:8])
        user_prompt = "\n".join(kg_lines) + "\n\n" + user_prompt

    # Call LLM with timing
    start_time = time.time()
    model_primary = route_model(
        "compliance",
        content_category=str(state.get("content_category") or "general"),
        compliance_iteration=current_iterations,
    )
    model_fallback = route_model("rule_extraction")
    log_routing_decision(
        "compliance",
        model_primary,
        reason=(
            f"category={str(state.get('content_category') or 'general')} "
            f"iteration={current_iterations}"
        ),
    )

    raw_response = call_llm(
        model=model_primary,
        system=system_prompt,
        user=user_prompt,
        max_tokens=3000,
        json_mode=True
    )

    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)

    # Strip markdown code fences
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
        result = json.loads(cleaned_response)
    except (json.JSONDecodeError, ValueError) as parse_exc:
        logger.warning(
            "Failed to parse compliance JSON response (iteration %s): %s",
            current_iterations + 1,
            parse_exc,
        )
        parse_feedback = [
            {
                "section": "BODY",
                "sentence": "",
                "rule_id": "SYSTEM_PARSE",
                "severity": "error",
                "message": "Compliance model response could not be parsed. Manual review required.",
                "suggested_fix": "Regenerate compliance analysis and re-check all high-risk claims.",
            }
        ]
        history_entry = {
            "iteration": current_iterations + 1,
            "verdict": "REVISE",
            "violations_count": len(parse_feedback),
            "summary": "Compliance parse failure"[:200],
        }
        return {
            "compliance_verdict": "REVISE",
            "compliance_feedback": parse_feedback,
            "compliance_iterations": current_iterations + 1,
            "compliance_history": state.get("compliance_history", []) + [history_entry],
            "org_rules_count": len(combined_rules),
            "rules_source": rules_source,
            "pipeline_status": "compliance_complete",
            "audit_log": state.get("audit_log", [])
            + [
                {
                    "agent": "compliance_agent",
                    "action": "checked_compliance",
                    "model": model_primary,
                    "duration_ms": duration_ms,
                    "verdict": "REVISE",
                    "output_summary": (
                        "JSON parse failed — defaulting to REVISE "
                        f"(fallback configured: {model_fallback})"
                    ),
                }
            ],
        }

    # Extract components
    verdict = result.get("verdict", "PASS")
    annotations = result.get("annotations", []) or []
    summary = result.get("summary", "")

    # Post-LLM: if ALL annotations are warnings (no errors), force PASS.
    # This prevents the LLM's over-cautious REVISE from causing infinite loops.
    if verdict == "REVISE" and annotations:
        error_annotations = [
            a for a in annotations
            if str(a.get("severity", "warning")).lower() == "error"
        ]
        if not error_annotations:
            logger.info(
                "Overriding REVISE→PASS: all %s annotation(s) are warnings only (no errors).",
                len(annotations),
            )
            verdict = "PASS"
            annotations = []  # Clear warnings — they've been addressed sufficiently
            summary = (summary or "") + " [auto-pass: warnings only]"

    history_entry = {
        "iteration": current_iterations + 1,
        "verdict": verdict,
        "violations_count": len(annotations),
        "summary": str(summary)[:200] if summary else "",
    }

    # Build audit log entry
    audit_entry = {
        "agent": "compliance_agent",
        "action": "checked_compliance",
        "model": model_primary,
        "duration_ms": duration_ms,
        "verdict": verdict,
        "violations": len(annotations),
        "rules_source": rules_source,
        "rules_checked": len(combined_rules),
        "output_summary": json.dumps(
            {
                "format": "compliance_v1",
                "verdict": verdict,
                "summary": summary[:400] if summary else "No violations found",
                "annotations": annotations[:5],
            }
        ),
    }

    return {
        "compliance_verdict": verdict,
        "compliance_feedback": annotations,
        "compliance_iterations": current_iterations + 1,
        "compliance_history": state.get("compliance_history", []) + [history_entry],
        "org_rules_count": len(combined_rules),
        "rules_source": rules_source,
        "pipeline_status": "compliance_complete",
        "audit_log": state.get("audit_log", []) + [audit_entry]
    }
