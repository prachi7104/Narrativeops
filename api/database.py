"""Database helpers for NarrativeOps Supabase persistence."""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone

from supabase import Client, create_client

logger = logging.getLogger(__name__)

UTC = getattr(datetime, "UTC", timezone.utc)  # noqa: UP017

_client: Client | None = None
_client_lock = threading.Lock()


def get_supabase_client() -> Client | None:
    """Create Supabase client lazily and reuse it across calls (thread-safe)."""
    global _client
    if _client is not None:
        return _client

    with _client_lock:
        if _client is not None:
            return _client

        try:
            supabase_url = os.getenv("SUPABASE_URL", "").strip()
            supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()

            if not supabase_url or not supabase_anon_key:
                logger.error("SUPABASE_URL or SUPABASE_ANON_KEY is missing")
                return None

            _client = create_client(supabase_url, supabase_anon_key)
            return _client
        except Exception as exc:
            logger.exception("Failed to initialize Supabase client: %s", exc)
            return None


def create_run(run_id: str, brief: dict) -> None:
    """Insert a new run row into pipeline_runs."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        payload = {
            "id": run_id,
            "brief_topic": brief.get("topic", "Untitled"),
            "brief_json": brief,
        }
        client.table("pipeline_runs").insert(payload).execute()
    except Exception as exc:
        logger.exception("Failed to create run %s: %s", run_id, exc)
    return None


def update_run_status(run_id: str, status: str) -> None:
    """Update status in pipeline_runs for the given run_id."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        client.table("pipeline_runs").update({"status": status}).eq("id", run_id).execute()
    except Exception as exc:
        logger.exception("Failed to update run status for %s: %s", run_id, exc)
    return None


def write_pipeline_outputs(run_id: str, outputs: dict, localized_hi: str) -> None:
    """Insert channel outputs for EN channels and Hindi article into pipeline_outputs."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        rows: list[dict] = []

        blog_html = str(outputs.get("blog_html", "") or "").strip()
        if blog_html:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "blog",
                    "language": "en",
                    "content": blog_html,
                }
            )

        faq_html = str(outputs.get("faq_html", "") or "").strip()
        if faq_html:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "faq",
                    "language": "en",
                    "content": faq_html,
                }
            )

        publisher_brief = str(outputs.get("publisher_brief", "") or "").strip()
        if publisher_brief:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "publisher_brief",
                    "language": "en",
                    "content": publisher_brief,
                }
            )

        op_ed_html = str(outputs.get("op_ed_html", "") or "").strip()
        if op_ed_html:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "op_ed",
                    "language": "en",
                    "content": op_ed_html,
                }
            )

        explainer_box_html = str(outputs.get("explainer_box_html", "") or "").strip()
        if explainer_box_html:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "explainer_box",
                    "language": "en",
                    "content": explainer_box_html,
                }
            )

        twitter_thread = outputs.get("twitter_thread", [])
        if isinstance(twitter_thread, list) and len(twitter_thread) > 0:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "twitter",
                    "language": "en",
                    "content": json.dumps(twitter_thread),
                }
            )

        linkedin_post = str(outputs.get("linkedin_post", "") or "").strip()
        if linkedin_post:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "linkedin",
                    "language": "en",
                    "content": linkedin_post,
                }
            )

        whatsapp_message = str(outputs.get("whatsapp_message", "") or "").strip()
        if whatsapp_message:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "whatsapp",
                    "language": "en",
                    "content": whatsapp_message,
                }
            )

        localized_content = str(localized_hi or "").strip()
        if localized_content:
            rows.append(
                {
                    "run_id": run_id,
                    "channel": "article",
                    "language": "hi",
                    "content": localized_content,
                }
            )

        if rows:
            client.table("pipeline_outputs").insert(rows).execute()
    except Exception as exc:
        logger.exception("Failed to write pipeline outputs for %s: %s", run_id, exc)
    return None


def write_audit_log(run_id: str, audit_log: list[dict]) -> None:
    """Insert one row per audit entry into agent_events."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        rows = []
        for entry in audit_log:
            rows.append(
                {
                    "run_id": run_id,
                    "agent_name": entry.get("agent"),
                    "action": entry.get("action"),
                    "verdict": entry.get("verdict"),
                    "model_used": entry.get("model"),
                    "duration_ms": entry.get("duration_ms"),
                    "output_summary": entry.get("output_summary"),
                }
            )

        if rows:
            client.table("agent_events").insert(rows).execute()
    except Exception as exc:
        logger.exception("Failed to write audit log for %s: %s", run_id, exc)
    return None


