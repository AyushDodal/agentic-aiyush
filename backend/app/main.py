import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from openai import OpenAIError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.concurrency import run_in_threadpool

from .config import BACKEND_DIR, Settings
from .knowledge import KnowledgeBase
from .models import ChatRequest, ChatResponse, SpeechRequest
from .service import answer_question

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        knowledge = await run_in_threadpool(KnowledgeBase, settings)
        app.state.knowledge = knowledge
        try:
            if settings.resume_path:
                path = Path(settings.resume_path)
                await run_in_threadpool(knowledge.ingest, [path if path.is_absolute() else BACKEND_DIR / path])
            yield
        finally:
            await run_in_threadpool(knowledge.close)

    app = FastAPI(title="Ayush's AI Avatar", version="0.1.0", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    @app.exception_handler(OpenAIError)
    async def provider_error(request: Request, exc: OpenAIError):
        logger.warning("AI provider failure: %s", type(exc).__name__)
        return JSONResponse(status_code=503, content={"detail": "The AI service is temporarily unavailable. Please try again shortly."})

    @app.get("/api/health")
    def health(request: Request):
        knowledge = request.app.state.knowledge
        ready = knowledge.ready
        return {
            "status": "ok", "resume_ready": ready,
            "mode": "openai" if settings.use_openai else "local",
            "voice": "openai" if settings.use_openai else "browser",
            "documents": knowledge.manifest["documents"] if ready else [],
            "chunks": knowledge.manifest["chunks"] if ready else 0,
        }

    @app.post("/api/chat", response_model=ChatResponse)
    @limiter.limit(settings.chat_rate_limit)
    def chat(request: Request, body: ChatRequest):
        try:
            return answer_question(request.app.state.knowledge, body)
        except ValueError as exc:
            logger.warning("Invalid AI response: %s", type(exc).__name__)
            raise HTTPException(502, "I couldn't prepare a reliable answer. Please try again.") from exc

    @app.get("/api/resume")
    def resume(request: Request):
        knowledge = request.app.state.knowledge
        if not knowledge.ready:
            raise HTTPException(404, "No resume is available yet.")
        path = Path(knowledge.manifest["files"][0])
        if not path.is_file():
            raise HTTPException(404, "The original resume file is unavailable.")
        return FileResponse(path, filename=path.name)

    @app.post("/api/speech")
    @limiter.limit(settings.audio_rate_limit)
    def speech(request: Request, body: SpeechRequest):
        client = request.app.state.knowledge.openai
        if not client:
            raise HTTPException(503, "AI voice is not configured. Browser speech is available.")
        response = client.audio.speech.create(
            model=settings.tts_model, voice=settings.tts_voice, input=body.text,
            instructions="Speak as a friendly young adult man in a relaxed, clear, professional tone.",
            response_format="mp3",
        )
        return Response(content=response.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})

    @app.post("/api/transcribe")
    @limiter.limit(settings.audio_rate_limit)
    async def transcribe(request: Request, audio: Annotated[UploadFile, File()]):
        try:
            client = request.app.state.knowledge.openai
            if not client:
                raise HTTPException(503, "Voice transcription is not configured.")
            types = {"audio/webm": ".webm", "video/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/mpeg": ".mp3"}
            mime = (audio.content_type or "").split(";")[0]
            if mime not in types:
                raise HTTPException(415, "Unsupported audio format.")
            data = await audio.read(8 * 1024 * 1024 + 1)
            if not data or len(data) > 8 * 1024 * 1024:
                raise HTTPException(413, "Audio must be nonempty and no larger than 8 MB.")
            result = await run_in_threadpool(
                client.audio.transcriptions.create,
                model=settings.transcription_model,
                file=("question" + types[mime], data, mime),
                prompt="A recruiter asking Ayush Dodal about his resume, work experience, education, or projects.",
            )
            return {"text": result.text}
        finally:
            await audio.close()

    return app


app = create_app()
