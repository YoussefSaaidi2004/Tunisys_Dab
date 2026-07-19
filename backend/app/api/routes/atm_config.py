from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db_session
from app.models.atm import ATM
from app.models.utilisateur import Utilisateur
from app.schemas.atm_config import SSHConfigUpdate
from app.schemas.common import APISuccess
from app.services.audit import write_audit

router = APIRouter(prefix="/dab", tags=["DAB"])


@router.patch("/{atm_id}/ssh-config", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN"))])
def update_ssh_config(
    atm_id: int,
    payload: SSHConfigUpdate,
    request: Request,
    current_user: Utilisateur = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    atm.ssh_login = payload.ssh_login
    atm.ssh_password = payload.ssh_password
    if payload.ssh_port is not None:
        atm.ssh_port = payload.ssh_port

    db.commit()
    db.refresh(atm)

    write_audit(
        db,
        action="ATM_SSH_CONFIG_UPDATE",
        utilisateur_id=current_user.id,
        ressource=f"atm:{atm_id}",
        details={"atm_id": atm_id},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(data={"message": "Configuration SSH mise à jour avec succès"})