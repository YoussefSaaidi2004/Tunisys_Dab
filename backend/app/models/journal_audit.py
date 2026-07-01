from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JournalAudit(Base):
    __tablename__ = "journal_audit"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    utilisateur_id: Mapped[int | None] = mapped_column(ForeignKey("utilisateur.id"))

    action: Mapped[str] = mapped_column(String(50), nullable=False)
    ressource: Mapped[str | None] = mapped_column(String(50))
    details: Mapped[dict | None] = mapped_column(JSONB)

    adresse_ip: Mapped[str | None] = mapped_column(String(45))
    resultat: Mapped[str | None] = mapped_column(String(10))

    horodatage: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
