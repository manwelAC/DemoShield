from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class Request(BaseModel):
    id: str
    command: Literal["metadata", "scan", "export", "ping"]
    source: str | None = None
    output: str | None = None
    redactions: list[dict[str, Any]] = Field(default_factory=list)


class Response(BaseModel):
    id: str
    ok: bool = True
    event: str = "complete"
    data: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
