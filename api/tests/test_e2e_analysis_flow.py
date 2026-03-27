from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import (
    SSE_COMPLETED_AT,
    SSE_QUEUES,
    SSE_TERMINAL_EVENTS,
    _resume_pipeline_sync,
    _run_pipeline_thread,
    app,
)


@pytest.fixture(autouse=True)
def clear_sse_state():
    SSE_QUEUES.clear()
    SSE_TERMINAL_EVENTS.clear()
    SSE_COMPLETED_AT.clear()
    yield
    SSE_QUEUES.clear()
    SSE_TERMINAL_EVENTS.clear()
    SSE_COMPLETED_AT.clear()


@pytest.mark.asyncio
async def test_status_endpoint_includes_brief_json(mocker):
    run_payload = {
        "id": "run-status-1",
        "status": "awaiting_approval",
        "brief_json": {
            "topic": "SIP vs lump sum",
            "content_category": "mutual_fund",
        },
    }
    mocker.patch("api.main.database.get_run", return_value=run_payload)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/pipeline/run-status-1/status")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "awaiting_approval"
    assert body["pipeline_status"] == "awaiting_approval"
    assert body["brief_json"]["content_category"] == "mutual_fund"


def test_run_thread_reconciles_terminal_status_from_db(mocker):
    class FakePipeline:
        def stream(self, _state, _config, stream_mode="updates"):
            assert stream_mode == "updates"
            yield {"draft_agent": {"draft": "ok"}}

        def get_state(self, _config):
            return SimpleNamespace(values={"audit_log": [{"agent": "draft_agent", "action": "generated"}]})

    mocker.patch("api.graph.pipeline.get_pipeline", return_value=FakePipeline())
    mocker.patch("api.main.database.get_past_feedback", return_value=[])
    # First call: cancellation check in stream loop. Second call: terminal status reconciliation.
    mocker.patch(
        "api.main.database.get_run",
        side_effect=[{"id": "run-e2e-1", "status": "running"}, {"id": "run-e2e-1", "status": "awaiting_approval"}],
    )
    mock_update_status = mocker.patch("api.main.database.update_run_status", return_value=None)
    mocker.patch("api.main.database.write_audit_log", return_value=None)
    mock_emit = mocker.patch("api.main._emit_sse", return_value=None)

    _run_pipeline_thread("run-e2e-1", {"topic": "SIP"}, None)

    mock_update_status.assert_any_call("run-e2e-1", "awaiting_approval")
    terminal_events = [call.args[1] for call in mock_emit.call_args_list if call.args and len(call.args) == 2]
    assert any(event.get("type") == "human_required" for event in terminal_events)


def test_resume_sync_emits_pipeline_complete(mocker):
    class FakePipeline:
        def __init__(self):
            self.updated = False

        def get_state(self, _config):
            return SimpleNamespace(values={"pipeline_status": "awaiting_approval"})

        def update_state(self, _config, update):
            self.updated = update.get("human_approved") is True

        def stream(self, _state, _config, stream_mode="updates"):
            assert stream_mode == "updates"
            assert self.updated is True
            yield {"format_agent": {"pipeline_status": "format_complete"}}

    fake = FakePipeline()
    mocker.patch("api.graph.pipeline.get_pipeline", return_value=fake)
    mock_update_status = mocker.patch("api.main.database.update_run_status", return_value=None)
    mock_emit = mocker.patch("api.main._emit_sse", return_value=None)

    _resume_pipeline_sync("run-e2e-2")

    mock_update_status.assert_called_once_with("run-e2e-2", "completed")
    emitted = [call.args[1] for call in mock_emit.call_args_list if call.args and len(call.args) == 2]
    assert any(event.get("type") == "pipeline_complete" for event in emitted)


@pytest.mark.asyncio
async def test_approve_recreates_sse_queue_and_runs_resume(mocker):
    run_id = "run-e2e-approve"
    original_queue = asyncio.Queue()
    SSE_QUEUES[run_id] = original_queue

    mocker.patch("api.main.database.approve_run", return_value=None)
    mock_resume = mocker.patch("api.main._resume_pipeline_sync", return_value=None)

    payload = {"approved": True}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/api/pipeline/{run_id}/approve", json=payload)

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert run_id in SSE_QUEUES
    assert isinstance(SSE_QUEUES[run_id], asyncio.Queue)
    assert SSE_QUEUES[run_id] is not original_queue
    mock_resume.assert_called_once_with(run_id)
