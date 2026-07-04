from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db_session
from app.models.tx_file import TXFile
from app.models.utilisateur import Utilisateur
from app.schemas.collecte import TXFileResponse
from app.schemas.common import APISuccess
from app.services.audit import write_audit
from app.services.collecte import run_collecte_et_import

router = APIRouter(prefix="/collecte", tags=["Collecte"])


@router.post("/declencher", response_model=APISuccess, status_code=status.HTTP_202_ACCEPTED)
def declencher_collecte(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    """Lance la collecte des fichiers TX et l'import en base en arrière-plan."""

    write_audit(
        db,
        action="COLLECTE_DECLENCHEE",
        utilisateur_id=current_user.id,
        ressource="collecte:tx_files",
        details={"declencheur": "api"},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    background_tasks.add_task(run_collecte_et_import)

    return APISuccess(data={"message": "Collecte lancée en arrière-plan"})


@router.get("/statut", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN", "SUPERVISOR", "AUDITOR"))])
def get_collecte_statut(
    db: Session = Depends(get_db_session),
):
    """Retourne les 10 derniers fichiers TX importés pour vérifier le statut de la dernière collecte."""

    query = select(TXFile).order_by(TXFile.date_import.desc()).limit(10)
    tx_files = db.scalars(query).all()

    items = [TXFileResponse.model_validate(tf) for tf in tx_files]
    return APISuccess(data={"items": items})

