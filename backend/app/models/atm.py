from __future__ import annotations

from sqlalchemy import Boolean, DateTime, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ATM(Base):
    __tablename__ = "atm"
    __table_args__ = (UniqueConstraint("terminal_id", name="uq_atm_terminal_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    terminal_id: Mapped[str] = mapped_column(String(20), nullable=False)
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    adresse: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    ssh_port: Mapped[int | None] = mapped_column(default=22)
    ssh_login: Mapped[str | None] = mapped_column(String(100))
    ssh_password: Mapped[str | None] = mapped_column(Text)
    chemin_remote: Mapped[str | None] = mapped_column(String(255))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    date_creation: Mapped[object | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[str | None] = mapped_column(Text)
    cardless_pan: Mapped[str | None] = mapped_column(String(20), default="9999999999999999")
