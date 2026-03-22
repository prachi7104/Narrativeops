"""
Routing logic for LangGraph pipeline nodes.

This module defines conditional routing between pipeline stages based on content state:

- route_after_compliance: Routes based on compliance verdict and iteration count.
  Passes to localization if compliant, escalates if rejected/max iterations,
  or loops back to draft agent for revisions.

- route_after_intake: Placeholder for future branching based on engagement data.
  Currently routes all paths to draft_agent for consistency.
"""

from api.graph.state import ContentState


def route_after_compliance(state: ContentState) -> str:
    """
    Route after compliance check based on verdict and iteration count.

    Returns:
        - "localization_agent" if compliant
        - "human_escalation" if rejected or max iterations reached
        - "draft_agent" if revision needed and iterations < 3
    """
    if state["compliance_verdict"] == "PASS":
        return "localization_agent"

    if state["compliance_iterations"] >= 3:
        return "human_escalation"

    if state["compliance_verdict"] == "REJECT":
        return "human_escalation"

    # Otherwise: REVISE and iterations < 3
    return "draft_agent"


def route_after_intake(state: ContentState) -> str:
    """
    Route after intake agent processing.

    Placeholder for future branching logic based on engagement data.
    Currently routes all paths to draft_agent.

    Returns:
        - "draft_agent" for all paths
    """
    # Engagement data check for future implementation
    if state["engagement_data"] is not None and len(state["engagement_data"]) > 0:
        pass  # Future: different handling based on engagement levels

    return "draft_agent"
