from typing import TypedDict


class ContentState(TypedDict):
    """
    Pipeline state for content generation and processing.

    Input Fields:
      - run_id: Unique identifier for this pipeline execution
      - brief: Initial user input with content requirements
      - engagement_data: Optional engagement metrics from previous content
      - session_id: UUID linking this run to uploaded organization rules
      - content_category: Detected category (mutual_fund/fintech/general)
      - past_feedback: Historical feedback for similar content types

    Phase Outputs:
      - strategy: Output from intake agent (content strategy)
      - trend_context: Trend summary bullets generated from current market context
      - trend_sources: Source URLs used to build trend context
      - trend_cache_hit: Whether trend context came from cache
      - draft: Article with ##INTRO ##BODY ##CONCLUSION markers
      - draft_version: Iteration counter for compliance loops (max 3)
      - compliance_verdict: Empty string until compliance check runs
      - compliance_feedback: List of compliance issues [{sentence, rule_id, message, suggested_fix}]
      - compliance_iterations: Count of compliance revision attempts
      - org_rules_count: Number of organization rules used during compliance checks
      - rules_source: Which rules were used ('org_rules' or 'default')
      - localized_hi: Hindi-adapted content from localization agent
      - blog_html: ReportLab-generated HTML article
      - faq_html: HTML FAQ block for support/distribution use
      - publisher_brief: Plain-text launch notes for editorial/publishing ops
      - twitter_thread: List of tweets (max 280 chars each)
      - linkedin_post: Single LinkedIn post
      - whatsapp_message: WhatsApp-formatted message

    Control Fields:
      - human_approved: Whether human has approved the content
      - escalation_required: Flag for manual review needed
      - diff_captured: Whether editorial diff was captured for this run
      - error_message: Error details if pipeline fails
      - pipeline_status: Current pipeline status (pending/processing/completed/failed)

    Audit Fields:
      - audit_log: List of all agent actions with timestamps and decisions
    """
    run_id: str
    brief: dict
    engagement_data: dict | None
    session_id: str
    content_category: str
    output_format: str
    output_options: list[str]
    target_languages: list[str]
    strategy: dict
    trend_context: str
    trend_sources: list[str]
    trend_cache_hit: bool
    past_feedback: list[str]
    draft: str
    draft_version: int
    compliance_verdict: str
    compliance_feedback: list[dict]
    compliance_iterations: int
    org_rules_count: int
    rules_source: str
    localized_hi: str
    blog_html: str
    faq_html: str
    publisher_brief: str
    twitter_thread: list[str]
    linkedin_post: str
    whatsapp_message: str
    human_approved: bool
    escalation_required: bool
    diff_captured: bool
    error_message: str | None
    pipeline_status: str
    audit_log: list[dict]