def get_outputs(run_id: str) -> list[dict]:
    """Get all channel outputs for a run."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        response = client.table("pipeline_outputs").select("*").eq("run_id", run_id).execute()
        return list(response.data or [])
    except Exception as exc:
        logger.exception("Failed to get outputs for %s: %s", run_id, exc)
        return []


def patch_output(run_id: str, channel: str, language: str, content: str) -> None:
    """Update one pipeline output content by run/channel/language."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        (
            client.table("pipeline_outputs")
            .update({"content": content})
            .eq("run_id", run_id)
            .eq("channel", channel)
            .eq("language", language)
            .execute()
        )
    except Exception as exc:
        logger.exception(
            "Failed to patch output for run_id=%s channel=%s language=%s: %s",
            run_id,
            channel,
            language,
            exc,
        )
    return None


def get_audit(run_id: str) -> list[dict]:
    """Get audit events for a run ordered by creation time."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        response = (
            client.table("agent_events")
            .select("*")
            .eq("run_id", run_id)
            .order("created_at", desc=False)
            .execute()
        )
        return list(response.data or [])
    except Exception as exc:
        logger.exception("Failed to get audit for %s: %s", run_id, exc)
        return []


def approve_run(run_id: str) -> None:
    """Mark run completed and mark all related outputs approved."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        client.table("pipeline_runs").update({"status": "completed"}).eq("id", run_id).execute()
    except Exception as exc:
        logger.exception("Failed to mark run completed for %s: %s", run_id, exc)

    try:
        client.table("pipeline_outputs").update({"approved": True}).eq("run_id", run_id).execute()
    except Exception as exc:
        logger.exception("Failed to approve outputs for %s: %s", run_id, exc)
    return None


def save_feedback(
    run_id: str,
    rating: int,
    comment: str,
    brief_topic: str,
    channel: str,
) -> None:
    """Insert feedback row into content_feedback."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        payload = {
            "run_id": run_id,
            "rating": rating,
            "comment": comment,
            "brief_topic": brief_topic,
            "channel": channel,
        }
        client.table("content_feedback").insert(payload).execute()
    except Exception as exc:
        logger.exception("Failed to save feedback for %s: %s", run_id, exc)
    return None


def get_past_feedback(topic: str, limit: int = 3) -> list[str]:
    """Get recent feedback matching the first word of topic."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        first_word = (topic or "").strip().split()[0] if (topic or "").strip() else ""
        if not first_word:
            return []

        response = (
            client.table("content_feedback")
            .select("rating,comment")
            .ilike("brief_topic", f"%{first_word}%")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = response.data or []

        formatted_feedback = []
        for row in rows:
            rating = row.get("rating", "?")
            comment = row.get("comment") or ""
            formatted_feedback.append(f"Rating {rating}/5: {comment}")
        return formatted_feedback
    except Exception as exc:
        logger.exception("Failed to fetch past feedback for topic '%s': %s", topic, exc)
        return []


def get_enabled_rules() -> list[dict]:
    """Return all enabled compliance rules."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        response = client.table("compliance_rules").select("*").eq("enabled", True).execute()
        return list(response.data or [])
    except Exception as exc:
        logger.exception("Failed to fetch enabled compliance rules: %s", exc)
        return []


def get_org_rules(session_id: str) -> list[dict]:
    """Get enabled organization rules for a session, with errors first."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        response = (
            client.table("org_rules")
            .select("*")
            .eq("session_id", session_id)
            .eq("enabled", True)
            .order("severity", desc=False)
            .execute()
        )
        return list(response.data or [])
    except Exception as exc:
        logger.exception("Failed to get org rules for session_id=%s: %s", session_id, exc)
        return []


