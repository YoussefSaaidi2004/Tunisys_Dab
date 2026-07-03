from datetime import date, datetime

from app.schemas.common import ORMBaseSchema


class TXFileResponse(ORMBaseSchema):
    id: int
    terminal_id: str
    nom_fichier: str
    statut: str
    disponibilite: str
    date_import: datetime | None


class CollecteDeclarativeResponse(ORMBaseSchema):
    message: str
