import uuid
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from api import database
from api.main import SSE_QUEUES, app


@pytest.fixture(autouse=True)
def clear_sse_queues():
	SSE_QUEUES.clear()
	yield
	SSE_QUEUES.clear()


@pytest.mark.asyncio
async def test_health_endpoint():
	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		response = await client.get("/health")

	assert response.status_code == 200
	assert response.json().get("status") == "ok"


@pytest.mark.asyncio
async def test_run_pipeline_returns_run_id(mocker):
	mock_thread = mocker.Mock()
	mock_thread.start.return_value = None

	mocker.patch("api.main.threading.Thread", return_value=mock_thread)
	mocker.patch("api.main.database.create_run", return_value=None)

	payload = {"brief": {"topic": "SIP investment for beginners"}}

	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		response = await client.post("/api/pipeline/run", json=payload)

	assert response.status_code == 200
	data = response.json()
	assert data.get("status") == "started"
	run_id = data.get("run_id")
	assert isinstance(run_id, str)

	# Validate UUID format
	uuid.UUID(run_id)


@pytest.mark.asyncio
async def test_stream_returns_404_for_unknown_run():
	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		response = await client.get("/api/pipeline/nonexistent-id/stream")

	assert response.status_code == 404


@pytest.mark.asyncio
async def test_outputs_endpoint(mocker):
	mock_rows = [
		{"channel": "blog", "language": "en", "content": "<article>...</article>"},
		{"channel": "twitter", "language": "en", "content": "[\"1/2\", \"2/2\"]"},
		{"channel": "linkedin", "language": "en", "content": "LinkedIn post"},
		{"channel": "whatsapp", "language": "en", "content": "WhatsApp message"},
		{"channel": "article", "language": "hi", "content": "हिंदी लेख"},
	]
	mocker.patch("api.main.database.get_outputs", return_value=mock_rows)

	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		response = await client.get("/api/pipeline/test-run-id/outputs")

	assert response.status_code == 200
	data = response.json()
	assert "outputs" in data
	assert isinstance(data["outputs"], list)
	assert len(data["outputs"]) == 5


@pytest.mark.asyncio
async def test_audit_endpoint(mocker):
	mock_events = [
		{"agent_name": "intake_agent", "action": "planned"},
		{"agent_name": "draft_agent", "action": "generated"},
		{"agent_name": "compliance_agent", "action": "checked"},
	]
	mocker.patch("api.main.database.get_audit", return_value=mock_events)

	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		response = await client.get("/api/pipeline/test-run-id/audit")

	assert response.status_code == 200
	data = response.json()
	assert "events" in data
	assert isinstance(data["events"], list)
	assert len(data["events"]) == 3


@pytest.mark.asyncio
async def test_feedback_endpoint_saves(mocker):
	mock_save = mocker.patch("api.main.database.save_feedback", return_value=None)

	class MockQuery:
		def __init__(self):
			self.data = [{"brief_topic": "SIP investment"}]

		def select(self, *_args, **_kwargs):
			return self

		def eq(self, *_args, **_kwargs):
			return self

		def limit(self, *_args, **_kwargs):
			return self

		def execute(self):
			return SimpleNamespace(data=self.data)

	class MockClient:
		def table(self, _name: str):
			return MockQuery()

	mocker.patch("api.main.database.get_supabase_client", return_value=MockClient())

	payload = {"rating": 4, "comment": "Good", "channel": "blog"}

	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		response = await client.post("/api/pipeline/test-run-id/feedback", json=payload)

	assert response.status_code == 200
	assert response.json().get("status") == "saved"

	mock_save.assert_called_once_with(
		run_id="test-run-id",
		rating=4,
		comment="Good",
		brief_topic="SIP investment",
		channel="blog",
	)
