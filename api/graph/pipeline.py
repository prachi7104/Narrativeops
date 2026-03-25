"""
LangGraph pipeline for Lumina content generation.

This module builds the multi-agent content generation pipeline with:
- Sequential processing through intake -> draft -> compliance -> localization -> format
- Conditional routing after compliance (pass/revise/escalate)
- Human approval checkpoint after formatting
- Durable checkpointing for state persistence across process restarts
"""

import logging
import os
import threading
from pathlib import Path

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from api.agents.compliance_agent import run_compliance_agent
from api.agents.disclaimer_injector import run_disclaimer_injector
from api.agents.draft_agent import run_draft_agent
from api.agents.format_agent import run_format_agent
from api.agents.intake_agent import run_intake_agent
from api.agents.localization_agent import run_localization_agent
from api.agents.trend_agent import run_trend_agent
from api.graph.routing import route_after_compliance
from api.graph.state import ContentState

logger = logging.getLogger(__name__)

_PIPELINE = None
_PIPELINE_LOCK = threading.Lock()


def _build_checkpointer():
    checkpoint_path = Path(
        os.getenv("LANGGRAPH_CHECKPOINT_DB", "api/.cache/langgraph-checkpoints.sqlite")
    )
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        from langgraph.checkpoint.sqlite import SqliteSaver

        return SqliteSaver.from_conn_string(str(checkpoint_path))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "SQLite checkpointer unavailable, falling back to MemorySaver: %s",
            exc,
        )
        return MemorySaver()


def human_escalation(state: ContentState) -> dict:
    """
    Mark content for human escalation and manual review.

    Returns:
        dict: State updates marking escalation and audit log entry
    """
    return {
        "escalation_required": True,
        "pipeline_status": "escalated",
        "audit_log": state.get("audit_log", []) + [{"agent": "human_escalation", "action": "escalated"}]
    }


def build_pipeline():
    """
    Build and compile the Lumina content pipeline graph.

    Pipeline flow:
        1. intake_agent: Analyze brief and create strategy
        2. trend_agent: Generate trend context for the topic
        3. draft_agent: Generate article draft
        4. disclaimer_injector: Ensure mandatory disclaimer in conclusion
        5. compliance_agent: Check compliance rules
        6. [Conditional] -> draft_agent (revise) OR localization_agent (pass) OR human_escalation (reject/max iterations)
        7. localization_agent: Adapt to Hindi
        8. format_agent: Generate channel-specific outputs
        9. [INTERRUPT] Human approval checkpoint
        9. END

    Returns:
        Compiled StateGraph with checkpointer and human approval interrupt
    """
    # Initialize graph with ContentState
    graph = StateGraph(ContentState)

    # Add nodes
    graph.add_node("intake_agent", run_intake_agent)
    graph.add_node("trend_agent", run_trend_agent)
    graph.add_node("draft_agent", run_draft_agent)
    graph.add_node("disclaimer_injector", run_disclaimer_injector)
    graph.add_node("compliance_agent", run_compliance_agent)
    graph.add_node("localization_agent", run_localization_agent)
    graph.add_node("format_agent", run_format_agent)
    graph.add_node("human_escalation", human_escalation)

    # Set entry point
    graph.set_entry_point("intake_agent")

    # Add edges
    graph.add_edge("intake_agent", "trend_agent")
    graph.add_edge("trend_agent", "draft_agent")
    graph.add_edge("draft_agent", "disclaimer_injector")
    graph.add_edge("disclaimer_injector", "compliance_agent")

    # Conditional routing after compliance
    graph.add_conditional_edges(
        "compliance_agent",
        route_after_compliance,
        {
            "draft_agent": "draft_agent",
            "localization_agent": "localization_agent",
            "human_escalation": "human_escalation"
        }
    )

    graph.add_edge("localization_agent", "format_agent")
    graph.add_edge("format_agent", END)
    graph.add_edge("human_escalation", END)

    # Compile with checkpointer and interrupt for human approval after outputs are generated
    checkpointer = _build_checkpointer()
    compiled_graph = graph.compile(
        checkpointer=checkpointer,
        interrupt_after=["format_agent"]
    )

    return compiled_graph


def get_pipeline():
    global _PIPELINE

    if _PIPELINE is not None:
        return _PIPELINE

    with _PIPELINE_LOCK:
        if _PIPELINE is None:
            _PIPELINE = build_pipeline()

    return _PIPELINE


if __name__ == "__main__":
    pipeline = build_pipeline()
    print("Pipeline compiled successfully")
