"""
Format agent: Generates channel-specific content formats.
"""

from api.graph.state import ContentState


def run_format_agent(state: ContentState) -> dict:
    """
    Format content for blog, Twitter, LinkedIn, and WhatsApp channels.

    Returns:
        dict: State updates with blog_html, twitter_thread, linkedin_post, whatsapp_message
    """
    return {
        "blog_html": "<html><body><h1>Test Article</h1><p>Stub content.</p></body></html>",
        "twitter_thread": [
            "Tweet 1: This is a stub tweet for testing. #test",
            "Tweet 2: This is the second tweet in the thread. #test"
        ],
        "linkedin_post": "This is a stub LinkedIn post for testing purposes. It would contain professional content adapted from the article.",
        "whatsapp_message": "📢 Test WhatsApp message: Stub content for testing the format agent.",
        "pipeline_status": "awaiting_approval",
        "audit_log": state.get("audit_log", []) + [{"agent": "format_agent", "action": "stub", "channels": ["blog", "twitter", "linkedin", "whatsapp"]}]
    }
