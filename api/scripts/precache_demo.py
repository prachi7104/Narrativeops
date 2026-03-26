"""
Pre-cache all three hackathon scenario packs before demo day.
Run this 2 hours before judging. Verifies pipeline works end-to-end and
caches trend data so demos run fast.

Usage:
    cd api && python scripts/precache_demo.py --base-url https://your-render-url.onrender.com
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
CACHE_PATH = ROOT_DIR / "api" / "scripts" / "demo_cache.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=150,
        help="Seconds to wait for each pipeline to complete",
    )
    return parser.parse_args()


SCENARIO_PACKS: list[dict[str, Any]] = [
    {
        "name": "Scenario 1: Product Launch Sprint",
        "brief": {
            "topic": "Lumina Large Cap Fund Launch",
            "description": (
                "Lumina Asset Management is launching its flagship large-cap equity fund: "
                "Lumina Large Cap Growth Fund. Fund objective: long-term capital appreciation "
                "through diversified investments in top 100 NSE-listed companies. "
                "NAV at launch: Rs10. Minimum SIP: Rs500/month. SEBI-registered fund. "
                "Target investors: retail investors aged 25-45, first-time mutual fund investors."
            ),
            "content_category": "mutual_fund",
            "output_options": ["blog", "faq", "twitter", "linkedin", "whatsapp"],
            "tone": "authoritative",
            "target_languages": ["en", "hi"],
        },
        "engagement_data": None,
        "expected": {
            "has_blog": True,
            "has_faq": True,
            "has_twitter": True,
            "has_hindi": True,
            "compliance_pass": True,
        },
    },
    {
        "name": "Scenario 2: Compliance Rejection",
        "brief": {
            "topic": "SafeWealth fixed return investment scheme",
            "description": (
                "SafeWealth Financial Services offers a revolutionary investment product: "
                "100% guaranteed 16% annual returns, completely risk-free investment. "
                "Your principal is assured, with money-back guarantee. "
                "Beat your bank FD with our sure-profit investment scheme. "
                "Join 50,000 investors who are already earning certain gains."
            ),
            "content_category": "fintech",
            "output_options": ["blog", "linkedin"],
            "tone": "accessible",
            "target_languages": ["en"],
        },
        "engagement_data": None,
        "expected": {
            "compliance_violations": True,
            "rules_triggered": ["SEBI01", "SEBI02", "ASCI01"],
            "requires_revision": True,
        },
    },
    {
        "name": "Scenario 3: Performance Pivot",
        "brief": {
            "topic": "SIP investing for millennials",
            "description": (
                "Educational content about systematic investment plans targeted at millennials. "
                "Explain how SIP works, compounding benefits, and how to start with Rs500/month."
            ),
            "content_category": "mutual_fund",
            "output_options": ["blog", "linkedin", "twitter", "whatsapp"],
            "tone": "accessible",
            "target_languages": ["en", "hi"],
        },
        "engagement_data": {
            "video": {"avg_views": 4200, "engagement_rate": 0.082},
            "text_article": {"avg_views": 980, "engagement_rate": 0.019},
            "short_form": {"avg_views": 2100, "engagement_rate": 0.055},
        },
        "expected": {
            "pivot_recommended": True,
            "content_calendar_generated": True,
            "performance_ratio_gt_2": True,
        },
    },
]


def _wait_via_stream(base_url: str, run_id: str, max_wait: int) -> dict[str, Any] | None:
    """Wait for terminal state using SSE stream events."""
    stream_url = f"{base_url}/api/pipeline/{run_id}/stream"
    deadline = time.time() + max_wait

    try:
        with requests.get(stream_url, stream=True, timeout=(10, max_wait)) as resp:
            if resp.status_code != 200:
                return None

            for raw in resp.iter_lines(decode_unicode=True):
                if time.time() > deadline:
                    return {"status": "timeout"}
                if not raw or not raw.startswith("data:"):
                    continue

                payload_text = raw[5:].strip()
                try:
                    payload = json.loads(payload_text)
                except json.JSONDecodeError:
                    continue

                event_type = str(payload.get("type") or "")
                if event_type == "human_required":
                    return {"status": "awaiting_approval", "event": payload}
                if event_type == "pipeline_complete":
                    return {"status": "completed", "event": payload}
                if event_type == "error":
                    message = str(payload.get("message") or "error")
                    lowered = message.lower()
                    if "escalat" in lowered:
                        return {"status": "escalated", "event": payload}
                    return {"status": "failed", "event": payload}
    except Exception:
        return None

    return None


def _wait_via_status(base_url: str, run_id: str, max_wait: int) -> dict[str, Any]:
    """Fallback polling of status endpoint until terminal state."""
    start = time.time()
    while time.time() - start < max_wait:
        time.sleep(5)
        print(".", end="", flush=True)
        try:
            resp = requests.get(f"{base_url}/api/pipeline/{run_id}/status", timeout=10)
            if resp.status_code == 200:
                payload = resp.json()
                status = str(payload.get("status") or "").strip().lower()
                if status in ("completed", "awaiting_approval", "escalated", "failed"):
                    return payload
        except Exception:
            pass

    return {"status": "timeout"}


def wait_for_pipeline(base_url: str, run_id: str, max_wait: int = 150) -> dict[str, Any]:
    """Wait for completion using SSE first, with status polling fallback."""
    print(f"  Waiting for run {run_id}...", end="", flush=True)
    stream_result = _wait_via_stream(base_url, run_id, max_wait)
    if stream_result and stream_result.get("status") != "timeout":
        print(f" {stream_result.get('status')}")
        return stream_result

    status_result = _wait_via_status(base_url, run_id, max_wait)
    status = str(status_result.get("status") or "timeout")
    if status == "timeout":
        print(" TIMEOUT")
    else:
        print(f" {status}")
    return status_result


def _extract_output_by_channel(outputs: list[dict[str, Any]], channel: str) -> dict[str, Any] | None:
    return next((item for item in outputs if str(item.get("channel")) == channel), None)


def verify_scenario_outputs(base_url: str, run_id: str, expected: dict[str, Any]) -> list[str]:
    """Verify scenario produced expected outputs. Returns list of failures."""
    failures: list[str] = []

    try:
        outputs_resp = requests.get(f"{base_url}/api/pipeline/{run_id}/outputs", timeout=10)
        outputs_resp.raise_for_status()
        outputs = outputs_resp.json().get("outputs", [])

        if expected.get("has_blog"):
            blog = _extract_output_by_channel(outputs, "blog")
            if not blog or not blog.get("content"):
                failures.append("Missing or empty blog output")

        if expected.get("has_faq"):
            faq = _extract_output_by_channel(outputs, "faq")
            if not faq or not faq.get("content"):
                failures.append("Missing or empty FAQ output")

        if expected.get("has_twitter"):
            twitter = _extract_output_by_channel(outputs, "twitter")
            if not twitter or not twitter.get("content"):
                failures.append("Missing or empty Twitter output")

        if expected.get("has_hindi"):
            hindi = next((item for item in outputs if str(item.get("language")) == "hi"), None)
            if not hindi or not hindi.get("content"):
                failures.append("Missing Hindi language output")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"Output verification failed: {exc}")

    if expected.get("pivot_recommended") or expected.get("content_calendar_generated"):
        try:
            strategy_resp = requests.get(f"{base_url}/api/pipeline/{run_id}/strategy", timeout=10)
            if strategy_resp.status_code == 200:
                strategy = strategy_resp.json()
                if expected.get("pivot_recommended") and not strategy.get("pivot_recommended"):
                    failures.append("Expected pivot_recommended=True, got False")
                if expected.get("content_calendar_generated") and not strategy.get("content_calendar"):
                    failures.append("Expected content_calendar, got None")
            else:
                failures.append(f"Strategy endpoint returned {strategy_resp.status_code}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"Strategy check failed: {exc}")

    return failures


def _save_cache(results: list[dict[str, Any]], all_passed: bool, base_url: str) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "cached_at": datetime.now(UTC).isoformat(),
        "base_url": base_url,
        "all_passed": all_passed,
        "scenarios": results,
        "run_ids": [entry.get("run_id") for entry in results if entry.get("run_id")],
    }
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved cache summary: {CACHE_PATH}")


def main() -> None:
    args = parse_args()
    base_url = args.base_url.rstrip("/")

    print(f"\n{'=' * 60}")
    print("NarrativeOps Demo Pre-Cache")
    print(f"Target: {base_url}")
    print(f"{'=' * 60}\n")

    # Health check
    try:
        health = requests.get(f"{base_url}/health", timeout=5)
        health.raise_for_status()
        if health.json().get("status") != "ok":
            print("Health check failed. Aborting.")
            sys.exit(1)
        print("API healthy\n")
    except Exception as exc:  # noqa: BLE001
        print(f"Cannot reach API: {exc}")
        sys.exit(1)

    all_passed = True
    results: list[dict[str, Any]] = []

    for index, scenario in enumerate(SCENARIO_PACKS, 1):
        print(f"\n[{index}/{len(SCENARIO_PACKS)}] {scenario['name']}")
        print("-" * 50)

        payload = {
            "brief": scenario["brief"],
            "engagement_data": scenario["engagement_data"],
        }

        try:
            start_resp = requests.post(f"{base_url}/api/pipeline/run", json=payload, timeout=15)
            if start_resp.status_code != 200:
                print(f"  Failed to start: {start_resp.status_code}")
                all_passed = False
                results.append(
                    {
                        "name": scenario["name"],
                        "run_id": None,
                        "status": "start_failed",
                        "failures": [f"HTTP {start_resp.status_code}"],
                    }
                )
                continue

            run_id = str(start_resp.json().get("run_id") or "")
            print(f"  Started: run_id={run_id}")
        except Exception as exc:  # noqa: BLE001
            print(f"  Exception starting pipeline: {exc}")
            all_passed = False
            results.append(
                {
                    "name": scenario["name"],
                    "run_id": None,
                    "status": "start_exception",
                    "failures": [str(exc)],
                }
            )
            continue

        final_status = wait_for_pipeline(base_url, run_id, args.wait_seconds)
        status = str(final_status.get("status") or "unknown")

        if status in ("failed", "timeout"):
            print(f"  Pipeline {status}")
            all_passed = False
            event = final_status.get("event") if isinstance(final_status, dict) else None
            event_message = ""
            if isinstance(event, dict):
                event_message = str(event.get("message") or "").strip()
            failure_reason = f"pipeline {status}"
            if event_message:
                failure_reason = f"{failure_reason}: {event_message}"
            results.append(
                {
                    "name": scenario["name"],
                    "run_id": run_id,
                    "status": status,
                    "failures": [failure_reason],
                }
            )
            continue

        print(f"  Status: {status}")

        failures = verify_scenario_outputs(base_url, run_id, scenario["expected"])
        if failures:
            print("  Verification failures:")
            for failure in failures:
                print(f"     - {failure}")
            all_passed = False
        else:
            print("  All expected outputs verified")

        results.append(
            {
                "name": scenario["name"],
                "run_id": run_id,
                "status": status,
                "failures": failures,
            }
        )

        print(f"  Demo run_id: {run_id}")
        time.sleep(10)

    _save_cache(results, all_passed, base_url)

    print(f"\n{'=' * 60}")
    if all_passed:
        print("ALL SCENARIOS PASSED - Ready for demo")
    else:
        print("SOME SCENARIOS FAILED - Do not demo until resolved")
    print(f"{'=' * 60}\n")

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
