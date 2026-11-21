# HireMind AI

An AI interview-prep platform. Upload your resume, paste a job description, and HireMind finds your skill gaps, runs a mock technical interview built around them (voice or text), and gives you a scored report with a study plan.

> **Live Demo:** `PASTE_DEPLOYMENT_LINK_HERE`

## Features

- **Resume and JD analysis** – parses PDF/DOCX resumes and job descriptions into structured data.
- **Skill-gap report** – overall match score, matched strengths, partial skills and prioritized gaps, each with evidence.
- **Targeted interview** – 5 questions generated from your gaps, asked in real time over WebSocket.
- **Voice or text answers** – speak (transcribed with Whisper) or type; questions are read aloud by the browser.
- **Per-answer evaluation** – scored on accuracy, depth, clarity, relevance and confidence, with feedback and a model answer.
- **Final report** – readiness level, skill progression, strengths, areas to improve and a study checklist.

## How It Works

```mermaid
flowchart TD
    A([User]) --> B[Upload resume<br/>PDF / DOCX]
    A --> C[Paste job description]

    subgraph S1["1 · Intake and Analysis"]
        B --> D["POST /parse/resume<br/>extract text and profile"]
        C --> E["POST /parse/jd<br/>extract role and requirements"]
        D --> F["POST /analyze/skill-gap<br/>compare resume vs JD"]
        E --> F
        F --> G[/"Skill-gap report<br/>match score, gaps, strengths"/]
    end

    G --> H["POST /session/bootstrap<br/>generate 5 targeted questions"]

    subgraph S2["2 · Interview Agent (WebSocket)"]
        H --> I["Ask question<br/>text + browser text-to-speech"]
        I --> J{"Answer type"}
        J -->|Text| L["Candidate answer"]
        J -->|Voice| K["Whisper<br/>speech-to-text"]
        K --> L
        L --> M["Evaluate answer<br/>5 dimension scores + feedback"]
        M --> N{"More questions?"}
        N -->|Yes| I
    end

    N -->|No| O["POST /session/id/finalize"]

    subgraph S3["3 · Evaluation and Reporting"]
        O --> P["Aggregate scores,<br/>skill progression, readiness"]
        P --> Q["Final report<br/>summary, strengths, gaps, study plan"]
    end

    Q --> R([User reviews report])

    classDef io fill:#eef2ff,stroke:#6366f1,color:#1e1b4b
    classDef step fill:#ffffff,stroke:#94a3b8,color:#0f172a
    classDef choice fill:#fffbeb,stroke:#d97706,color:#451a03
    classDef out fill:#ecfdf5,stroke:#059669,color:#022c22
    class A,R io
    class B,C,D,E,F,H,I,K,L,M,O,P step
    class J,N choice
    class G,Q out
    style S1 fill:#f8fafc,stroke:#cbd5e1,color:#334155
    style S2 fill:#f8fafc,stroke:#cbd5e1,color:#334155
    style S3 fill:#f8fafc,stroke:#cbd5e1,color:#334155
```

### System Architecture

```mermaid
flowchart LR
    U[Browser<br/>React + Vite] -->|REST + WebSocket| N[Nginx]
    N --> API[FastAPI backend]
    API --> LLM[Groq LLM<br/>Llama 3.3 70B]
    API --> STT[Groq Whisper<br/>speech-to-text]
    API --> EMB[Gemini embeddings]
    API --> DB[(PostgreSQL<br/>+ pgvector)]
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Pydantic, SQLAlchemy (async), Alembic |
| Agents | LangGraph / LangChain, structured JSON output with Pydantic validation |
| LLM | Groq (Llama 3.3 70B by default); Mistral and Anthropic also supported |
| Speech | Groq Whisper (speech-to-text), browser Web Speech API (text-to-speech) |
| Database | PostgreSQL 16 + pgvector, Gemini embeddings (1536-d) |
| Document parsing | PyMuPDF, python-docx |
| Deployment | Docker Compose, Nginx |
| Testing | pytest, pytest-asyncio |

## Project Structure

```
app/
├── agents/
│   ├── intake/          # Resume + JD parsing, skill-gap analysis
│   ├── interview/       # Question generation, WebSocket interview loop, speech
│   └── evaluation/      # Answer scoring, final report
├── orchestration/       # Session bootstrap and finalize endpoints
├── core/                # Schemas, DB models, database setup
├── utils/               # LLM client, vector store
└── main.py              # FastAPI app
frontend/                # React app (pages, hooks, components)
alembic/                 # Database migrations
tests/                   # Unit tests
docker-compose.yml       # db + backend + frontend
```

Schemas, DB design and agent contracts are documented in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Getting Started

### Prerequisites

- Python 3.12+ and Node.js 22+
- A [Groq API key](https://console.groq.com) (required)
- Docker (for the database, or to run everything with Compose)

### Option 1: Docker Compose

```bash
cp .env.example .env        # add your GROQ_API_KEY
docker compose up --build
```

| Service | URL |
|---|---|
| App | http://localhost:8080 |
| API docs | http://localhost:8000/docs |

### Option 2: Run locally

**Backend**

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # add your GROQ_API_KEY
docker compose up -d db           # optional: Postgres + pgvector
uvicorn app.main:app --reload
```

If you use the Compose database from your host, set `DATABASE_URL` in `.env` to port `5433`:
`postgresql+asyncpg://postgres:postgres@localhost:5433/hiremind`.
Without a database, the interview still runs: sessions are kept in memory and persistence is skipped.

**Frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                       # http://localhost:5173
```

## Configuration

Set these in `.env` (see `.env.example`).

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | LLM calls and Whisper transcription |
| `LLM_PROVIDER` | No | `groq` (default), `mistralai` or `anthropic` |
| `DEFAULT_LLM_MODEL` | No | Default `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | No | Embeddings for resume/JD chunks (skipped if missing) |
| `MISTRAL_API_KEY` / `ANTHROPIC_API_KEY` | No | Only if you switch `LLM_PROVIDER` |
| `OPENAI_API_KEY` | No | Only for the DB-backed `POST /session/start` flow |
| `DATABASE_URL` | No | Postgres connection string |

Frontend (`frontend/.env`): `VITE_API_URL` and `VITE_WS_URL`. Both default to the same origin in production builds.

## API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/parse/resume` | Extract text and profile from a PDF/DOCX |
| `POST` | `/parse/jd` | Structure a job description |
| `POST` | `/analyze/skill-gap` | Build the skill-gap report |
| `POST` | `/session/bootstrap` | Create an interview session with 5 questions |
| `WS` | `/ws/interview/{session_id}` | Live interview: questions, answers, evaluations |
| `POST` | `/session/{session_id}/finalize` | Generate the final report |
| `GET` | `/health` | Health check |

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Deployment Notes

- With Docker Compose, Nginx serves the frontend and proxies REST and WebSocket traffic to the backend, so everything runs on one origin.
- If you host the frontend and backend separately, add the frontend's URL to `allow_origins` in `app/main.py` (it currently allows `http://localhost:5173` only) and set `VITE_API_URL` / `VITE_WS_URL` at build time.
- Interview sessions in the default flow are held in memory, so they are lost when the backend restarts.
