---
type: runbook
tags: [ai-avatar, deployment]
---

# Setup And Deployment

[[Welcome]] | [[Project Plan]] | [[Architecture]]

The repository-root README contains executable install, indexing, testing, and deployment commands.

## Local Workflow

1. Install Node.js and Python dependencies using the README.
2. Supply `OPENAI_API_KEY` through `backend/.env` or the environment.
3. Put the recruiter-facing PDF in `backend/data/resume.pdf`.
4. Run `python -m app.ingest data/resume.pdf` from `backend/`, with the API stopped.
5. Run `scripts/start-dev.ps1` from PowerShell. Use the URLs it prints.
6. Open the portal, ask an experience or education question, and inspect its resume sources.

Use `AI_MODE=local` with `--local` ingestion for explicitly labeled excerpt search. Browser capabilities determine local voice input/output support.

## Release Dependencies

- The GitHub remote already exists: `AyushDodal/agentic-aiyush`.
- Source changes must be committed and pushed before Git-based hosting can build them.
- The owner must connect a Vercel account/project.
- The Python service needs an HTTPS container host and persistent storage.
- Configure the backend API key, resume path, and exact allowed frontend origins.
- Configure Vercel `VITE_API_BASE_URL` with the backend origin.
- Check provider billing limits and review which contact details are in the public resume.

`vercel.json` configures the Vite frontend. `backend/Dockerfile` packages the API. Embedded Qdrant is not suitable for an ephemeral Vercel function filesystem, so the backend is deployed separately.

## Release Checks

- [ ] Work/education answers agree with resume dates, employers, and project status.
- [ ] Missing hobbies, salary, and availability lead to abstention.
- [ ] Speech input and output work with real hardware on the public HTTPS origin.
- [ ] Audio controls stop playback and recording correctly.
- [ ] Desktop and phone layouts remain readable.
- [ ] Resume download points to the intended recruiter-facing document.
- [ ] Origin restrictions, rate limits, logs, and provider budgets are configured.
- [ ] Persistent resume/vector storage survives a service restart.

## Data

Keep `.env`, resumes, embeddings, manifests, and local logs out of Git. They are ignored by this repository. No original resume or secrets are included in the Docker image. Supply them through the host's secret and persistent-storage facilities.
