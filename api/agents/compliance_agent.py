"""
Compliance agent: Checks draft against compliance rules.
"""

import json
import logging
import time
from pathlib import Path

from api.config import settings
from api.database import get_org_rules
from api.graph.state import ContentState
from api.llm import call_llm

logger = logging.getLogger(__name__)


def _load_json_rules() -> list[dict]:
    """Load enabled compliance rules from local JSON fallback."""
    rules_path = Path(__file__).parent.parent / "data" / "compliance_rules.json"
    with open(rules_path) as f:
        all_rules = json.load(f)

    enabled_rules = [r for r in all_rules if r.get("enabled", False)]
    return [
        {
            "rule_id": r.get("id", ""),
            "category": r.get("category", ""),
            "rule_text": r.get("rule_text", ""),
            "severity": r.get("severity", "warning"),
            "source": "json_file",
        }
        for r in enabled_rules
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

    # Load rules dynamically from Supabase by session when available.
    rules_source = "json_file"
    combined_rules: list[dict]
    if session_id:
        try:
            if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
                rules = get_org_rules(session_id)
            else:
                rules = []

            if len(rules) > 0:
                rules_source = "org_rules"
                default_rules = get_org_rules("default")
                org_rule_ids = {str(r.get("rule_id", "")) for r in rules}
                combined_rules = rules + [
                    r for r in default_rules if str(r.get("rule_id", "")) not in org_rule_ids
                ]
            else:
                combined_rules = get_org_rules("default")
                rules_source = "default"
        except Exception as exc:
            logger.warning(
                "Failed to fetch Supabase rules for session_id=%s; falling back to JSON rules: %s",
                session_id,
                exc,
            )
            combined_rules = _load_json_rules()
            rules_source = "json_file"
    else:
        combined_rules = _load_json_rules()
        rules_source = "json_file"

    if not combined_rules:
        combined_rules = _load_json_rules()
        rules_source = "json_file"

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
4. Annotate EVERY violation you find
5. Return ONLY the JSON object. No explanation, no markdown."""

    # Build user prompt
    user_prompt = f"""RULES:
{formatted_rules}

DRAFT:
{draft}"""

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
    result = json.loads(cleaned_response)

    # Extract components
    verdict = result.get("verdict", "PASS")
    annotations = result.get("annotations", [])
    summary = result.get("summary", "")

    # Build audit log entry
    audit_entry = {
        "agent": "compliance_agent",
        "action": "checked_compliance",
        "model": model,
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
        "org_rules_count": len(combined_rules),
        "rules_source": rules_source,
        "pipeline_status": "compliance_complete",
        "audit_log": state.get("audit_log", []) + [audit_entry]
    }