def save_org_rules(session_id: str, rules: list[dict]) -> None:
    """Bulk insert organization rules for a session."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        rows = []
        for rule in rules:
            rows.append(
                {
                    "session_id": session_id,
                    "rule_id": rule.get("rule_id", ""),
                    "rule_text": rule.get("rule_text", ""),
                    "category": rule.get("category", ""),
                    "severity": rule.get("severity", "warning"),
                    "source": rule.get("source", "default"),
                }
            )

        if rows:
            client.table("org_rules").insert(rows).execute()
    except Exception as exc:
        logger.exception("Failed to save org rules for session_id=%s: %s", session_id, exc)
    return None


def get_trend_cache(topic_hash: str) -> dict | None:
    """Return cached trend context for a topic when it is fresh (within 6 hours)."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        cutoff = (datetime.now(UTC) - timedelta(hours=6)).isoformat()
        response = (
            client.table("trend_cache")
            .select("*")
            .eq("topic_hash", topic_hash)
            .gt("cached_at", cutoff)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.exception("Failed to get trend cache for topic_hash=%s: %s", topic_hash, exc)
        return None


def upsert_trend_cache(topic_hash: str, topic_text: str, snippets: list, sources: list) -> None:
    """Upsert trend cache payload by topic hash."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        payload = {
            "topic_hash": topic_hash,
            "topic_text": topic_text,
            "snippets": snippets,
            "sources": sources,
            "cached_at": datetime.now(UTC).isoformat(),
        }
        client.table("trend_cache").upsert(payload, on_conflict="topic_hash").execute()
    except Exception as exc:
        logger.exception("Failed to upsert trend cache for topic_hash=%s: %s", topic_hash, exc)
    return None


def save_editorial_correction(
    run_id: str,
    channel: str,
    original_text: str,
    corrected_text: str,
    content_category: str,
    diff_summary: str,
) -> None:
    """Insert one editorial correction row."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        payload = {
            "run_id": run_id,
            "channel": channel,
            "original_text": original_text,
            "corrected_text": corrected_text,
            "content_category": content_category,
            "diff_summary": diff_summary,
        }
        client.table("editorial_corrections").insert(payload).execute()
    except Exception as exc:
        logger.exception("Failed to save editorial correction for run_id=%s: %s", run_id, exc)
    return None


def get_recent_corrections(content_category: str, limit: int = 3) -> list[dict]:
    """Get recent editorial corrections for a content category."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        response = (
            client.table("editorial_corrections")
            .select("original_text,corrected_text,diff_summary")
            .eq("content_category", content_category)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])
    except Exception as exc:
        logger.exception(
            "Failed to get recent corrections for content_category=%s: %s",
            content_category,
            exc,
        )
        return []


def save_pipeline_metrics(run_id: str, metrics: dict) -> None:
    """Upsert run-level pipeline metrics by run_id."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        payload = {"run_id": run_id, **metrics}
        client.table("pipeline_metrics").upsert(payload, on_conflict="run_id").execute()
    except Exception as exc:
        logger.exception("Failed to save pipeline metrics for run_id=%s: %s", run_id, exc)
    return None


def get_pipeline_metrics(run_id: str) -> dict | None:
    """Fetch pipeline metrics row for a run."""
    client = get_supabase_client()
    if client is None:
        return None

    try:
        response = client.table("pipeline_metrics").select("*").eq("run_id", run_id).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.exception("Failed to get pipeline metrics for run_id=%s: %s", run_id, exc)
        return None


def _status_to_compliance(status: str) -> str:
    """Derive compliance verdict from pipeline run status."""
    return {
        "completed": "PASS",
        "awaiting_approval": "PASS",
        "escalated": "REJECT",
        "failed": "ERROR",
    }.get(status, "PENDING")


