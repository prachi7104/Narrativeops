import os
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.graph.state import ContentState  # noqa: E402

REQUIRED_INTEGRATION_ENV_VARS = [
    "GROQ_API_KEY_HEAVY",
    "GROQ_API_KEY_LIGHT",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "GOOGLE_API_KEY",
]


def pytest_collection_modifyitems(items):
    """Ensure integration tests always run env var checks first."""
    for item in items:
        if item.get_closest_marker("integration"):
            item.add_marker(pytest.mark.usefixtures("check_env_vars"))


def pytest_configure() -> None:
    """Patch compatibility shims needed by third-party libraries during tests."""
    try:
        import langchain  # type: ignore

        # langchain_core still reads this legacy attribute in some versions.
        if not hasattr(langchain, "debug"):
            langchain.debug = False
    except Exception:
        # Never fail test startup for optional compatibility shims.
        pass


@pytest.fixture(scope="session")
def check_env_vars():
    """Skip integration tests when required API credentials are not configured."""
    for env_var in REQUIRED_INTEGRATION_ENV_VARS:
        if not os.getenv(env_var):
            pytest.skip(f"Missing required env var for integration tests: set {env_var}")


@pytest.fixture
def minimal_content_state():
    """Build a minimal ContentState payload for agent tests."""

    def _build(draft: str) -> ContentState:
        return {
            "run_id": "test-run-123",
            "brief": {},
            "engagement_data": None,
            # Fields added in Phase 1 B1/B3 fix
            "session_id": "test-session",
            "content_category": "general",
            "output_format": "multi_platform_pack",
            "output_options": ["blog", "twitter", "linkedin", "whatsapp"],
            "strategy": {},
            "trend_context": "",
            "trend_sources": [],
            "trend_cache_hit": False,
            "past_feedback": [],
            "draft": draft,
            "draft_version": 1,
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
            "pipeline_status": "pending",
            "audit_log": [],
        }

    return _build
