from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_agent_has_atm_access, get_current_user, require_role
from app.core.database import get_db_session
from app.models.affectation_atm import AffectationATM
from app.models.atm import ATM
from app.models.utilisateur import Utilisateur
from app.schemas.atm import ATMOut
from app.schemas.common import APISuccess

router = APIRouter(prefix="/dab")


@router.get("", response_model=APISuccess)
def list_dab(
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT")),
    db: Session = Depends(get_db_session),
):
    query = select(ATM)

    # Pour AGENT, on restreint strictement aux DAB assignés.
    if current_user.role == "AGENT":
        assigned_subq = (
            select(AffectationATM.atm_id)
            .where(AffectationATM.utilisateur_id == current_user.id)
            .subquery()
        )
        query = query.where(ATM.id.in_(select(assigned_subq.c.atm_id)))

    atms = db.scalars(query.order_by(ATM.terminal_id.asc())).all()
    data = [ATMOut.model_validate(atm).model_dump() for atm in atms]
    return APISuccess(data=data, meta={"total": len(data), "page": 1})


@router.get("/{atm_id}", response_model=APISuccess)
def get_dab_detail(
    atm_id: int,
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT")),
    db: Session = Depends(get_db_session),
):
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    if current_user.role == "AGENT":
        ensure_agent_has_atm_access(db, current_user.id, atm_id)

    return APISuccess(data=ATMOut.model_validate(atm).model_dump())

@router.get("/{atm_id}/transactions", response_model=APISuccess)
def get_dab_transactions(
    atm_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
    db: Session = Depends(get_db_session),
):
    # Authorization
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    if current_user.role == "AGENT":
        ensure_agent_has_atm_access(db, current_user.id, atm_id)

    # Fetch transactions
    from app.models.transaction import Transaction
    query = (
        select(Transaction)
        .where(Transaction.atm_id == atm_id)
        .order_by(Transaction.datetime_operation.desc(), Transaction.heure_operation.desc())
        .offset(skip)
        .limit(limit)
    )
    transactions = db.scalars(query).all()

    data = [
        {
            "id": t.id,
            "num_seq_dab": t.num_seq_dab,
            "date_operation": str(t.date_operation),
            "heure_operation": str(t.heure_operation),
            "montant": float(t.montant),
            "reste_coffre": float(t.reste_coffre),
            "is_cardless": t.is_cardless
        }
        for t in transactions
    ]
    return APISuccess(data=data, meta={"total": len(data), "skip": skip, "limit": limit})
