from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

RoleType = Literal["ADMIN", "SUPERVISOR", "AGENT", "AUDITOR"]


def _validate_password_strength(value: str) -> str:
    if len(value) < 10:
        raise ValueError("Le mot de passe doit contenir au moins 10 caractères")
    if not any(c.isdigit() for c in value):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre")
    if not any(c.isalpha() for c in value):
        raise ValueError("Le mot de passe doit contenir au moins une lettre")
    return value


class UtilisateurCreate(BaseModel):
    login: str = Field(min_length=3, max_length=50)
    mot_de_passe: str = Field(min_length=10, max_length=128)
    nom: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    role: RoleType
    actif: bool = True

    @field_validator("mot_de_passe")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return _validate_password_strength(value)


class UtilisateurUpdate(BaseModel):
    """Mise à jour partielle : tous les champs sont optionnels."""

    nom: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    role: RoleType | None = None
    actif: bool | None = None
    mot_de_passe: str | None = Field(default=None, min_length=10, max_length=128)

    @field_validator("mot_de_passe")
    @classmethod
    def _check_password(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_password_strength(value)


class UtilisateurResponse(BaseModel):
    """Représentation publique d'un utilisateur (jamais le hash du mot de passe)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str
    nom: str
    email: str | None
    role: str
    actif: bool
    date_creation: datetime | None
    derniere_connexion: datetime | None


class UtilisateurListResponse(BaseModel):
    total: int
    items: list[UtilisateurResponse]