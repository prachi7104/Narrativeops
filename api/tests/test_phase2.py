import io
import json

import pytest
from httpx import ASGITransport, AsyncClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from api.agents.compliance_agent import run_compliance_agent
from api.agents.rule_extractor_agent import extract_rules_from_pdf
from api.main import app


def _make_pdf_bytes(lines: list[str]) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)

    y = 750
    for line in lines:
        pdf.drawString(72, y, line)
        y -= 18
        if y < 72:
            pdf.showPage()
            y = 750

    pdf.save()
    return buffer.getvalue()


def _minimal_content_state(session_id: str, draft: str) -> dict:
    return {
        "run_id": "phase2-run-001",
        "session_id": session_id,
        "brief": {"topic": "Compliance test"},
        "engagement_data": None,
        "strategy": {},
        "past_feedback": [],
        "draft": draft,
        "draft_version": 1,
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
        "pipeline_status": "pending",
        "audit_log": [],
    }


def _valid_compliance_json(verdict: str = "PASS", annotations: list | None = None) -> str:
    payload = {
        "verdict": verdict,
        "annotations": annotations or [],
        "summary": "ok",
    }
    return json.dumps(payload)


# TEST GROUP 1: Rule extractor (mock PDF and LLM)

def test_extract_rules_returns_empty_on_blank_pdf():
    # Minimal valid PDF bytes with no extractable text.
    minimal_pdf_bytes = _make_pdf_bytes([])

    result = extract_rules_from_pdf(minimal_pdf_bytes, "test-session")

    assert result["count"] == 0
    assert result["error"] is not None
    assert result["rules"] == []


def test_extract_rules_parses_llm_response_correctly(mocker):
    mocker.patch(
        "api.agents.rule_extractor_agent.call_llm",
        return_value=json.dumps(
            [
                {
                    "rule_id": "ORG01",
                    "rule_text": "Test rule 1",
                    "category": "banned_phrase",
                    "severity": "error",
                },
                {
                    "rule_id": "ORG02",
                    "rule_text": "Test rule 2",
                    "category": "tone",
                    "severity": "warning",
                },
                {
                    "rule_id": "ORG03",
                    "rule_text": "Test rule 3",
                    "category": "required_disclaimer",
                    "severity": "error",
                },
            ]
        ),
    )
    mocker.patch("api.agents.rule_extractor_agent.save_org_rules", return_value=None)

    pdf_bytes = _make_pdf_bytes(
        [
            "Brand compliance handbook",
            "Do not use guaranteed returns.",
            "Must include disclaimer text in every investment article.",
            "Avoid sensational language and all caps.",
            "Forward-looking claims must be qualified.",
            "Use precise risk language.",
            "Keep tone factual and balanced.",
            "Never imply zero risk.",
            "Cite data sources for claim percentages.",
            "This line extends content to exceed minimum extraction threshold.",
        ]
    )

    result = extract_rules_from_pdf(pdf_bytes, "test-session-002")

    assert result["count"] == 3
    assert len(result["preview"]) <= 5
    assert result["error"] is None


def test_extract_rules_handles_malformed_llm_response(mocker):
    mocker.patch("api.agents.rule_extractor_agent.call_llm", return_value="This is not valid JSON")
    mocker.patch("api.agents.rule_extractor_agent.save_org_rules", return_value=None)

    pdf_bytes = _make_pdf_bytes(
        [
            "Compliance guide",
            "Do not promise guaranteed returns.",
            "Add required disclaimer language.",
            "Additional text to cross extraction threshold with confidence.",
            "This is another long sentence to ensure extraction length is sufficient.",
        ]
    )

    result = extract_rules_from_pdf(pdf_bytes, "test-session-003")

    assert result["count"] == 0
    assert result["error"] is not None


def test_extract_rules_filters_invalid_rule_objects(mocker):
    mocker.patch(
        "api.agents.rule_extractor_agent.call_llm",
        return_value=json.dumps(
            [
                {
                    "rule_id": "ORG01",
                    "rule_text": "Valid rule 1",
                    "category": "banned_phrase",
                    "severity": "error",
                },
                {
                    "rule_id": "ORG02",
                    "rule_text": "Valid rule 2",
                    "category": "tone",
                    "severity": "warning",
                },
                {
                    "rule_id": "ORG03",
                    "rule_text": "Valid rule 3",
                    "category": "required_disclaimer",
                    "severity": "error",
                },
                {
                    "rule_id": "ORG04",
                    "rule_text": "Missing category",
                    "severity": "error",
                },
                {
                    "rule_id": "ORG05",
                    "category": "tone",
                    "severity": "warning",
                },
            ]
        ),
    )
    mocker.patch("api.agents.rule_extractor_agent.save_org_rules", return_value=None)

    pdf_bytes = _make_pdf_bytes(
        [
            "Brand guide content for parser",
            "Rules and disclaimers",
            "This line ensures extractable body text exceeds threshold length significantly.",
            "Another line with enough content for extraction and test stability.",
        ]
    )

    result = extract_rules_from_pdf(pdf_bytes, "test-session-004")

    assert result["count"] == 3


