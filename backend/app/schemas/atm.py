from pydantic import BaseModel
from datetime import datetime

from app.schemas.common import ORMBaseSchema


class ATMOut(ORMBaseSchema):
    id: int
    terminal_id: str
    nom: str
    adresse: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    ip_address: str | None = None
    ssh_port: int | None = None
    ssh_login: str | None = None
    actif: bool
    date_creation: datetime | None = None
    notes: str | None = None
    cardless_pan: str | None = None


class ATMCreate(BaseModel):
    terminal_id: str
    nom: str
    adresse: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    ip_address: str | None = None
    ssh_port: int | None = None
    ssh_login: str | None = None
    ssh_password: str | None = None
    chemin_remote: str | None = None
    actif: bool = True
    notes: str | None = None
    cardless_pan: str | None = None
