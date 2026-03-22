"""
Localization agent: Adapts content for Hindi audience.
"""

from api.graph.state import ContentState


def run_localization_agent(state: ContentState) -> dict:
    """
    Localize English content to Hindi with cultural adaptation.

    Returns:
        dict: State updates with localized_hi content
    """
    return {
        "localized_hi": "यह एक परीक्षण हिंदी सामग्री है। (This is test Hindi content.)",
        "pipeline_status": "localization_complete",
        "audit_log": state.get("audit_log", []) + [{"agent": "localization_agent", "action": "stub", "target_language": "hi"}]
    }
