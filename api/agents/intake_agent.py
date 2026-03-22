"""
Intake agent: Analyzes brief and creates content strategy.
"""

from api.graph.state import ContentState


def run_intake_agent(state: ContentState) -> dict:
    """
    Process brief and engagement data to create content strategy.

    Returns:
        dict: State updates with strategy, pipeline_status, and audit_log entry
    """
    return {
        "strategy": {
            "format": "article",
            "tone": "authoritative",
            "word_count": 600,
            "key_messages": ["test"],
            "channels": ["blog", "twitter", "linkedin", "whatsapp"],
            "languages": ["en", "hi"],
            "compliance_flags": []
        },
        "pipeline_status": "intake_complete",
        "audit_log": state.get("audit_log", []) + [{"agent": "intake_agent", "action": "stub"}]
    }
