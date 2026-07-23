from datetime import datetime

from pydantic import BaseModel, field_validator

from app.core.security import mask_pan
from app.schemas.common import ORMBaseSchema


class TransactionOut(ORMBaseSchema):
    id: int
    atm_id: int
    num_autorisation_monetique: str
    datetime_operation: datetime
    montant: float
    reste_coffre: float
    numero_carte: str | None

    @field_validator("numero_carte")
    @classmethod
    def _mask_numero_carte(cls, value: str | None) -> str | None:
        return mask_pan(value)


class DistributionParDabItem(BaseModel):
    atm_id: int
    terminal_id: str
    nom: str
    montant_total: float
    nb_transactions: int
    pourcentage: float
