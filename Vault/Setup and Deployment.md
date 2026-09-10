---
type: runbook
tags: [ai-avatar, deployment]
---

# Setup And Deployment

[[Welcome]] | [[Project Plan]] | [[Architecture]]

The deployment target is **two Vercel projects from the same GitHub repository**, with Qdrant Cloud storing the resume vectors and index metadata.

> [!important] Code ready; cloud setup still required
> The backend now supports Qdrant Cloud metadata and read-only Vercel startup. Before deploying, create the cloud cluster, ingest the resume through the operator CLI, configure project secrets and rate limits, and run the release checks. No production account or deployment has been created by these code changes.

## Hosting Layout

| Component | Target | Project root |
| --- | --- | --- |
| React frontend | Vercel project `agentic-aiyush` | Repository root |
| FastAPI backend | Vercel project `agentic-aiyush-api` | `backend` |
| Resume vectors and active-index metadata | Qdrant Cloud Free cluster | External service |
| Recruiter-facing PDF | Read-only asset bundled with the backend deployment | `backend/resume/resume.pdf` |

Project names are suggested names; use the actual assigned production domains in configuration. Vercel supports multiple projects connected to one repository with different root directories. [Monorepo documentation](https://vercel.com/docs/monorepos)

Vercel Hobby is free within its quotas for personal, non-commercial use. This avoids a fixed hosting subscription, but OpenAI usage remains separately billed. Qdrant's free cluster includes 1 GB RAM and 4 GB disk without a credit card. Free clusters can be suspended after one week of inactivity and deleted after four weeks if not reactivated; retain the source resume for recovery. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Qdrant Free](https://qdrant.tech/documentation/cloud/create-cluster/)

## Local Workflow

1. Install Node.js and Python dependencies using the README.
2. Supply `OPENAI_API_KEY` through `backend/.env` or the environment.
3. Put the recruiter-facing PDF in `backend/data/resume.pdf`.
4. Run `python -m app.ingest data/resume.pdf` from `backend/`, with the API stopped.
5. Run `scripts/start-dev.ps1` from PowerShell. Use the URLs it prints.
6. Open the portal, ask an experience or education question, and inspect its resume sources.

Use `AI_MODE=local` with `--local` ingestion for explicitly labeled excerpt search. Browser capabilities determine local voice input/output support.

## Implementation Status

- [x] Cloud mode loads and publishes generation, checksum, document names, and chunk count in a Qdrant metadata collection. It does not use a local JSON manifest or publish local machine paths.
- [x] Cloud startup performs no application-directory writes or ingestion. Vercel configuration rejects embedded storage and `RESUME_PATH`.
- [x] The supplied recruiter-facing PDF is bundled at `backend/resume/resume.pdf`; cloud `/api/resume` uses `RESUME_DOWNLOAD_PATH` rather than an ingestion-machine path.
- [x] The CLI publishes vectors before the cloud manifest. Unchanged documents skip embeddings. Old cloud generations remain available to in-flight readers; run only one writer and retire older generations during a quiet maintenance window.
- [x] `backend/vercel.json` selects FastAPI and a 60-second function duration; `.python-version` selects Python 3.12. Production requirements exclude parsing and local-search libraries.
- [x] Browser recordings, uploaded audio, and synthesized responses are limited to 4,000,000 bytes, below Vercel's 4.5 MB payload limit with multipart headroom.
- [x] Tests cover fresh cloud readers, live replacement, failed publication, configuration, downloads, and audio boundaries.
- [ ] Create and ingest the real cloud cluster, configure both Vercel projects, and verify their deployments. Check the built Python bundle stays below the standard 500 MB limit.
- [ ] Configure deployment-wide request limits using the Firewall instructions below or a shared Redis connection.

Vercel runs FastAPI as a Python Function, using the exported `app` in `app/main.py`. This route does not use `backend/Dockerfile`, a persistent disk, SSH uploads, or a manually managed Uvicorn process. [FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi), [function limits](https://vercel.com/docs/functions/limitations)

## Qdrant Cloud Setup

1. Create a **Free** cluster in Qdrant Cloud and record its cluster URL and API key.
2. Configure `QDRANT_URL`, `QDRANT_API_KEY`, `OPENAI_API_KEY`, and `AI_MODE=openai` in the local backend environment. Keep local and production embedding-model settings identical.
3. With local dependencies installed, run this from `backend/`:

```powershell
../.venv/Scripts/python.exe -m app.ingest resume/resume.pdf
```

The CLI prints both collection names: `resume_<model-hash>` and `resume_<model-hash>_metadata`. Confirm both exist in Qdrant. Existing cloud installations must run this once to publish their previously local manifest; embedded local indexes are unchanged. Keep the same PDF version in the deployment and index.

4. Give the deployed backend read-only access to the published collections where supported; keep write credentials with the ingestion operator. Re-index only when the resume or embedding model changes.

## Vercel Backend Project

**Index the cloud resume before these steps.**

1. Commit and push the backend migration to `AyushDodal/agentic-aiyush`.
2. In Vercel, choose **Add New > Project**, import the same repository again, and name the new project `agentic-aiyush-api`.
3. Set **Root Directory** to `backend` and **Framework Preset** to `FastAPI`. Use framework-default build/install settings and no static output directory. Do not apply the frontend's Vite build command or `dist` output to this project.
4. The backend's `vercel.json` and `pyproject.toml` select `app.main:app` and a 60-second function maximum; `.python-version` selects Python 3.12. Deploy only `requirements.txt` dependencies. Local ingestion/test dependencies are in separate requirements files.
5. Add the backend environment variables below for **Production**. Configure **Preview** separately when needed.
6. Deploy and record the stable production domain, for example `https://agentic-aiyush-api.vercel.app`.
7. Check `/api/health`: expect `status: ok`, `resume_ready: true`, and `mode: openai`. A healthy process with `resume_ready: false` does not satisfy the release check.
8. Ensure the production API is reachable by unauthenticated recruiters and browser CORS preflight requests. Vercel deployment protection can otherwise block the separate frontend; never put a protection-bypass secret in browser code.

Backend environment variables, using your actual domains and credentials:

```dotenv
OPENAI_API_KEY=your-openai-api-key
AI_MODE=openai
QDRANT_URL=https://your-cluster-endpoint
QDRANT_API_KEY=your-qdrant-api-key
EMBEDDING_MODEL=text-embedding-3-small
CHAT_MODEL=gpt-4.1-mini
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=ash
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
CORS_ORIGINS=["https://your-frontend.vercel.app"]
DATA_DIR=/tmp/agentic-aiyush
RESUME_DOWNLOAD_PATH=resume/resume.pdf
```

Leave `RESUME_PATH` unset in production. `RESUME_DOWNLOAD_PATH` only selects the read-only PDF asset; it does not trigger ingestion. Cloud mode does not use `DATA_DIR` for persistent state, so that setting may be omitted. No `PORT` setting is needed. Vercel supplies `VERCEL=1` automatically; do not add it to the operator's local environment.

## Deployment-Wide Rate Limits

The application defaults to per-instance limits of 12 chat requests and 6 requests per audio endpoint per minute. These reset with each instance and are not a global spending cap.

For this deployment, use the backend project's **Firewall** settings to create one rate-limit rule matching `POST` requests to `/api/chat`, `/api/speech`, or `/api/transcribe`. Count by IP, use a 60-second fixed window, and block after 12 requests across those endpoints. This permits roughly four complete voice turns per minute and applies across instances. Publish the rule and check its logs with the production frontend. Hobby supports one rate-limit rule with an included request allowance. [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)

Alternatively, `RATE_LIMIT_STORAGE_URI=rediss://...` connects the application's limiter to a shared Redis service and enforces its existing per-endpoint limits across instances. This is optional infrastructure with its own quotas; no Redis account has been provisioned. Use a Redis connection URI, not a REST API URL. Provider budget controls remain separate from either limiter.

## Connect The Frontend

1. Keep the frontend Vercel project's root at the repository root, framework `Vite`, build command `npm run build`, and output directory `dist`.
2. Set its Production environment variable to the actual backend origin:

```dotenv
VITE_API_BASE_URL=https://your-backend.vercel.app
```

3. Redeploy the frontend; `VITE_` variables are embedded at build time. The value must not end with `/api`, contain `:8000`, or point to localhost.
4. Set backend `CORS_ORIGINS` to the exact frontend production origin, with no trailing slash. Redeploy the backend after changing it. Add a custom domain or specific preview origins explicitly as needed.
5. Keep OpenAI and Qdrant credentials exclusively in the backend project; never create `VITE_OPENAI_API_KEY` or a browser-visible Qdrant key.

## Release Checks

- [ ] Work/education answers agree with resume dates, employers, and project status.
- [ ] Missing hobbies, salary, and availability lead to abstention.
- [ ] Speech input and output work with real hardware on the public HTTPS origin.
- [ ] Audio controls stop playback and recording correctly.
- [ ] Desktop and phone layouts remain readable.
- [ ] Resume download points to the intended recruiter-facing document.
- [ ] Origin restrictions, rate limits, logs, and provider budgets are configured.
- [ ] A fresh function instance reads the existing cloud index without a local manifest or new embedding calls.
- [ ] The cloud index and PDF download remain available after a redeploy.
- [ ] Oversized microphone recordings are rejected before exceeding Vercel's request limit; normal synthesized responses fit its response limit.
- [ ] Production API access works from the separate frontend without a Vercel login.

## Data

Keep `.env`, the original/private resume, local indexes, manifests, and logs out of Git. Existing working data stays in ignored `backend/data/`. The supplied recruiter-facing PDF has been copied to `backend/resume/resume.pdf` as a deployment asset; it includes the resume's contact details and will be downloadable by visitors and visible in the repository if committed to a public repository. The original desktop file remains unchanged. No cloud upload, Git push, or public deployment has been performed.

Review Vercel quotas, Qdrant cluster activity, and provider spending before sharing the production URL. This setup targets free hosting tiers, not unlimited hosting or free AI inference.