# TEST GROUP 2: Dynamic compliance agent

def test_compliance_uses_org_rules_when_session_id_provided(mocker):
    org_rules = [
        {
            "rule_id": "ORG01",
            "rule_text": "Do not use guaranteed returns",
            "category": "banned_phrase",
            "severity": "error",
            "source": "brand_guide",
        },
        {
            "rule_id": "ORG02",
            "rule_text": "Avoid claiming zero risk",
            "category": "factual_claim",
            "severity": "error",
            "source": "brand_guide",
        },
        {
            "rule_id": "ORG03",
            "rule_text": "Use clear tone",
            "category": "tone",
            "severity": "warning",
            "source": "brand_guide",
        },
    ]
    default_rules = [
        {
            "rule_id": f"SEBI0{i}",
            "rule_text": f"Default rule {i}",
            "category": "factual_claim",
            "severity": "error",
            "source": "sebi",
        }
        for i in range(1, 9)
    ]

    def _mock_get_org_rules(session_id: str):
        if session_id == "test-session":
            return org_rules
        if session_id == "default":
            return default_rules
        return []

    mocker.patch("api.agents.compliance_agent.get_org_rules", side_effect=_mock_get_org_rules)
    mocker.patch(
        "api.agents.compliance_agent.call_llm",
        return_value=_valid_compliance_json(verdict="PASS", annotations=[]),
    )

    state = _minimal_content_state("test-session", "##INTRO\nSample draft text.")
    result = run_compliance_agent(state)

    assert result["org_rules_count"] == 11
    assert result["rules_source"] == "org_rules"


def test_compliance_falls_back_to_default_when_no_session_rules(mocker):
    default_rules = [
        {
            "rule_id": f"SEBI0{i}",
            "rule_text": f"Default rule {i}",
            "category": "factual_claim",
            "severity": "error",
            "source": "sebi",
        }
        for i in range(1, 9)
    ]

    def _mock_get_org_rules(session_id: str):
        if session_id == "test-empty-session":
            return []
        if session_id == "default":
            return default_rules
        return []

    mocker.patch("api.agents.compliance_agent.get_org_rules", side_effect=_mock_get_org_rules)
    mocker.patch(
        "api.agents.compliance_agent.call_llm",
        return_value=_valid_compliance_json(verdict="PASS", annotations=[]),
    )

    state = _minimal_content_state("test-empty-session", "##INTRO\nSample draft text.")
    result = run_compliance_agent(state)

    assert result["org_rules_count"] == 8
    assert result["rules_source"] == "default"


def test_compliance_uses_json_fallback_when_supabase_fails(mocker):
    mocker.patch("api.agents.compliance_agent.get_org_rules", side_effect=Exception("DB down"))
    mocker.patch(
        "api.agents.compliance_agent.call_llm",
        return_value=_valid_compliance_json(verdict="REVISE", annotations=[]),
    )

    state = _minimal_content_state("test-session", "##INTRO\nSample draft text.")
    result = run_compliance_agent(state)

    assert result["compliance_verdict"] in ("PASS", "REVISE", "REJECT")


def test_compliance_rule_format_includes_source_prefix(mocker):
    captured = {"user": ""}

    def _mock_call_llm(**kwargs):
        captured["user"] = kwargs.get("user", "")
        return _valid_compliance_json(verdict="PASS", annotations=[])

    def _mock_get_org_rules(session_id: str):
        if session_id == "test-session":
            return [
                {
                    "rule_id": "ORG01",
                    "rule_text": "Do not use casual language",
                    "category": "banned_phrase",
                    "severity": "error",
                    "source": "brand_guide",
                }
            ]
        if session_id == "default":
            return []
        return []

    mocker.patch("api.agents.compliance_agent.get_org_rules", side_effect=_mock_get_org_rules)
    mocker.patch("api.agents.compliance_agent.call_llm", side_effect=_mock_call_llm)

    state = _minimal_content_state("test-session", "##INTRO\nSample draft text.")
    run_compliance_agent(state)

    assert "[BRAND_GUIDE]" in captured["user"]


# TEST GROUP 3: Upload endpoint (API test)

