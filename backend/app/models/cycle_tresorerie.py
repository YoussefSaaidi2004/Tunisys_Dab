from __future__ import annotations

from datetime import datetime

from sqlalchemy import Computed, DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CycleTresorerie(Base):
    __tablename__ = "cycle_tresorerie"

    id: Mapped[int] = mapped_column(primary_key=True)
    atm_id: Mapped[int] = mapped_column(ForeignKey("atm.id"), nullable=False)

    datetime_dechargement: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    datetime_chargement: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    montant_charge: Mapped[float | None] = mapped_column(Numeric(12, 3))
    montant_restant_avant_de: Mapped[float | None] = mapped_column(Numeric(12, 3))
    montant_distribue: Mapped[float | None] = mapped_column(
        Numeric(12, 3), Computed("montant_charge - montant_restant_avant_de", persisted=True)
    )
    nb_billets_rejet: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    cassette_event_de_id: Mapped[int | None] = mapped_column(ForeignKey("cassette_event.id"))
    cassette_event_ch_id: Mapped[int | None] = mapped_column(ForeignKey("cassette_event.id"))
