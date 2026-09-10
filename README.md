# Agentic Aiyush

Ayush Dodal's career AI persona: a React portal with an animated Three.js avatar, voice conversation, and a Python API that answers from his resume.

Production target: two Vercel projects (React frontend and FastAPI backend) with Qdrant Cloud. The Dockerfile is an optional local/container alternative. The Vercel migration is implemented; account configuration and cloud ingestion are still required before release.

## Run Locally

Requires Node.js 22.12+ (24 recommended) and Python 3.12. From the repository root in PowerShell:

```powershell
npm.cmd install
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
```

Set `OPENAI_API_KEY` in `backend/.env` or in the environment. Keys stay in Python and must never use a `VITE_` prefix. The default models are configurable: `gpt-4.1-mini` for answers, `text-embedding-3-small` for retrieval, `gpt-4o-mini-transcribe` for microphone input, and `gpt-4o-mini-tts` with the `ash` voice for output.

Place your resume in `backend/data/resume.pdf`, then index it while the API is stopped:

```powershell
Push-Location backend
../.venv/Scripts/python.exe -m app.ingest data/resume.pdf
Pop-Location
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

The startup script prints the frontend/backend URLs, process IDs, and log locations. It selects another port when a preferred port is occupied and opens no terminal windows. Start only one API process for a local Qdrant directory.

Alternatively, run the services in separate terminals:

```powershell
# Terminal 1, from backend/
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Terminal 2, from the repository root
npm.cmd run dev
```

On macOS/Linux, use `.venv/bin/python` in place of `.venv/Scripts/python.exe`. The frontend normally opens at `http://127.0.0.1:5173`; API documentation is at `http://127.0.0.1:8000/docs`.

## Resume And Answers

PDF, Markdown, and plain-text resumes are supported; scanned PDFs require OCR first. Multiple file arguments replace the current corpus with their combined contents. Repeated ingestion of unchanged documents skips embedding calls. A new generation is stored before the active manifest is published. Cloud readers query only that active generation; older cloud generations are retained so in-flight requests remain valid. Run only one ingestion operator at a time, and retire old generations during a maintenance window when no requests are active. Source names and PDF page numbers travel with each chunk.

The RAG flow is parsing, overlapping chunks, embeddings, Qdrant similarity retrieval, and structured OpenAI Responses generation. The model is instructed to use only resume evidence; invalid or missing citation IDs cause an abstention. These safeguards reduce hallucinations but do not prove every generated sentence is entailed. Evaluate answers after changing the resume or models. Follow-up questions use recent conversation context. Hobbies, salary, or availability absent from the resume must not be invented.

`AI_MODE=local` uses scikit-learn hashing vectors and returns labeled verbatim search excerpts without a model. This is a development fallback, not semantic RAG or generated persona dialogue. Ingest with `--local` and also run the API with `AI_MODE=local`. Local and OpenAI indexes are kept separate. Re-ingest after changing the embedding model.

## Voice And Privacy

Microphone access needs HTTPS or localhost and browser permission. OpenAI mode records a question (up to 45 seconds and 4,000,000 bytes), transcribes it, retrieves an answer, and synthesizes speech. Oversized recordings are rejected in both the browser and API. Synthesized audio over the same byte limit triggers browser speech fallback. Audio amplitude drives the mouth and eyebrows; blinking and head motion run independently. This is basic animation, not phoneme-perfect lip sync or voice cloning. Local voice input uses browser speech recognition where available. A browser's speech recognition service may send audio to its vendor.

The interface identifies itself as an AI avatar with synthetic speech. Conversations live only in React memory and can be downloaded explicitly. They are not persisted by this application. Relevant resume excerpts and recent conversation turns are sent to OpenAI with `store=False`; provider retention policies still apply. Audio is forwarded for transcription or synthesis and is not saved by the app. Local working data stays in ignored `backend/data/`. Cloud mode stores passages, vectors, and active-index metadata in Qdrant, without the ingestion computer's file paths. The supplied recruiter-facing PDF is bundled at `backend/resume/resume.pdf`; `/api/resume` serves it, including its contact details. Committing that PDF to a public repository makes it public there as well.

Ingestion is an operator CLI, with no public upload endpoint. The API limits text/audio sizes and request rates. Vercel requests use its platform-provided client IP header; local/container mode uses the direct client address. The default in-memory limiter is per process. Before public release, configure the Vercel Firewall rule in the deployment guide, or set `RATE_LIMIT_STORAGE_URI` to a Redis connection URI to share the application limits. CORS is an origin control, not authentication. Configure provider budget limits before public use.

## Verify

