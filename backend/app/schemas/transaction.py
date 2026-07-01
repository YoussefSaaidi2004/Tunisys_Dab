from datetime import datetime

from app.schemas.common import ORMBaseSchema


class TransactionOut(ORMBaseSchema):
    id: int
    atm_id: int
    datetime_operation: datetime
    montant: float
    reste_coffre: float
    is_cardless: bool