def list_pipeline_runs(limit: int = 20, status: str | None = None) -> list[dict]:
    """Return recent pipeline runs, optionally filtered by status, with attached metrics."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        safe_limit = max(1, min(limit, 100))
        query = (
            client.table("pipeline_runs")
            .select("id,brief_topic,status,created_at,compliance_iterations,brief_json")
            .order("created_at", desc=True)
            .limit(safe_limit)
        )

        if status and status != "all":
            query = query.eq("status", status)

        runs_response = query.execute()
        runs = list(runs_response.data or [])
        if not runs:
            return []

        run_ids = [str(run.get("id") or "") for run in runs if run.get("id")]
        metrics_by_run: dict[str, dict] = {}
        hindi_run_ids: set[str] = set()

        if run_ids:
            metrics_response = (
                client.table("pipeline_metrics")
                .select(
                    "run_id,total_duration_ms,compliance_iterations,estimated_hours_saved,estimated_cost_saved_inr,trend_sources_used"
                )
                .in_("run_id", run_ids)
                .execute()
            )
            for metric in metrics_response.data or []:
                run_id = str(metric.get("run_id") or "")
                if run_id:
                    metrics_by_run[run_id] = metric

            # C3: Bulk query for Hindi outputs
            hindi_response = (
                client.table("pipeline_outputs")
                .select("run_id")
                .in_("run_id", run_ids)
                .eq("language", "hi")
                .execute()
            )
            hindi_run_ids = {
                str(row.get("run_id") or "") for row in (hindi_response.data or [])
            }

        result: list[dict] = []
        for run in runs:
            run_id = str(run.get("id") or "")
            run_status = str(run.get("status") or "")

            # C1: Extract output_options from brief_json
            brief_json = run.get("brief_json") or {}
            if isinstance(brief_json, str):
                try:
                    brief_json = json.loads(brief_json)
                except (json.JSONDecodeError, ValueError):
                    brief_json = {}
            output_options = brief_json.get("output_options") or [
                "blog",
                "twitter",
                "linkedin",
                "whatsapp",
            ]

            merged = {
                **run,
                **metrics_by_run.get(run_id, {}),
                "output_options": output_options,
                "compliance_verdict": _status_to_compliance(run_status),
                "has_hindi": run_id in hindi_run_ids,
            }
            # Remove brief_json from response (it can be large)
            merged.pop("brief_json", None)
            result.append(merged)

        return result
    except Exception as exc:
        logger.exception("Failed to list pipeline runs: %s", exc)
        return []


def get_default_org_rules() -> list[dict]:
    """Return enabled default organization rules for settings visibility."""
    client = get_supabase_client()
    if client is None:
        return []

    try:
        response = (
            client.table("org_rules")
            .select("rule_id,rule_text,category,severity,source")
            .eq("session_id", "default")
            .eq("enabled", True)
            .order("rule_id")
            .execute()
        )
        return list(response.data or [])
    except Exception as exc:
        logger.exception("Failed to get default org rules: %s", exc)
        return []


def get_corrections_summary() -> dict:
    """Aggregate editorial correction counts by content category."""
    client = get_supabase_client()
    if client is None:
        return {"summary": [], "total": 0}

    try:
        response = client.table("editorial_corrections").select("content_category").execute()
        rows = response.data or []

        counts: dict[str, int] = {}
        for row in rows:
            category = str(row.get("content_category") or "general")
            counts[category] = counts.get(category, 0) + 1

        summary = [{"category": key, "count": value} for key, value in sorted(counts.items())]
        return {"summary": summary, "total": sum(counts.values())}
    except Exception as exc:
        logger.exception("Failed to get corrections summary: %s", exc)
        return {"summary": [], "total": 0}


def get_style_memory(limit: int = 20) -> dict:
    """Return recent correction summaries grouped by category for style memory UI."""
    client = get_supabase_client()
    if client is None:
        return {"by_category": {}, "total": 0, "categories": []}

    try:
        safe_limit = max(1, min(limit, 100))
        response = (
            client.table("editorial_corrections")
            .select("content_category,diff_summary,channel,created_at")
            .order("created_at", desc=True)
            .limit(safe_limit)
            .execute()
        )
        rows = response.data or []

        by_category: dict[str, list[str]] = {}
        for row in rows:
            category = str(row.get("content_category") or "general")
            diff_summary = str(row.get("diff_summary") or "").strip()
            if not diff_summary:
                continue
            if category not in by_category:
                by_category[category] = []
            by_category[category].append(diff_summary)

        categories = sorted(by_category.keys())
        return {"by_category": by_category, "total": len(rows), "categories": categories}
    except Exception as exc:
        logger.exception("Failed to get style memory: %s", exc)
        return {"by_category": {}, "total": 0, "categories": []}
