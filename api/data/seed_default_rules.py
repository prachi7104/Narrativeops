"""Seed default SEBI and ASCI fallback rules into org_rules."""

from __future__ import annotations

import logging

from api.database import get_supabase_client, save_org_rules

logger = logging.getLogger(__name__)


def _default_rules_payload() -> list[dict]:
    return [
        {
            "rule_id": "SEBI01",
            "rule_text": "Do not use 'guaranteed returns', 'guaranteed profit', or 'assured returns'",
            "category": "banned_phrase",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI02",
            "rule_text": "Do not use 'risk-free investment', 'zero-risk', or 'no-risk'",
            "category": "banned_phrase",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI03",
            "rule_text": "Investment content must include: 'Investments are subject to market risk. Please read all scheme-related documents carefully before investing.'",
            "category": "required_disclaimer",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI04",
            "rule_text": "Any specific return percentage claim must be accompanied by a named data source and time period",
            "category": "factual_claim",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI05",
            "rule_text": "Forward-looking statements must include qualifiers: 'expected', 'projected', 'estimated', or 'subject to market conditions'",
            "category": "factual_claim",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI06",
            "rule_text": "Do not compare mutual fund returns with fixed deposit rates without specifying the comparison period",
            "category": "factual_claim",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI07",
            "rule_text": "Past performance must not be described as indicative of future results",
            "category": "factual_claim",
            "severity": "error",
            "source": "sebi",
        },
        {
            "rule_id": "SEBI08",
            "rule_text": "Do not use 'best', 'top', or 'number one' without a cited, verifiable ranking source",
            "category": "factual_claim",
            "severity": "warning",
            "source": "sebi",
        },
        {
            "rule_id": "ASCI01",
            "rule_text": "Do not use 'sure profit', 'certain gains', 'cannot lose money', or 'money-back guarantee'",
            "category": "banned_phrase",
            "severity": "error",
            "source": "asci",
        },
        {
            "rule_id": "ASCI02",
            "rule_text": "Testimonials about financial products must disclose if the person is compensated",
            "category": "required_disclaimer",
            "severity": "warning",
            "source": "asci",
        },
        {
            "rule_id": "ASCI03",
            "rule_text": "Do not use ALL CAPS or excessive punctuation (!!!) for emotional emphasis in financial content",
            "category": "tone",
            "severity": "warning",
            "source": "asci",
        },
        {
            "rule_id": "ASCI04",
            "rule_text": "Content must not be misleading through omission of material facts about risks",
            "category": "factual_claim",
            "severity": "error",
            "source": "asci",
        },
    ]


def seed_default_rules(force: bool = False) -> None:
    """Seed fallback organization rules for session_id='default'."""
    try:
        client = get_supabase_client()
        if client is None:
            logger.error("Could not seed default rules because Supabase client is unavailable")
            print("Could not seed default rules")
            return

        if force:
            client.table("org_rules").delete().eq("session_id", "default").execute()
        else:
            response = (
                client.table("org_rules")
                .select("id")
                .eq("session_id", "default")
                .limit(1)
                .execute()
            )
            existing = response.data or []
            if existing:
                print("Default rules already seeded")
                return

        all_rules = _default_rules_payload()
        save_org_rules("default", all_rules)
        logger.info("Seeded %s default fallback rules", len(all_rules))
        print(f"Seeded {len(all_rules)} default rules")
    except Exception as exc:
        logger.exception("Failed to seed default fallback rules: %s", exc)
        print("Could not seed default rules")
