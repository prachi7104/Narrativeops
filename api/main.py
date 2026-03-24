from __future__ import annotations

import asyncio
import difflib
import io
import json
import logging
import sys
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

# Allow absolute imports (from api...) when this file is launched from api/ as CWD.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api import database  # noqa: E402
from api.agents.rule_extractor_agent import extract_rules_from_pdf  # noqa: E402
from api.config import settings  # noqa: E402
from api.graph.state import ContentState  # noqa: E402

logger = logging.getLogger(__name__)

app = FastAPI(title="NarrativeOps API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

SSE_QUEUES: dict[str, asyncio.Queue] = {}
APP_EVENT_LOOP: asyncio.AbstractEventLoop | None = None


class RunRequest(BaseModel):
    brief: dict
    engagement_data: dict | None = None


class ApproveRequest(BaseModel):
    approved: bool = True


class FeedbackRequest(BaseModel):
    rating: int
    comment: str
    channel: str = "blog"


class PatchOutputRequest(BaseModel):
    channel: str
    language: str
    content: str


class DiffRequest(BaseModel):
    channel: str
    original_text: str
    corrected_text: str
    content_category: str


@app.on_event("startup")
async def on_startup() -> None:
    from api.data.seed_default_rules import seed_default_rules

    seed_default_rules()
    global APP_EVENT_LOOP
    APP_EVENT_LOOP = asyncio.get_running_loop()
    logger.info("NarrativeOps API starting")


def _emit_sse(run_id: str, event: dict) -> None:
    if APP_EVENT_LOOP is None:
        logger.error("Cannot emit SSE event; app event loop is not initialized")
        return

    queue = SSE_QUEUES.get(run_id)
    if queue is None:
        logger.warning("No SSE queue found for run_id=%s", run_id)
        return

    try:
        asyncio.run_coroutine_threadsafe(queue.put(event), APP_EVENT_LOOP)
    except Exception as exc:
        logger.exception("Failed to emit SSE event for run_id=%s: %s", run_id, exc)


def _format_duration_ms(duration_ms: int) -> str:
    seconds = max(duration_ms, 0) // 1000
    minutes = seconds // 60
    rem_seconds = seconds % 60
    return f"{minutes}m {rem_seconds}s"


def _format_inr_indian(value: float) -> str:
    amount = int(round(value))
    sign = "-" if amount < 0 else ""
    amount = abs(amount)

    num = str(amount)
    if len(num) <= 3:
        return f"{sign}\u20b9{num}"

    last3 = num[-3:]
    remaining = num[:-3]
    groups: list[str] = []
    while len(remaining) > 2:
        groups.insert(0, remaining[-2:])
        remaining = remaining[:-2]
    if remaining:
        groups.insert(0, remaining)

    return f"{sign}\u20b9{','.join(groups)},{last3}"


def _run_pipeline_thread(run_id: str, brief: dict, engagement_data: dict | None) -> None:
    try:
        # Lazy import to avoid circular dependencies at module import time.
        from api.graph.pipeline import build_pipeline

        pipeline = build_pipeline()
        config = {"configurable": {"thread_id": run_id}}

        initial_state: ContentState = {
            "run_id": run_id,
            "brief": brief,
            "engagement_data": engagement_data,
            # Extract top-level fields from brief dict
            "session_id": str(brief.get("session_id", "") or ""),
            "content_category": str(brief.get("content_category", "general") or "general"),
            "strategy": {},
            "trend_context": "",
            "trend_sources": [],
            "trend_cache_hit": False,
            "past_feedback": database.get_past_feedback(brief.get("topic", "")),
            "draft": "",
            "draft_version": 0,
            "compliance_verdict": "",
            "compliance_feedback": [],
            "compliance_iterations": 0,
            "org_rules_count": 0,
            "rules_source": "",
            "localized_hi": "",
            "blog_html": "",
            "twitter_thread": [],
            "linkedin_post": "",
            "whatsapp_message": "",
            "human_approved": False,
            "escalation_required": False,
            "diff_captured": False,
            "error_message": None,
            "pipeline_status": "running",
            "audit_log": [],
        }

        for update in pipeline.stream(initial_state, config, stream_mode="updates"):
            _emit_sse(
                run_id,
                {
                    "type": "update",
                    "run_id": run_id,
                    "data": update,
                },
            )

        _emit_sse(
            run_id,
            {
                "type": "human_required",
                "run_id": run_id,
            },
        )
    except Exception as exc:
        logger.exception("Pipeline execution failed for run_id=%s: %s", run_id, exc)
        database.update_run_status(run_id, "failed")
        _emit_sse(
            run_id,
            {
                "type": "error",
                "run_id": run_id,
                "message": str(exc),
            },
        )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/upload-guide")
async def upload_brand_guide(
    file: UploadFile = File(...),  # noqa: B008
    session_id: str = Form(...),  # noqa: B008
) -> dict:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF file too large (max 10MB)")

    result = extract_rules_from_pdf(pdf_bytes, session_id)

    return {
        "session_id": session_id,
        "rules_extracted": result.get("count", 0),
        "preview": result.get("preview", []),
        "error": result.get("error"),
    }


@app.post("/api/pipeline/run")
async def run_pipeline(request: RunRequest) -> dict:
    run_id = str(uuid.uuid4())
    database.create_run(run_id, request.brief)

    queue: asyncio.Queue = asyncio.Queue()
    SSE_QUEUES[run_id] = queue

    thread = threading.Thread(
        target=_run_pipeline_thread,
        args=(run_id, request.brief, request.engagement_data),
        daemon=True,
    )
    thread.start()

    return {"run_id": run_id, "status": "started"}


@app.get("/api/pipeline/{run_id}/stream")
async def stream_pipeline(run_id: str) -> StreamingResponse:
    queue = SSE_QUEUES.get(run_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="run_id not found")

    async def event_generator():
        terminal_types = {"human_required", "error", "pipeline_complete"}

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120)
                yield f"data: {json.dumps(event)}\n\n"

                if event.get("type") in terminal_types:
                    break
            except TimeoutError:
                yield 'data: {"type":"heartbeat"}\n\n'

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/pipeline/{run_id}/outputs")
async def get_pipeline_outputs(run_id: str) -> dict:
    return {"outputs": database.get_outputs(run_id)}


