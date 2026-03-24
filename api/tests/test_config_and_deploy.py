from pathlib import Path

import pytest

from api import config


REQUIRED_ENV = {
    "GROQ_API_KEY_HEAVY": "test-groq-heavy",
    "GROQ_API_KEY_LIGHT": "test-groq-light",
    "GOOGLE_API_KEY": "test-google-key",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_ANON_KEY": "test-supabase-anon-key",
}


def _set_required_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)


def test_get_settings_success_with_required_values(monkeypatch: pytest.MonkeyPatch):
    _set_required_env(monkeypatch)

    settings = config.get_settings()

    assert settings.GROQ_API_KEY_HEAVY == REQUIRED_ENV["GROQ_API_KEY_HEAVY"]
    assert settings.GROQ_API_KEY_LIGHT == REQUIRED_ENV["GROQ_API_KEY_LIGHT"]
    assert settings.GOOGLE_API_KEY == REQUIRED_ENV["GOOGLE_API_KEY"]
    assert settings.SUPABASE_URL == REQUIRED_ENV["SUPABASE_URL"]
    assert settings.SUPABASE_ANON_KEY == REQUIRED_ENV["SUPABASE_ANON_KEY"]


def test_get_settings_raises_when_required_missing(monkeypatch: pytest.MonkeyPatch):
    _set_required_env(monkeypatch)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(ValueError, match="Missing required environment variables"):
        config.get_settings()


def test_get_settings_raises_when_required_blank(monkeypatch: pytest.MonkeyPatch):
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GOOGLE_API_KEY", "   ")

    with pytest.raises(ValueError, match="Invalid environment variable values"):
        config.get_settings()


def test_root_render_blueprint_pins_python_311():
    root_render_yaml = Path(__file__).resolve().parents[2] / "render.yaml"
    assert root_render_yaml.exists(), "render.yaml must exist at repository root"

    content = root_render_yaml.read_text(encoding="utf-8")
    assert "rootDir: api" in content
    assert "key: PYTHON_VERSION" in content
    assert "value: 3.11.11" in content
