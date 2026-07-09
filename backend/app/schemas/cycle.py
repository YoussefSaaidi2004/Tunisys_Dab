from datetime import datetime

from app.schemas.common import ORMBaseSchema


class CassetteDetailItem(ORMBaseSchema):
    numero_caisse: int
    denomination: int
    nb_billets: int
    montant: float


class CycleOut(ORMBaseSchema):
    id: int
    atm_id: int
    terminal_id: str
    nom_dab: str
    datetime_dechargement: datetime
    datetime_chargement: datetime | None
    montant_charge: float | None
    montant_restant_avant_de: float | None
    montant_distribue: float | None
    nb_billets_rejet: int


class CycleDetailOut(CycleOut):
    cassettes: list[CassetteDetailItem]
