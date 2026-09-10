from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", extra="ignore", env_ignore_empty=True
    )

    openai_api_key: SecretStr = SecretStr("")
    chat_model: str = "gpt-4.1-mini"
    embedding_model: str = "text-embedding-3-small"
    tts_model: str = "gpt-4o-mini-tts"
    tts_voice: str = "ash"
    transcription_model: str = "gpt-4o-mini-transcribe"
    ai_mode: Literal["auto", "openai", "local"] = "auto"
    data_dir: Path = BACKEND_DIR / "data"
    resume_path: str = ""
    qdrant_url: str = ""
    qdrant_api_key: SecretStr = SecretStr("")
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    chat_rate_limit: str = "12/minute"
    audio_rate_limit: str = "6/minute"

    @property
    def use_openai(self) -> bool:
        return self.ai_mode == "openai" or (
            self.ai_mode == "auto" and bool(self.openai_api_key.get_secret_value())
        )

    @property
    def storage_path(self) -> Path:
        return self.data_dir if self.data_dir.is_absolute() else BACKEND_DIR / self.data_dir
