from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import BigInteger, CHAR, Date, DateTime, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CassetteEvent(Base):
    __tablename__ = "cassette_event"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tx_file_id: Mapped[int] = mapped_column(ForeignKey("tx_file.id"), nullable=False)
    atm_id: Mapped[int] = mapped_column(ForeignKey("atm.id"), nullable=False)

    num_seq_dab: Mapped[str] = mapped_column(String(20), nullable=False)
    type_evenement: Mapped[str] = mapped_column(CHAR(2), nullable=False)

    date_evenement: Mapped[date] = mapped_column(Date, nullable=False)
    heure_evenement: Mapped[time] = mapped_column(Time, nullable=False)
    datetime_evenement: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    billets_rejet: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nb_cassettes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
