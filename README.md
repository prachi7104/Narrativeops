## NarrativeOps
ET AI Hackathon 2026 | Track 1: AI for Enterprise Content Operations

NarrativeOps is an enterprise AI content operations system for editorial, marketing, and compliance teams that turns a single brief into multi-channel, approval-ready output with auditability. It is designed for high-trust financial publishing workflows where teams need speed without sacrificing control, by combining grounded trend signals, organization-specific policy enforcement from uploaded brand guides, and a correction-memory loop that continuously improves draft quality from real editor feedback.

## What's Different From Other Submissions
- Trend context is grounded in real web sources (Tavily + ET RSS), not LLM hallucination
- Compliance rules extracted from uploaded PDF brand guide - not hardcoded
- Editorial corrections captured as diff pairs, injected as few-shot examples in future drafts
- Impact quantification: Rs11,250 per piece (7.5 hours x Rs1500/hr), tracked per run

## Architecture
NarrativeOps runs as a FastAPI + LangGraph backend with Supabase persistence and a React/Vite frontend, orchestrating agents for intake, trend grounding, drafting, compliance, localization, formatting, and approval. A detailed system breakdown is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## Setup
```bash
# Backend
cd api && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in keys
uvicorn api.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Required Environment Variables
| Variable | How to get it | Required? |
|---|---|---|
| `GROQ_API_KEY_HEAVY` | Groq Console key (Account 1) for heavier generation calls | Required |
| `GROQ_API_KEY_LIGHT` | Groq Console key (Account 2) for lighter agent calls | Required |
| `SUPABASE_URL` | Supabase project URL from Project Settings | Required |
| `SUPABASE_ANON_KEY` | Supabase API key from Settings -> API | Required |
| `TAVILY_API_KEY` | Tavily API key for grounded web trend retrieval | Required |
| `GOOGLE_API_KEY` | Google AI Studio key used as fallback model path | Optional |

## Running Tests
```bash
# Backend unit tests (no API quota)
cd api && pytest tests/ -m "not integration" -v

# Backend integration tests (uses Groq + Supabase)
cd api && pytest tests/ -m integration -v -s

# Frontend tests
cd frontend && npm test
```
