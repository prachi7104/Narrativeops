from __future__ import annotations

import asyncio
import io
import json
import logging
import threading
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

from api import database
from api.agents.rule_extractor_agent import extract_rules_from_pdf
from api.graph.state import ContentState

logger = logging.getLogger(__name__)

app = FastAPI(title="NarrativeOps API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://narrativeops.vercel.app"],
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
            "strategy": {},
            "trend_context": "",
            "past_feedback": database.get_past_feedback(brief.get("topic", "")),
            "draft": "",
            "draft_version": 0,
            "compliance_verdict": "",
            "compliance_feedback": [],
            "compliance_iterations": 0,
            "localized_hi": "",
            "blog_html": "",
            "twitter_thread": [],
            "linkedin_post": "",
            "whatsapp_message": "",
            "human_approved": False,
            "escalation_required": False,
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
        pipeline.invoke({"human_approved": True}, config)

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
