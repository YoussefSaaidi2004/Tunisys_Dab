from __future__ import annotations

from sqlalchemy import BigInteger, Computed, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CassetteEtat(Base):
    __tablename__ = "cassette_etat"
    __table_args__ = (
        UniqueConstraint("cassette_event_id", "numero_caisse", name="uq_cassette_etat_event_caisse"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cassette_event_id: Mapped[int] = mapped_column(ForeignKey("cassette_event.id"), nullable=False)
    numero_caisse: Mapped[int] = mapped_column(Integer, nullable=False)
    denomination: Mapped[int] = mapped_column(Integer, nullable=False)
    nb_billets: Mapped[int] = mapped_column(Integer, nullable=False)
    montant: Mapped[float] = mapped_column(Numeric(12, 3), Computed("nb_billets * denomination", persisted=True))
