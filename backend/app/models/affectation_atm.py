from __future__ import annotations

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AffectationATM(Base):
    __tablename__ = "affectation_atm"
    __table_args__ = (UniqueConstraint("utilisateur_id", "atm_id", name="uq_affectation_user_atm"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(ForeignKey("utilisateur.id"), nullable=False)
    atm_id: Mapped[int] = mapped_column(ForeignKey("atm.id"), nullable=False)
    date_affectation: Mapped[object | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
