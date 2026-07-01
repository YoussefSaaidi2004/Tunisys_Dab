from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db_session
from app.models.tx_file import TXFile
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess

router = APIRouter(prefix="/fichiers-tx")

@router.get("", response_model=APISuccess)
def list_tx_files(
    skip: int = 0,
    limit: int = 100,
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
    db: Session = Depends(get_db_session)
):
    query = select(TXFile).order_by(TXFile.date_import.desc()).offset(skip).limit(limit)
    files = db.scalars(query).all()
    
    data = [
        {
            "id": f.id,
            "terminal_id": f.terminal_id,
            "nom_fichier": f.nom_fichier,
            "date_fichier": str(f.date_fichier),
            "date_import": str(f.date_import),
            "nb_lignes_tr": f.nb_lignes_tr,
            "statut": f.statut,
            "disponibilite": f.disponibilite,
        }
        for f in files
    ]
    return APISuccess(data=data, meta={"total": len(data), "skip": skip, "limit": limit})

