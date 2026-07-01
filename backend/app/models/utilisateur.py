from __future__ import annotations

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Utilisateur(Base):
    __tablename__ = "utilisateur"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    mot_de_passe_hash: Mapped[str] = mapped_column(nullable=False)
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(150), unique=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    actif: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    date_creation: Mapped[object | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    derniere_connexion: Mapped[object | None] = mapped_column(DateTime(timezone=True))
