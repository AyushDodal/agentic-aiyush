from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1500)
    history: list[Turn] = Field(default_factory=list, max_length=12)

    @field_validator("message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Please enter a question.")
        return value.strip()


class Source(BaseModel):
    id: str
    document: str
    page: int | None = None
    text: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source] = Field(default_factory=list)
    grounded: bool = False
    mode: Literal["openai", "local", "unavailable"]


class GroundedAnswer(BaseModel):
    answer: str
    source_ids: list[str]
    supported: bool


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