```powershell
npm.cmd run build
.venv/Scripts/python.exe -m ruff check backend
Push-Location backend
../.venv/Scripts/python.exe -m pytest -q
Pop-Location
# With the frontend running and Chrome installed:
npm.cmd run test:e2e
```

Browser tests use mocked API responses to cover desktop/mobile rendering, canvas pixels and motion, conversation, sources, settings, retry/reset, microphone denial, and oversized recordings. API tests cover local persistence and shared-cloud behavior, read-only cold starts, publication failures, citation validation, configuration, and audio boundaries using fictional fixtures and mocked providers; no paid calls or personal resume are required. For bundled Chromium, run `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. CI runs both suites.

## Deploy

Use two projects from `AyushDodal/agentic-aiyush`:

| Setting | Frontend | Backend |
| --- | --- | --- |
| Root directory | Repository root | `backend` |
| Framework | Vite | FastAPI |
| Build/output | `npm run build` / `dist` | Framework defaults |
| Configuration | `vercel.json` | `backend/vercel.json` |
| Runtime | Node.js build, static output | Python 3.12, `app.main:app`, 60-second function limit |

1. Create a Qdrant Cloud Free cluster. Configure its URL and a write-capable key in your local `backend/.env`, alongside `OPENAI_API_KEY` and `AI_MODE=openai`. Keep `RESUME_PATH` empty and run cloud ingestion from `backend/`:

```powershell
../.venv/Scripts/python.exe -m app.ingest resume/resume.pdf
```

The CLI prints the vector and metadata collection names. Both must be present before deployment. It performs no API-server startup ingestion, and repeat runs skip unchanged content. Existing cloud users must re-run this command once to publish their formerly local manifest. Existing embedded indexes continue to work locally.

2. Commit and push the source and recruiter-facing asset, then import the backend as a second Vercel project. Add these Production environment variables using real credentials and domains:

```dotenv
OPENAI_API_KEY=your-openai-key
AI_MODE=openai
QDRANT_URL=https://your-cluster-endpoint
QDRANT_API_KEY=your-read-only-cluster-key
CORS_ORIGINS=["https://your-frontend.vercel.app"]
RESUME_DOWNLOAD_PATH=resume/resume.pdf
```

Use the same embedding model as the ingestion operator. Leave `RESUME_PATH` unset: Vercel startup only connects to the published index. `DATA_DIR` is unused for cloud storage; no persistent disk or `PORT` variable is needed. Vercel supplies `VERCEL=1` automatically; don't set it in your local environment. Production dependencies are in `requirements.txt`; parsing and local-search dependencies are only in `requirements-local.txt`/`requirements-dev.txt`.

3. Deploy the backend. Its public `/api/health` must report `resume_ready: true` and `mode: openai`. Check `/api/resume` downloads the intended PDF. Ensure production deployment protection permits browser requests from the separate frontend. Configure deployment-wide rate limiting before sharing the URL.
4. In the frontend project, set `VITE_API_BASE_URL=https://your-backend.vercel.app`, then redeploy. Use only the backend origin, without `/api` or `:8000`. Add exact production/custom frontend origins to backend `CORS_ORIGINS` as a JSON array.

The [Obsidian deployment guide](Vault/Setup%20and%20Deployment.md) includes full setup, rate limiting, costs, and release checks. Vercel Hobby and Qdrant Cloud have free-tier quotas and eligibility rules; OpenAI usage is billed separately. Qdrant free clusters can suspend/delete after inactivity, so retain the original resume for recovery. No public deployment or Git push has been performed here.

### Optional Docker Deployment

The Dockerfile remains available for local use or a future container host:

```powershell
docker build -t agentic-aiyush-api backend
docker run --rm -p 8000:8000 --env-file backend/.env agentic-aiyush-api
```

This image includes local parsing/search dependencies and the public resume asset. Cloud mode uses the same Qdrant configuration as Vercel. Embedded mode needs a volume at `/app/data` for persistence and can set `RESUME_PATH=/app/resume/resume.pdf` for startup ingestion. Only run one process against an embedded Qdrant directory. Vercel does not build or execute this Dockerfile.

## Project Vault

Open `Vault/` in Obsidian. Start at [Welcome](Vault/Welcome.md), then [Project Plan](Vault/Project%20Plan.md), [Architecture](Vault/Architecture.md), [Setup and Deployment](Vault/Setup%20and%20Deployment.md), and [Future Scope](Vault/Future%20Scope.md).

Official implementation references: [OpenAI Responses](https://developers.openai.com/api/docs/guides/text), [embeddings](https://developers.openai.com/api/docs/guides/embeddings), [speech](https://developers.openai.com/api/docs/guides/text-to-speech), [transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Qdrant](https://qdrant.tech/documentation/quickstart/), and [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