@app.post("/api/pipeline/{run_id}/approve")
async def approve_pipeline(run_id: str, request: ApproveRequest) -> dict:
    if request.approved:
        database.approve_run(run_id)

        # Resume graph from checkpoint with human approval signal.
        from api.graph.pipeline import build_pipeline

        pipeline = build_pipeline()
        config = {"configurable": {"thread_id": run_id}}

        # Update state with human_approved and resume from the interrupted node
        # LangGraph requires update_state followed by invoke to resume
        pipeline.update_state(config, {"human_approved": True})

        # Resume the pipeline from the interrupt point
        for _update in pipeline.stream(None, config, stream_mode="updates"):
            pass  # run to completion synchronously

        queue = SSE_QUEUES.get(run_id)
        if queue is not None and APP_EVENT_LOOP is not None:
            asyncio.run_coroutine_threadsafe(
                queue.put({"type": "pipeline_complete", "run_id": run_id}),
                APP_EVENT_LOOP,
            )
        return {"status": "approved"}

    database.update_run_status(run_id, "rejected")
    return {"status": "rejected"}


@app.post("/api/pipeline/{run_id}/feedback")
async def save_pipeline_feedback(run_id: str, request: FeedbackRequest) -> dict:
    brief_topic = "Untitled"

    try:
        client = database.get_supabase_client()
        if client is not None:
            response = (
                client.table("pipeline_runs")
                .select("brief_topic")
                .eq("id", run_id)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            if rows:
                brief_topic = rows[0].get("brief_topic", "Untitled")
    except Exception as exc:
        logger.exception("Failed to fetch brief_topic for run_id=%s: %s", run_id, exc)

    database.save_feedback(
        run_id=run_id,
        rating=request.rating,
        comment=request.comment,
        brief_topic=brief_topic,
        channel=request.channel,
    )
    return {"status": "saved"}


@app.patch("/api/pipeline/{run_id}/output")
async def patch_pipeline_output(run_id: str, request: PatchOutputRequest) -> dict:
    database.patch_output(
        run_id=run_id,
        channel=request.channel,
        language=request.language,
        content=request.content,
    )

    try:
        client = database.get_supabase_client()
        if client is not None:
            client.table("agent_events").insert(
                {
                    "run_id": run_id,
                    "agent_name": "user_edit",
                    "action": "manual_edit",
                    "output_summary": f"User manually edited {request.channel}/{request.language} output",
                }
            ).execute()
    except Exception as exc:
        logger.exception("Failed to write user_edit audit event for run_id=%s: %s", run_id, exc)

    return {
        "status": "updated",
        "channel": request.channel,
        "language": request.language,
    }


@app.post("/api/pipeline/{run_id}/diff")
async def capture_pipeline_diff(run_id: str, request: DiffRequest) -> dict:
    try:
        differ = difflib.Differ()
        diff = list(
            differ.compare(
                request.original_text.splitlines(keepends=True),
                request.corrected_text.splitlines(keepends=True),
            )
        )
        added = [line[2:] for line in diff if line.startswith("+ ")]
        removed = [line[2:] for line in diff if line.startswith("- ")]

        diff_summary = f"Added {len(added)} lines, removed {len(removed)} lines."
        if len(added) == 0 and len(removed) == 0:
            diff_summary = "No changes detected"

        database.save_editorial_correction(
            run_id=run_id,
            channel=request.channel,
            original_text=request.original_text,
            corrected_text=request.corrected_text,
            content_category=request.content_category,
            diff_summary=diff_summary,
        )

        client = database.get_supabase_client()
        corrections_count = 0
        if client is not None:
            (
                client.table("pipeline_outputs")
                .update({"content": request.corrected_text})
                .eq("run_id", run_id)
                .eq("channel", request.channel)
                .execute()
            )

            status_response = (
                client.table("pipeline_runs")
                .select("status")
                .eq("id", run_id)
                .limit(1)
                .execute()
            )
            status_rows = status_response.data or []
            current_status = str(status_rows[0].get("status", "")) if status_rows else ""
            if current_status != "completed":
                client.table("pipeline_runs").update({"status": "completed"}).eq("id", run_id).execute()

            count_response = (
                client.table("editorial_corrections")
                .select("id", count="exact")
                .eq("content_category", request.content_category)
                .execute()
            )
            if getattr(count_response, "count", None) is not None:
                corrections_count = int(count_response.count or 0)
            else:
                corrections_count = len(count_response.data or [])

        return {
            "status": "captured",
            "diff_summary": diff_summary,
            "corrections_count": corrections_count,
        }
    except Exception as exc:
        logger.exception("Failed to capture diff for run_id=%s: %s", run_id, exc)
        raise HTTPException(status_code=500, detail="Failed to capture diff") from exc


@app.get("/api/pipeline/{run_id}/metrics")
async def get_pipeline_run_metrics(run_id: str) -> dict:
    try:
        metrics = database.get_pipeline_metrics(run_id)
        if not metrics:
            return {"error": "Metrics not yet available", "run_id": run_id}

        total_duration_ms = int(metrics.get("total_duration_ms") or 0)
        estimated_hours_saved = float(metrics.get("estimated_hours_saved") or 0)
        estimated_cost_saved_inr = float(metrics.get("estimated_cost_saved_inr") or 0)
        compliance_iterations = int(metrics.get("compliance_iterations") or 0)
        corrections_applied = int(metrics.get("corrections_applied") or 0)
        rules_checked = int(metrics.get("rules_checked") or 0)
        trend_sources_used = int(metrics.get("trend_sources_used") or 0)

        return {
            "run_id": run_id,
            "total_duration_ms": total_duration_ms,
            "total_duration_display": _format_duration_ms(total_duration_ms),
            "estimated_hours_saved": estimated_hours_saved,
            "time_saved_display": f"{estimated_hours_saved} hours",
            "estimated_cost_saved_inr": estimated_cost_saved_inr,
            "cost_saved_display": _format_inr_indian(estimated_cost_saved_inr),
            "compliance_iterations": compliance_iterations,
            "corrections_applied": corrections_applied,
            "rules_checked": rules_checked,
            "trend_sources_used": trend_sources_used,
            "brand_rules_used": rules_checked > 8,
        }
    except Exception as exc:
        logger.exception("Failed to fetch metrics for run_id=%s: %s", run_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch metrics") from exc


@app.get("/api/dashboard/summary")
async def get_dashboard_summary() -> dict:
    try:
        client = database.get_supabase_client()
        if client is None:
            return {
                "total_runs": 0,
                "total_time_saved_hours": 0.0,
                "total_cost_saved_inr": 0.0,
                "total_corrections_captured": 0,
                "most_recent_runs": [],
            }

        recent_runs_response = (
            client.table("pipeline_runs")
            .select("id,brief_topic,status,created_at")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        recent_runs = recent_runs_response.data or []

        metrics_rows_response = (
            client.table("pipeline_metrics")
            .select("estimated_hours_saved,estimated_cost_saved_inr,corrections_applied")
            .execute()
        )
        metric_rows = metrics_rows_response.data or []

        sum_hours = sum(float(row.get("estimated_hours_saved") or 0) for row in metric_rows)
        sum_cost = sum(float(row.get("estimated_cost_saved_inr") or 0) for row in metric_rows)
        sum_corrections = sum(int(row.get("corrections_applied") or 0) for row in metric_rows)
        total_runs = len(metric_rows)

        formatted_recent_runs = []
        for run in recent_runs:
            created_at = run.get("created_at")
            if hasattr(created_at, "isoformat"):
                created_at_value = created_at.isoformat()
            else:
                created_at_value = str(created_at or "")

            formatted_recent_runs.append(
                {
                    "id": run.get("id"),
                    "brief_topic": run.get("brief_topic"),
                    "status": run.get("status"),
                    "created_at": created_at_value,
                }
            )

        return {
            "total_runs": total_runs,
            "total_time_saved_hours": float(sum_hours or 0),
            "total_cost_saved_inr": float(sum_cost or 0),
            "total_corrections_captured": int(sum_corrections or 0),
            "most_recent_runs": formatted_recent_runs,
        }
    except Exception as exc:
        logger.exception("Failed to fetch dashboard summary: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard summary") from exc


@app.get("/api/pipeline/runs")
async def list_runs(
    limit: int = Query(default=20, ge=1, le=100),
    status: str = Query(default="all"),
) -> dict:
    runs = database.list_pipeline_runs(limit=limit, status=status)
    return {"runs": runs}


@app.get("/api/settings/rules")
async def get_default_rules() -> dict:
    client = database.get_supabase_client()
    if client is None:
        return {"rules": [], "count": 0, "source": "json_fallback"}

    rules = database.get_default_org_rules()
    return {"rules": rules, "count": len(rules), "source": "supabase"}


@app.post("/api/settings/rules/reload")
async def reload_default_rules() -> dict:
    from api.data.seed_default_rules import seed_default_rules

    seed_default_rules(force=True)
    rules = database.get_default_org_rules()
    return {"status": "reloaded", "count": len(rules), "source": "supabase"}


@app.get("/api/settings/corrections-summary")
async def get_corrections_summary() -> dict:
    return database.get_corrections_summary()


@app.get("/api/memory")
async def get_style_memory(limit: int = Query(default=20, ge=1, le=100)) -> dict:
    return database.get_style_memory(limit=limit)


@app.get("/api/pipeline/{run_id}/audit")
async def get_pipeline_audit(run_id: str) -> dict:
    return {"events": database.get_audit(run_id)}


@app.get("/api/pipeline/{run_id}/audit/pdf")
async def get_pipeline_audit_pdf(run_id: str) -> Response:
    events = database.get_audit(run_id)

    pdf_buffer = io.BytesIO()
    document = SimpleDocTemplate(pdf_buffer, pagesize=letter)

    table_data = [["Agent", "Action", "Verdict", "Model", "Duration(ms)", "Summary"]]
    for event in events:
        summary = str(event.get("output_summary") or "")
        if len(summary) > 60:
            summary = summary[:60]

        table_data.append(
            [
                str(event.get("agent_name") or ""),
                str(event.get("action") or ""),
                str(event.get("verdict") or ""),
                str(event.get("model_used") or ""),
                str(event.get("duration_ms") or ""),
                summary,
            ]
        )

    title_table = Table(
        [["NarrativeOps Audit Report"], [f"Run ID: {run_id}"]], colWidths=[7.2 * inch]
    )
    title_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    audit_table = Table(
        table_data,
        repeatRows=1,
        colWidths=[1.0 * inch, 1.0 * inch, 0.8 * inch, 1.2 * inch, 1.0 * inch, 2.2 * inch],
    )
    audit_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    document.build([title_table, audit_table])
    pdf_buffer.seek(0)

    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=audit-{run_id}.pdf"},
    )
