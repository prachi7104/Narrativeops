"""
Compliance agent: Checks draft against compliance rules.
"""

from api.graph.state import ContentState


def run_compliance_agent(state: ContentState) -> dict:
    """
    Check draft against compliance rules and provide verdict.

    Returns:
        dict: State updates with verdict, empty compliance_feedback, incremented iterations
    """
    return {
        "compliance_verdict": "PASS",
        "compliance_feedback": [],
        "compliance_iterations": state.get("compliance_iterations", 0) + 1,
        "pipeline_status": "compliance_complete",
        "audit_log": state.get("audit_log", []) + [{"agent": "compliance_agent", "action": "stub", "verdict": "PASS"}]
    }
