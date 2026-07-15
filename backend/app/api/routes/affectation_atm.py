from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db_session
from app.models.affectation_atm import AffectationATM
from app.models.atm import ATM
from app.models.utilisateur import Utilisateur
from app.schemas.affectation_atm import (
    AffectationATMCreate,
    AffectationATMListResponse,
    AffectationATMResponse,
)
from app.schemas.common import APISuccess
from app.services.audit import write_audit

router = APIRouter(prefix="/affectations", tags=["Affectations"])


def _get_utilisateur_or_404(db: Session, utilisateur_id: int) -> Utilisateur:
    utilisateur = db.get(Utilisateur, utilisateur_id)
    if not utilisateur:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")
    return utilisateur


def _get_atm_or_404(db: Session, atm_id: int) -> ATM:
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")
    return atm


def _format_affectation_response(affectation: AffectationATM, login: str | None, terminal_id: str | None, nom: str | None) -> AffectationATMResponse:
    return AffectationATMResponse.model_validate(affectation).model_copy(
        update={
            "utilisateur_login": login,
            "atm_terminal_id": terminal_id,
            "atm_nom": nom,
        }
    )


@router.post("", response_model=APISuccess, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("ADMIN"))])
def create_affectation(
    payload: AffectationATMCreate,
    request: Request,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    target_user = _get_utilisateur_or_404(db, payload.utilisateur_id)
    if target_user.role != "AGENT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="seul un utilisateur AGENT peut être affecté à un DAB",
        )

    atm = _get_atm_or_404(db, payload.atm_id)

    existing = db.scalar(
        select(AffectationATM.id).where(
            AffectationATM.utilisateur_id == payload.utilisateur_id,
            AffectationATM.atm_id == payload.atm_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="cet agent est déjà affecté à ce DAB",
        )

    affectation = AffectationATM(utilisateur_id=payload.utilisateur_id, atm_id=payload.atm_id)
    db.add(affectation)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="cet agent est déjà affecté à ce DAB",
        ) from None

    db.refresh(affectation)

    write_audit(
        db,
        action="AFFECTATION_ATM_CREATE",
        utilisateur_id=current_user.id,
        ressource=f"affectation:{affectation.id}",
        details={"utilisateur_id": payload.utilisateur_id, "atm_id": payload.atm_id},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    result = _format_affectation_response(affectation, target_user.login, atm.terminal_id, atm.nom)
    return APISuccess(data=result.model_dump())


@router.get("", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN", "SUPERVISOR"))])
def list_affectations(
    db: Session = Depends(get_db_session),
    utilisateur_id: int | None = Query(default=None),
    atm_id: int | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    query = (
        select(AffectationATM, Utilisateur.login, ATM.terminal_id, ATM.nom)
        .join(Utilisateur, Utilisateur.id == AffectationATM.utilisateur_id)
        .join(ATM, ATM.id == AffectationATM.atm_id)
    )
    count_query = select(func.count()).select_from(AffectationATM)

    if utilisateur_id is not None:
        query = query.where(AffectationATM.utilisateur_id == utilisateur_id)
        count_query = count_query.where(AffectationATM.utilisateur_id == utilisateur_id)
    if atm_id is not None:
        query = query.where(AffectationATM.atm_id == atm_id)
        count_query = count_query.where(AffectationATM.atm_id == atm_id)

    total = db.scalar(count_query) or 0
    rows = db.execute(query.order_by(AffectationATM.id).offset(skip).limit(limit)).all()

    items = [
        _format_affectation_response(affectation, login, terminal_id, nom)
        for affectation, login, terminal_id, nom in rows
    ]

    result = AffectationATMListResponse(total=total, items=items)
    return APISuccess(data=result.model_dump())


@router.delete("/{affectation_id}", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN"))])
def delete_affectation(
    affectation_id: int,
    request: Request,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    affectation = db.get(AffectationATM, affectation_id)
    if not affectation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Affectation introuvable")

    utilisateur_id = affectation.utilisateur_id
    atm_id = affectation.atm_id

    db.delete(affectation)
    db.commit()

    write_audit(
        db,
        action="AFFECTATION_ATM_DELETE",
        utilisateur_id=current_user.id,
        ressource=f"affectation:{affectation_id}",
        details={"utilisateur_id": utilisateur_id, "atm_id": atm_id},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(data={"message": "Affectation supprimée avec succès"})