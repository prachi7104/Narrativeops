"""Rule extractor agent: extracts organization rules from a PDF guide once per session."""

from __future__ import annotations

import io
import json
import logging

from pypdf import PdfReader

from api.database import save_org_rules
from api.llm import call_llm

logger = logging.getLogger(__name__)

_ALLOWED_CATEGORIES = {
    "banned_phrase",
    "required_disclaimer",
    "factual_claim",
    "tone",
    "brand_voice",
}
_ALLOWED_SEVERITIES = {"error", "warning"}


def _strip_markdown_fences(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def _validate_rule(rule: dict) -> bool:
    if not isinstance(rule, dict):
        return False

    required_fields = {"rule_id", "rule_text", "category", "severity"}
    if not required_fields.issubset(rule.keys()):
        return False

    rule_id = str(rule.get("rule_id", "")).strip()
    rule_text = str(rule.get("rule_text", "")).strip()
    category = str(rule.get("category", "")).strip()
    severity = str(rule.get("severity", "")).strip()

    if not rule_id or not rule_text:
        return False
    if category not in _ALLOWED_CATEGORIES:
        return False
    if severity not in _ALLOWED_SEVERITIES:
        return False

    return True


def extract_rules_from_pdf(pdf_bytes: bytes, session_id: str) -> dict:
    """
    Extract compliance rules from PDF bytes and persist them for a session.

    Returns:
        dict: {
            "rules": list[dict],
            "count": int,
            "preview": list[dict],
            "error": str | None
        }
    """
    try:
        logger.info("Starting PDF rule extraction for session_id=%s", session_id)

        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""

        extracted_text = text.strip()
        if len(extracted_text) < 100:
            logger.warning(
                "Insufficient PDF text extracted for session_id=%s (chars=%s)",
                session_id,
                len(extracted_text),
            )
            return {
                "rules": [],
                "count": 0,
                "preview": [],
                "error": "Could not extract text from PDF",
            }

        truncated_text = extracted_text[:8000]
        model = "llama-3.1-8b-instant"

        system_prompt = (
            "You are a compliance rule extractor for financial content teams. "
            "Extract all explicit content rules from this brand or compliance guide document. "
            "Rules may include: prohibited phrases, required disclaimers, tone requirements, "
            "factual claim standards, terminology requirements. "
            "Return ONLY a JSON array. No explanation. No markdown. "
            "Each rule object must have exactly these fields: "
            "{"
            "'rule_id': 'ORG01' (sequential, starting from ORG01), "
            "'rule_text': 'full rule description in one clear sentence', "
            "'category': one of: banned_phrase, required_disclaimer, factual_claim, tone, brand_voice, "
            "'severity': 'error' if it is a hard rule, 'warning' if it is guidance"
            "}. "
            "Extract between 8 and 20 rules. If fewer than 8 real rules exist, extract what you can. "
            "If a document section says 'Do not...' or 'Must include...' that is a rule. "
            "Source: brand_guide (you don't need to put this in the output)"
        )
        user_prompt = f"Extract compliance rules from this document:\n\n{truncated_text}"

        logger.info("Calling LLM for rule extraction using model=%s", model)
        raw_response = call_llm(
            model=model,
            system=system_prompt,
            user=user_prompt,
            max_tokens=2000,
            json_mode=False,
        )

        cleaned_response = _strip_markdown_fences(raw_response)
        try:
            parsed = json.loads(cleaned_response)
        except Exception:
            logger.exception("Failed to parse extracted rules JSON for session_id=%s", session_id)
            return {
                "rules": [],
                "count": 0,
                "preview": [],
                "error": "LLM parsing failed",
            }

        if isinstance(parsed, dict) and isinstance(parsed.get("rules"), list):
            candidate_rules = parsed.get("rules", [])
        elif isinstance(parsed, list):
            candidate_rules = parsed
        else:
            logger.warning("Unexpected extracted rule payload type: %s", type(parsed).__name__)
            candidate_rules = []

        valid_rules: list[dict] = []
        for item in candidate_rules:
            if not _validate_rule(item):
                continue

            valid_rules.append(
                {
                    "rule_id": str(item.get("rule_id", "")).strip(),
                    "rule_text": str(item.get("rule_text", "")).strip(),
                    "category": str(item.get("category", "")).strip(),
                    "severity": str(item.get("severity", "")).strip(),
                    "source": "brand_guide",
                }
            )

        if valid_rules:
            logger.info(
                "Saving %s extracted rules to Supabase for session_id=%s",
                len(valid_rules),
                session_id,
            )
            save_org_rules(session_id, valid_rules)
        else:
            logger.warning("No valid rules extracted for session_id=%s", session_id)

        return {
            "rules": valid_rules,
            "count": len(valid_rules),
            "preview": valid_rules[:5],
            "error": None,
        }

    except Exception as exc:
        logger.exception("Rule extraction failed for session_id=%s: %s", session_id, exc)
        return {
            "rules": [],
            "count": 0,
            "preview": [],
            "error": str(exc) if str(exc) else "Rule extraction failed",
        }
