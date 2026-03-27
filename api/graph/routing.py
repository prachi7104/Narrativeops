"""
Routing logic for LangGraph pipeline nodes.

This module defines conditional routing between pipeline stages based on content state:

- route_after_compliance: Routes based on compliance verdict and iteration count.
  Passes to localization if compliant, escalates if rejected/max iterations,
  or loops back to draft agent for revisions.

- route_after_intake: Logs engagement pivot readiness after intake.
    Currently routes all paths to trend_agent for safe single-path execution.
"""

import logging

from api.graph.state import ContentState

logger = logging.getLogger(__name__)


def route_after_compliance(state: ContentState) -> str:
    """
    Route after compliance check based on verdict and iteration count.

    Returns:
        - "localization_agent" if compliant (PASS) or soft-pass (warnings-only after iter 3)
        - "human_escalation" if rejected or max iterations (5) reached
        - "draft_agent" if revision needed and iterations < 5
    """
    verdict = state["compliance_verdict"]
    iterations = state["compliance_iterations"]
    feedback = state.get("compliance_feedback", []) or []

    # PASS always wins.
    if verdict == "PASS":
        return "localization_agent"

    # Hard reject escalates directly — cannot be fixed by rewording.
    if verdict == "REJECT":
        return "human_escalation"

    # SOFT-PASS: after 3 iterations, if only warnings remain (no errors), let through.
    # This prevents infinite loops when only minor style warnings are left.
    if iterations >= 3 and verdict == "REVISE":
        only_warnings = all(
            str(item.get("severity", "warning")).lower() == "warning"
            for item in feedback
        )
        if only_warnings or not feedback:
            logger.info(
                "Soft-pass after %s iterations — only warnings remain. Routing to localization.",
                iterations,
            )
            return "localization_agent"

    # REVISE with exhausted attempts (hard limit = 5) escalates.
    if iterations >= 5:
        return "human_escalation"

    # Otherwise: REVISE and iterations < 5
    return "draft_agent"


def route_after_intake(state: ContentState) -> str:
    """
    Route after intake agent processing.

    Route after intake agent.

    Engagement pivots are computed at intake and persisted in state.
    We keep execution on a single path for now (trend_agent), while
    preserving visibility in graph routing and logs for future branching.

    Returns:
        - "trend_agent" for all paths
    """
    engagement_strategy = state.get("engagement_strategy", {}) or {}
    if engagement_strategy.get("pivot_recommended"):
        logger.info(
            "Engagement pivot detected: %s",
            engagement_strategy.get("pivot_reason", ""),
        )

    return "trend_agent"
