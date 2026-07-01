from __future__ import annotations

from datetime import date

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TXFile(Base):
    __tablename__ = "tx_file"
    __table_args__ = (UniqueConstraint("terminal_id", "date_fichier", name="uq_tx_file_terminal_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    atm_id: Mapped[int] = mapped_column(ForeignKey("atm.id"), nullable=False)
    terminal_id: Mapped[str] = mapped_column(String(20), nullable=False)
    nom_fichier: Mapped[str] = mapped_column(String(100), nullable=False)
    date_fichier: Mapped[date] = mapped_column(Date, nullable=False)
    chemin_local: Mapped[str | None] = mapped_column(Text)
    date_import: Mapped[object | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    nb_lignes_tr: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nb_lignes_ch: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nb_lignes_de: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    statut: Mapped[str] = mapped_column(String(20), default="IMPORTE", nullable=False)
    disponibilite: Mapped[str] = mapped_column(String(20), nullable=False)
    message_erreur: Mapped[str | None] = mapped_column(Text)
