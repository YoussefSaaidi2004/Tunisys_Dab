from datetime import datetime

from app.schemas.common import ORMBaseSchema


class CassetteEtatOut(ORMBaseSchema):
	numero_caisse: int
	denomination: int
	nb_billets: int
	montant: float


class CassetteEventOut(ORMBaseSchema):
	id: int
	atm_id: int
	type_evenement: str
	datetime_evenement: datetime | None
	billets_rejet: int
	nb_cassettes: int