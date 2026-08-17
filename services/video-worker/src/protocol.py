from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class Request(BaseModel):
    id: str
    command: Literal["metadata", "scan", "export", "ping"]
    source: str | None = None
    output: str | None = None
    redactions: list[dict[str, Any]] = Field(default_factory=list)
    sampleIntervalSeconds: float = Field(default=0.5, ge=0.25, le=10)
    heartbeatSeconds: float = Field(default=2.0, ge=0.5, le=30)
    changeThreshold: float = Field(default=0.035, ge=0.005, le=0.5)
    ocrMaxWidth: int = Field(default=1280, ge=640, le=3840)
    ocrBatchSize: int = Field(default=4, ge=1, le=16)


class Response(BaseModel):
    id: str
    ok: bool = True
    event: str = "complete"
    data: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
