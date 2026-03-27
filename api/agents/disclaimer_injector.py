"""Deterministic disclaimer injector agent."""

import re

from api.graph.state import ContentState

DISCLAIMER_TEXT = (
    "Investments are subject to market risk. "
    "Please read all scheme-related documents carefully before investing."
)

# Exact canonical phrase (case-insensitive match for detection)
_CANONICAL_LOWER = DISCLAIMER_TEXT.lower()

# Loose partial match — any variation that looks like the start of the disclaimer
_PARTIAL_PATTERN = re.compile(
    r"investments\s+are\s+subject\s+to\s+market\s+risk",
    re.IGNORECASE,
)


def _has_exact_disclaimer(text: str) -> bool:
    """Return True only if the full canonical disclaimer is present verbatim."""
    return _CANONICAL_LOWER in text.lower()


def _has_partial_disclaimer(text: str) -> bool:
    """Return True if a partial/variant disclaimer is present (but not the full canonical text)."""
    return bool(_PARTIAL_PATTERN.search(text))


def _remove_partial_disclaimers(text: str) -> str:
    """Remove any existing partial disclaimer sentences so we can inject the canonical version."""
    # Remove lines that contain the partial pattern
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        if _PARTIAL_PATTERN.search(line):
            # Skip lines that are a partial/wrong disclaimer variant
            continue
        cleaned.append(line)
    return "\n".join(cleaned).rstrip()


def _inject_into_conclusion(draft: str) -> str:
    """Append canonical disclaimer into the ##CONCLUSION section."""
    marker = "##CONCLUSION"
    draft_text = draft or ""

    if marker not in draft_text:
        trimmed = draft_text.rstrip()
        if trimmed:
            return f"{trimmed}\n\n{marker}\n{DISCLAIMER_TEXT}"
        return f"{marker}\n{DISCLAIMER_TEXT}"

    before, after = draft_text.split(marker, 1)
    after_stripped = after.lstrip("\n")

    if not after_stripped:
        return f"{before}{marker}\n{DISCLAIMER_TEXT}"

    if after_stripped.endswith("\n"):
        return f"{before}{marker}\n{after_stripped}{DISCLAIMER_TEXT}"
    return f"{before}{marker}\n{after_stripped}\n{DISCLAIMER_TEXT}"


def run_disclaimer_injector(state: ContentState) -> dict:
    """
    Ensure the exact mandatory investment disclaimer exists in the draft.

    Strategy:
    - If the full canonical disclaimer is already present verbatim → skip (no-op).
    - If a partial/variant exists (e.g. "investments are subject to market risk" without
      the second sentence) → remove the partial and re-inject the canonical version.
    - If no disclaimer at all → inject into the ##CONCLUSION section.

    This agent performs only deterministic string manipulation with no LLM calls.
    """
    draft = state.get("draft", "")
    audit_log = state.get("audit_log", [])

    # Fast path: exact canonical disclaimer already present
    if _has_exact_disclaimer(draft):
        return {
            "draft": draft,
            "audit_log": audit_log + [{"agent": "disclaimer_injector", "action": "skipped"}],
        }

    # If a partial/variant exists, strip it out first so we can inject the canonical form
    if _has_partial_disclaimer(draft):
        draft = _remove_partial_disclaimers(draft)

    updated_draft = _inject_into_conclusion(draft)
    return {
        "draft": updated_draft,
        "audit_log": audit_log + [{"agent": "disclaimer_injector", "action": "injected"}],
    }
