from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMBaseSchema


class AffectationATMCreate(BaseModel):
    utilisateur_id: int
    atm_id: int


class AffectationATMResponse(ORMBaseSchema):
    id: int
    utilisateur_id: int
    atm_id: int
    date_affectation: datetime | None
    utilisateur_login: str | None = None
    atm_terminal_id: str | None = None
    atm_nom: str | None = None


class AffectationATMListResponse(BaseModel):
    total: int
    items: list[AffectationATMResponse]


class AffectationDabItem(BaseModel):
    atm_id: int
    terminal_id: str
    nom: str
    actif: bool
    date_affectation: datetime | None = None


class AffectationSetRequest(BaseModel):
    atm_ids: list[int]


class AffectationSetResult(BaseModel):
    ajoutes: list[int]
    retires: list[int]
    inchanges: list[int]
    total: int