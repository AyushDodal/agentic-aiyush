# Agentic Aiyush

Ayush Dodal's career AI persona: a React portal with an animated Three.js avatar, voice conversation, and a Python API that answers from his resume.

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

PDF, Markdown, and plain-text resumes are supported; scanned PDFs require OCR first. Multiple file arguments replace the current corpus with their combined contents. Repeated ingestion of unchanged documents skips embedding calls. A new generation is stored before the previous generation is retired. Source names and PDF page numbers travel with each chunk.

The RAG flow is parsing, overlapping chunks, embeddings, Qdrant similarity retrieval, and structured OpenAI Responses generation. The model is instructed to use only resume evidence; invalid or missing citation IDs cause an abstention. These safeguards reduce hallucinations but do not prove every generated sentence is entailed. Evaluate answers after changing the resume or models. Follow-up questions use recent conversation context. Hobbies, salary, or availability absent from the resume must not be invented.

`AI_MODE=local` uses scikit-learn hashing vectors and returns labeled verbatim search excerpts without a model. This is a development fallback, not semantic RAG or generated persona dialogue. Ingest with `--local` and also run the API with `AI_MODE=local`. Local and OpenAI indexes are kept separate. Re-ingest after changing the embedding model.

## Voice And Privacy

Microphone access needs HTTPS or localhost and browser permission. OpenAI mode records a question (up to 45 seconds), transcribes it, retrieves an answer, and synthesizes speech. Audio amplitude drives the mouth and eyebrows; blinking and head motion run independently. This is basic animation, not phoneme-perfect lip sync or voice cloning. Browser speech synthesis is a fallback; local voice input uses browser speech recognition where available. A browser's speech recognition service may send audio to its vendor.

The interface identifies itself as an AI avatar with synthetic speech. Conversations live only in React memory and can be downloaded explicitly. They are not persisted by this application. Relevant resume excerpts and recent conversation turns are sent to OpenAI with `store=False`; provider retention policies still apply. Audio is forwarded for transcription or synthesis and is not saved by the app. Resume text, embeddings, the source PDF, and manifests stay in ignored `backend/data/`. The resume download endpoint intentionally exposes the connected resume to visitors, including any contact information it contains. Use a recruiter-facing copy when deploying.

Ingestion is an operator CLI, with no public upload endpoint. The API limits text/audio sizes and request rates. The default in-memory limiter is for one process; behind a reverse proxy, configure trusted client IP handling at your host and use a shared edge limiter before scaling. CORS is an origin control, not authentication. Configure provider budget limits before public use.

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

Browser tests use mocked API responses to cover desktop/mobile rendering, canvas pixels and motion, conversation, sources, settings, retry/reset, and microphone denial. API tests use fictional fixtures and mocked providers; no paid calls or personal resume are required. For bundled Chromium, run `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. CI runs both suites.

## Deploy

The repository is already associated with `https://github.com/AyushDodal/agentic-aiyush`. Frontend deployment is configured in `vercel.json`; it needs an independently hosted HTTPS Python backend.

1. Deploy `backend/Dockerfile` on a container host, using `backend/` as build context and port 8000. Attach persistent storage at `/app/data`, upload a resume there, and set `RESUME_PATH=/app/data/resume.pdf` for ingestion on startup. Supply `OPENAI_API_KEY` as a host secret. Use one process/replica with embedded Qdrant.
2. Set backend `CORS_ORIGINS` to a JSON list of your exact Vercel/custom frontend origins. Include preview origins explicitly when needed. Keep the health endpoint `/api/health` available.
3. Import this GitHub repository into Vercel, keep the root directory at the repository root, select Vite, and set `VITE_API_BASE_URL` to the HTTPS backend origin (no trailing `/api`). Build with `npm run build`; publish `dist`.
4. Verify resume download, factual questions, missing-information refusals, source passages, microphone permission, speech, and narrow/mobile layouts on the deployed URL.

For hosted Qdrant, set `QDRANT_URL` and `QDRANT_API_KEY`. The current manifest and original resume still require persistent storage, and this MVP still assumes one active ingestion operator. Shared manifest management and distributed rate limiting are required for multiple API replicas.

No public deployment or Git push is performed by these setup instructions. Hosting credentials, provider billing, and deployment access are supplied by the repository owner.

## Project Vault

Open `Vault/` in Obsidian. Start at [Welcome](Vault/Welcome.md), then [Project Plan](Vault/Project%20Plan.md), [Architecture](Vault/Architecture.md), [Setup and Deployment](Vault/Setup%20and%20Deployment.md), and [Future Scope](Vault/Future%20Scope.md).

Official implementation references: [OpenAI Responses](https://developers.openai.com/api/docs/guides/text), [embeddings](https://developers.openai.com/api/docs/guides/embeddings), [speech](https://developers.openai.com/api/docs/guides/text-to-speech), [transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Qdrant](https://qdrant.tech/documentation/quickstart/), and [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
