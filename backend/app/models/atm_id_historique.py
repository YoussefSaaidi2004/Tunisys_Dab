from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ATMIdHistorique(Base):
    __tablename__ = "atm_id_historique"
    __table_args__ = (UniqueConstraint("atm_id", "terminal_id_ancien", name="uq_atm_id_historique"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    atm_id: Mapped[int] = mapped_column(ForeignKey("atm.id"), nullable=False)
    terminal_id_ancien: Mapped[str] = mapped_column(String(20), nullable=False)
    terminal_id_nouveau: Mapped[str] = mapped_column(String(20), nullable=False)
    date_changement: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
