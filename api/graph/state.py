from typing import TypedDict


class ContentState(TypedDict):
    """
    Pipeline state for content generation and processing.

    Input Fields:
      - run_id: Unique identifier for this pipeline execution
      - brief: Initial user input with content requirements
      - engagement_data: Optional engagement metrics from previous content
      - past_feedback: Historical feedback for similar content types

    Phase Outputs:
      - strategy: Output from intake agent (content strategy)
      - draft: Article with ##INTRO ##BODY ##CONCLUSION markers
      - draft_version: Iteration counter for compliance loops (max 3)
      - compliance_verdict: Empty string until compliance check runs
      - compliance_feedback: List of compliance issues [{sentence, rule_id, message, suggested_fix}]
      - compliance_iterations: Count of compliance revision attempts
      - localized_hi: Hindi-adapted content from localization agent
      - blog_html: ReportLab-generated HTML article
      - twitter_thread: List of tweets (max 280 chars each)
      - linkedin_post: Single LinkedIn post
      - whatsapp_message: WhatsApp-formatted message

    Control Fields:
      - human_approved: Whether human has approved the content
      - escalation_required: Flag for manual review needed
      - error_message: Error details if pipeline fails
      - pipeline_status: Current pipeline status (pending/processing/completed/failed)

    Audit Fields:
      - audit_log: List of all agent actions with timestamps and decisions
    """
    run_id: str
    brief: dict
    engagement_data: dict | None
    strategy: dict
    past_feedback: list[str]
    draft: str
    draft_version: int
    compliance_verdict: str
    compliance_feedback: list[dict]
    compliance_iterations: int
    localized_hi: str
    blog_html: str
    twitter_thread: list[str]
    linkedin_post: str
    whatsapp_message: str
    human_approved: bool
    escalation_required: bool
    error_message: str | None
    pipeline_status: str
    audit_log: list[dict]
