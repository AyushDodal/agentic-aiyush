---
type: project
status: implementation
tags: [ai-avatar, planning]
---

# Project Plan

[[Welcome]] | [[Architecture]] | [[Setup and Deployment]] | [[Future Scope]]

## Problem

Recruiters need an efficient way to understand Ayush's professional background and ask follow-up questions. A static resume cannot hold a conversation. The avatar provides a conversational view of the resume while keeping its factual scope tied to source evidence.

## MVP

- A React portal with the requested welcome line and navy visual direction.
- An animated, stylized young adult male avatar with brown skin and a casual teal T-shirt. It is an illustrative persona, not a verified likeness.
- Typed and spoken questions with a readable conversation transcript.
- First-person answers from a Python RAG pipeline, with inspectable resume excerpts.
- Voice output, audio-responsive mouth/eyebrows, blinking, and head motion.
- Explicit uncertainty when information is not present in the resume.
- Vercel frontend configuration and containerized Python backend.

## Implementation Checklist

- [x] Use the existing React/Python GitHub repository.
- [x] Build responsive React/TypeScript portal.
- [x] Build Three.js avatar and basic expression animation.
- [x] Implement PDF/Markdown/text ingestion and persistent Qdrant retrieval.
- [x] Implement structured, cited OpenAI answers and missing-information behavior.
- [x] Implement microphone transcription and speech synthesis.
- [x] Add local extractive fallback and absent-resume states.
- [x] Add automated backend and desktop/mobile browser checks.
- [x] Prepare frontend/backend deployment configuration.
- [ ] Complete public hosting with owner account access.
- [ ] Conduct a real recruiter interview and review answer quality.

## Acceptance

Experience, education, and technology questions must refer to the supplied resume and retain dates and qualifiers such as "active development." Unlisted hobbies, salary expectations, and availability must produce an honest abstention. Source excerpts must be inspectable. Denied microphone permission must leave text chat usable. Errors must support retry, and a new conversation must cancel in-flight work and audio.

## Source Of Truth

The owner supplied `Ayush Dodal Resume (AI Engineer).pdf`. A local working copy lives in ignored `backend/data/resume.pdf`; it is not committed to Git. The original file remains unchanged. The current resume includes no hobbies section, so the avatar must not invent one.
