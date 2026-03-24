#!/usr/bin/env python3
"""
Standalone connection test script. Run with: python api/test_connections.py

Tests all external connections (Groq heavy, Groq light, Google AI, Supabase)
and prints PASS/FAIL for each without raising exceptions.
"""

import os
import sys

import pytest

__test__ = False

_REQUIRED_CONNECTIVITY_ENV_VARS = [
    "GROQ_API_KEY_HEAVY",
    "GROQ_API_KEY_LIGHT",
    "GOOGLE_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
]

pytestmark = pytest.mark.skipif(
    any(not os.getenv(name) for name in _REQUIRED_CONNECTIVITY_ENV_VARS),
    reason="Skipping connectivity checks because required credentials are not configured.",
)


def test_groq_heavy(api_key: str) -> tuple[bool, str]:
    """Test Groq heavy account with llama-3.3-70b-versatile."""
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Say: Groq heavy OK"}],
            max_tokens=10,
        )
        message = response.choices[0].message.content.strip()[:50]
        return True, message
    except Exception as e:
        return False, str(e)


def test_groq_light(api_key: str) -> tuple[bool, str]:
    """Test Groq light account with llama-3.1-8b-instant."""
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": "Say: Groq light OK"}],
            max_tokens=10,
        )
        message = response.choices[0].message.content.strip()[:50]
        return True, message
    except Exception as e:
        return False, str(e)


def test_google_ai(api_key: str) -> tuple[bool, str]:
    """Test Google AI Studio with gemini-2.5-flash."""
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content("Say: Gemini OK")
        message = response.text.strip()[:50]
        return True, message
    except Exception as e:
        return False, str(e)


def test_supabase(url: str, key: str) -> tuple[bool, str]:
    """Test Supabase by querying the compliance_rules table."""
    try:
        from supabase import create_client

        client = create_client(url, key)
        response = client.table("compliance_rules").select("count").execute()
        row_count = len(response.data) if response.data else 0
        return True, f"{row_count} rows"
    except Exception as e:
        return False, str(e)


def main():
    """Run all connection tests."""
    print("=" * 60)
    print("Connection Tests")
    print("=" * 60)

    try:
        from config import settings
    except Exception as e:
        print(f"FAIL: Config - Failed to load .env and settings: {e}")
        print("Ensure .env file exists with all required keys.")
        return 1

    tests = [
        (
            "Groq Heavy (llama-3.3-70b)",
            lambda: test_groq_heavy(settings.GROQ_API_KEY_HEAVY),
        ),
        (
            "Groq Light (llama-3.1-8b)",
            lambda: test_groq_light(settings.GROQ_API_KEY_LIGHT),
        ),
        (
            "Google AI Studio (gemini-2.5-flash)",
            lambda: test_google_ai(settings.GOOGLE_API_KEY),
        ),
        (
            "Supabase (compliance_rules)",
            lambda: test_supabase(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY),
        ),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        print(f"\nCHECKING {name}...")
        success, message = test_func()
        if success:
            print(f"PASS: {name} - {message}")
            passed += 1
        else:
            print(f"FAIL: {name} - {message}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
