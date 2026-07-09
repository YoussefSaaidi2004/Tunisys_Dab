from pydantic import BaseModel, Field
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
    terminal_id: str = Field(..., min_length=1, max_length=20)
    nom: str = Field(..., min_length=1, max_length=100)
    adresse: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    ip_address: str | None = Field(default=None, max_length=45)
    ssh_port: int | None = Field(default=22, ge=1, le=65535)
    ssh_login: str | None = Field(default=None, max_length=100)
    ssh_password: str | None = Field(default=None, max_length=255)
    chemin_remote: str | None = Field(default=None, max_length=255)
    actif: bool = True
    notes: str | None = Field(default=None, max_length=1000)
    cardless_pan: str | None = Field(default=None, max_length=20)


class ATMUpdate(BaseModel):
    terminal_id: str | None = Field(default=None, min_length=1, max_length=20)
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    adresse: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    ip_address: str | None = Field(default=None, max_length=45)
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    ssh_login: str | None = Field(default=None, max_length=100)
    ssh_password: str | None = Field(default=None, max_length=255)
    chemin_remote: str | None = Field(default=None, max_length=255)
    actif: bool | None = None
    notes: str | None = Field(default=None, max_length=1000)
    cardless_pan: str | None = Field(default=None, max_length=20)
