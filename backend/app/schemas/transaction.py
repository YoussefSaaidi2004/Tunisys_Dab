from datetime import datetime

from pydantic import field_validator

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
