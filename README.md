# UoM Data Cleansing Agent

Release 1 proof of concept for cleansing Grocery 2 and Dairy & Frozen unit-of-measure data.

The system keeps deterministic conversion rules in a validated, version-controlled YAML
ruleset. There is intentionally no unit-mapping administration UI in this release.
Each row is worked on by a method chosen from its shape (check complete values, convert the
old size, read the descriptions, or complete a half-filled row), then sorted into a group by
its result:

- **Group A · No change**: nothing in K, L or M was written (already correct, or correct with a note).
- **Group B · Changed by the tool**: the tool wrote K, L or M itself, whatever found the value.
- **Group C · Raised for a person**: needs review, could not determine, or values that cannot be used.
- **Purged**: skipped before anything ran.

Complete standardized rows pass a deterministic validation gate and are never rewritten
automatically except for spelling. Conversions use Excel-equivalent nearest-whole rounding.
Pack size follows an evidence-first pipeline: preserve valid M, extract explicit pack
patterns deterministically, use the agent only for unresolved pack clues, and record a
product with no pack count written anywhere as a single item, with a note.

## Run locally

1. Copy `.env.example` to `.env`.
2. Run `docker compose up --build`.
3. Open `http://localhost:5173`.

The API is available at `http://localhost:8000/api` and health checks at
`http://localhost:8000/health`.

## Development

Run the backend from the repository root:

```bash
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload --port 8000
```

In a second terminal, run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`. The backend API documentation is available at
`http://localhost:8000/docs`.

Backend tests:

```bash
./scripts/test-backend.sh
```

Frontend checks:

```bash
cd frontend
npm install
npm run build
```

## Enable the real Google ADK agent

The default `AI_PROVIDER=mock` keeps local development deterministic and does not make
model calls. To run the ADK provider with the Gemini Developer API, create an API key
in Google AI Studio and install the AI dependencies:

```bash
source .venv/bin/activate
pip install -e 'backend[ai,test]'
```

Then set these values in `.env` and restart the backend:

```dotenv
AI_PROVIDER=adk
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.6-flash
AI_TIMEOUT_SECONDS=60
```

No Google Cloud project or Application Default Credentials are required. The application
fails at startup when `AI_PROVIDER=adk` is selected without an API key or model. Model
output is treated only as an observation: all unit
normalization and conversion still pass through the version-controlled deterministic
rules engine.

See [the implementation plan](docs/implementation-plan.md) and
[rule maintenance guide](backend/app/rules/README.md). Agent code ownership is described
in [the agent README](backend/app/agents/README.md), with the detailed design in
[the ADK agent design](docs/adk-agent-design.md).
