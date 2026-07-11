from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Transaction(Base):
    __tablename__ = "transaction"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tx_file_id: Mapped[int] = mapped_column(ForeignKey("tx_file.id"), nullable=False)
    atm_id: Mapped[int] = mapped_column(ForeignKey("atm.id"), nullable=False)

    num_autorisation_monetique: Mapped[str] = mapped_column(String(20), nullable=False)
    date_operation: Mapped[date] = mapped_column(Date, nullable=False)
    heure_operation: Mapped[time] = mapped_column(Time, nullable=False)
    datetime_operation: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    montant: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    reste_coffre: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    numero_carte: Mapped[str | None] = mapped_column(String(20), nullable=True)
