from datetime import datetime

from app.schemas.common import ORMBaseSchema


class UtilisateurOut(ORMBaseSchema):
    id: int
    login: str
    nom: str
    email: str | None = None
    role: str
    actif: bool
    date_creation: datetime | None = None
    derniere_connexion: datetime | None = None