@pytest.mark.asyncio
async def test_upload_guide_returns_rules_extracted(mocker):
    pdf_bytes = _make_pdf_bytes(
        [
            "Compliance guide",
            "Do not promise guaranteed returns.",
            "Must include disclaimer text.",
            "Avoid saying risk free investment.",
        ]
    )

    mocker.patch(
        "api.main.extract_rules_from_pdf",
        return_value={
            "rules": [{"rule_id": "ORG01"}],
            "count": 1,
            "preview": [{"rule_id": "ORG01"}],
            "error": None,
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/upload-guide",
            files={"file": ("guide.pdf", pdf_bytes, "application/pdf")},
            data={"session_id": "upload-session-1"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("rules_extracted"), int)
    assert payload["rules_extracted"] >= 0
    assert payload["session_id"] == "upload-session-1"


@pytest.mark.asyncio
async def test_upload_guide_rejects_non_pdf():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/upload-guide",
            files={"file": ("guide.txt", b"not pdf", "text/plain")},
            data={"session_id": "upload-session-2"},
        )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_guide_returns_preview(mocker):
    pdf_bytes = _make_pdf_bytes(
        [
            "Guide line 1",
            "Guide line 2",
            "Guide line 3",
            "Guide line 4",
            "Guide line 5",
        ]
    )

    mocker.patch(
        "api.main.extract_rules_from_pdf",
        return_value={
            "rules": [
                {"rule_id": "ORG01"},
                {"rule_id": "ORG02"},
                {"rule_id": "ORG03"},
            ],
            "count": 3,
            "preview": [
                {"rule_id": "ORG01"},
                {"rule_id": "ORG02"},
                {"rule_id": "ORG03"},
            ],
            "error": None,
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/upload-guide",
            files={"file": ("guide.pdf", pdf_bytes, "application/pdf")},
            data={"session_id": "upload-session-3"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("preview"), list)
    assert len(payload["preview"]) <= 5


# TEST GROUP 4: End-to-end (integration) — THE CRITICAL DEMO TEST

@pytest.mark.integration
def test_end_to_end_pdf_to_compliance_cites_brand_guide(mocker):
    # In-memory rule store to emulate DB persistence for this integration flow.
    in_memory_rules: dict[str, list[dict]] = {}

    def _mock_save_org_rules(session_id: str, rules: list[dict]):
        in_memory_rules[session_id] = list(rules)

    def _mock_get_org_rules(session_id: str):
        return list(in_memory_rules.get(session_id, []))

    def _mock_rule_extractor_llm(**kwargs):
        user_prompt = kwargs.get("user", "")
        if "Extract compliance rules" in user_prompt:
            return json.dumps(
                [
                    {
                        "rule_id": "ORG01",
                        "rule_text": "Do not use the phrase guaranteed returns in any context.",
                        "category": "banned_phrase",
                        "severity": "error",
                    },
                    {
                        "rule_id": "ORG02",
                        "rule_text": "All fintech content must include the IRDAI disclaimer.",
                        "category": "required_disclaimer",
                        "severity": "error",
                    },
                    {
                        "rule_id": "ORG03",
                        "rule_text": "Avoid using the word safe without qualification.",
                        "category": "banned_phrase",
                        "severity": "warning",
                    },
                ]
            )

        return _valid_compliance_json(
            verdict="REVISE",
            annotations=[
                {
                    "section": "INTRO",
                    "sentence": "Get guaranteed returns on your investment.",
                    "rule_id": "ORG01",
                    "severity": "error",
                    "message": "Uses banned phrase",
                    "suggested_fix": "Remove guaranteed language and qualify risk.",
                },
                {
                    "section": "BODY",
                    "sentence": "This is completely safe.",
                    "rule_id": "ORG03",
                    "severity": "warning",
                    "message": "Uses unqualified safety claim",
                    "suggested_fix": "Add qualification and risk disclaimer.",
                },
            ],
        )

    mocker.patch("api.agents.rule_extractor_agent.save_org_rules", side_effect=_mock_save_org_rules)
    mocker.patch("api.agents.rule_extractor_agent.call_llm", side_effect=_mock_rule_extractor_llm)
    mocker.patch("api.agents.compliance_agent.get_org_rules", side_effect=_mock_get_org_rules)
    mocker.patch("api.agents.compliance_agent.call_llm", side_effect=_mock_rule_extractor_llm)

    # Step 1: Realistic mock PDF with embedded compliance rules.
    pdf_bytes = _make_pdf_bytes(
        [
            "Brand Compliance Policy",
            "Do not use the phrase 'guaranteed returns' in any context.",
            "All fintech content must include the IRDAI disclaimer.",
            "Avoid using the word 'safe' without qualification.",
            "Additional policy context for extraction stability and adequate length.",
            "Any claim should be backed with source and caveat language.",
            "This sentence ensures extraction text length remains above threshold.",
        ]
    )

    # Step 2: Extract and persist rules.
    extracted = extract_rules_from_pdf(pdf_bytes, "integration-test-session")
    assert extracted["count"] >= 2

    # Step 3: Run compliance with session-scoped rules.
    state = _minimal_content_state(
        "integration-test-session",
        "##INTRO\nGet guaranteed returns on your investment.\n"
        "##BODY\nThis is completely safe.\n"
        "##CONCLUSION\nStart today.",
    )
    result = run_compliance_agent(state)

    # Step 4: Verdict expectation.
    assert result["compliance_verdict"] in ("REVISE", "REJECT")

    # Step 5: Ensure brand-guide rules were cited.
    annotations = result.get("compliance_feedback", [])
    assert any(str(item.get("rule_id", "")).startswith("ORG") for item in annotations)

    # Step 6: Print verification output.
    print("Annotations:", annotations)
    print("DEMO TEST PASSED: Brand guide rules were cited in compliance output")
