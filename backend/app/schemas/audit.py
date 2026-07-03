from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.common import ORMBaseSchema


class JournalAuditResponse(ORMBaseSchema):
    id: int
    utilisateur_id: int | None
    utilisateur_login: str | None = None
    action: str
    ressource: str | None
    details: dict[str, Any] | None
    adresse_ip: str | None
    resultat: str | None
    horodatage: datetime


class JournalAuditListResponse(BaseModel):
    total: int
    items: list[JournalAuditResponse]