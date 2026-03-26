"""
Localization agent: Adapts content for Hindi audience.
"""

import re
import time

from api.graph.state import ContentState
from api.llm import call_llm


def _normalize_financial_terms(text: str) -> str:
    """Normalize common acronym transliterations to preferred financial spellings."""
    normalized = text
    # Keep SIP explicit so downstream checks and human reviewers see a clear acronym.
    normalized = re.sub(r"\bसिप\b", "एसआईपी", normalized)
    return normalized


def run_localization_agent(state: ContentState) -> dict:
    """
    Localize English content to Hindi with cultural adaptation.

    Returns:
        dict: State updates with localized_hi content
    """
    # F3: Skip Hindi localization if user did not request it
    target_languages = state.get("brief", {}).get("target_languages", ["en", "hi"])
    if "hi" not in target_languages:
        return {
            "localized_hi": "",
            "pipeline_status": "localization_skipped",
            "audit_log": state.get("audit_log", [])
            + [{"agent": "localization_agent", "action": "skipped_by_user"}],
        }

    draft = state.get("draft", "")

    # Build comprehensive system prompt
    system_prompt = """You are a professional Hindi content specialist. You will translate and culturally adapt
English financial content for Indian readers. This is NOT word-for-word translation.
Your output must read as if it was originally written in Hindi.

EXPLICIT RULES (follow each one):

1. Translate every fact and meaning accurately — no information may be lost
2. Replace English idioms with natural Hindi equivalents that Indian readers will recognize
3. Use formal Hindi register throughout (आप form, not तुम or तू)
4. Financial terms: keep NAV, SIP, SEBI, RBI, NPS, PPF as-is (they are used in Hindi too)
   but translate: mutual fund = म्युचुअल फंड, investment = निवेश, returns = रिटर्न
5. Replace Western references: 401k → PPF or NPS, Wall Street → दलाल स्ट्रीट
6. Sentence structure: rewrite for natural Hindi flow, not English sentence order
7. Preserve these markers exactly as they appear: ##INTRO ##BODY ##CONCLUSION

EXAMPLES OF BAD VS GOOD LOCALIZATION:

Bad: "आपका पैसा गारंटीड रिटर्न देगा" (literal, unnatural)
Good: "आपके निवेश पर बाजार के अनुसार रिटर्न मिल सकता है" (natural, compliant)

Bad: "401k की तरह" (Western reference makes no sense to Indian readers)
Good: "पीपीएफ या एनपीएस की तरह" (Indian equivalent familiar to readers)

Bad: "शेयर बाजार भूकंप" (overly sensational, literal translation)
Good: "शेयर बाजार में उतार-चढ़ाव" (appropriate tone for ET)

SELF-REVIEW STEP:
After translating, ask yourself:
- Would a Hindi newspaper like Dainik Bhaskar or Hindustan Times print this as-is?
- If no, revise it.
- Do all Hindi words sound natural and not forced?
- Have I preserved all factual information?
- Are the markers ##INTRO ##BODY ##CONCLUSION still present?

Return ONLY the Hindi translated content with section markers preserved."""

    user_prompt = f"""Translate and culturally adapt the following English financial content to Hindi:

{draft}"""

    # Call LLM with timing
    start_time = time.time()
    model = "llama-3.3-70b-versatile"

    localized_hi = call_llm(
        model=model,
        system=system_prompt,
        user=user_prompt,
        max_tokens=3000,
        json_mode=False
    )
    localized_hi = _normalize_financial_terms(localized_hi)

    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)

    # Build audit log entry
    audit_entry = {
        "agent": "localization_agent",
        "action": "localized_to_hindi",
        "model": model,
        "duration_ms": duration_ms,
        "target_language": "hi",
        "output_summary": f"Hindi content generated, word_count~{len(localized_hi.split())}"
    }

    return {
        "localized_hi": localized_hi,
        "pipeline_status": "localization_complete",
        "audit_log": state.get("audit_log", []) + [audit_entry]
    }
