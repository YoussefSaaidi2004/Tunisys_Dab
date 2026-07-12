import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import ensure_agent_has_atm_access, require_role
from app.api.routes.cycles import serialize_cycle
from app.core.database import get_db_session
from app.core.security import mask_pan
from app.models.affectation_atm import AffectationATM
from app.models.atm import ATM
from app.models.atm_id_historique import ATMIdHistorique
from app.models.cassette_event import CassetteEvent
from app.models.cycle_tresorerie import CycleTresorerie
from app.models.transaction import Transaction
from app.models.tx_file import TXFile
from app.models.utilisateur import Utilisateur
from app.schemas.atm import ATMCreate, ATMOut, ATMUpdate
from app.schemas.common import APISuccess
from app.services.audit import write_audit

router = APIRouter(prefix="/dab")


def _serialize_atm(atm: ATM) -> dict[str, object]:
    return ATMOut.model_validate(atm).model_dump()


def _apply_atm_payload(atm: ATM, payload: ATMCreate | ATMUpdate) -> ATM:
    data = payload.model_dump(exclude_unset=True)

    for field, value in data.items():
        setattr(atm, field, value)

    return atm


@router.get("", response_model=APISuccess)
def list_dab(
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
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
    data = [_serialize_atm(atm) for atm in atms]
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

    return APISuccess(data=_serialize_atm(atm))


@router.post("", response_model=APISuccess, status_code=status.HTTP_201_CREATED)
def create_dab(
    payload: ATMCreate,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    atm = ATM()
    _apply_atm_payload(atm, payload)

    db.add(atm)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="terminal_id déjà utilisé")

    db.refresh(atm)
    return APISuccess(data=_serialize_atm(atm))


@router.put("/{atm_id}", response_model=APISuccess)
def update_dab(
    atm_id: int,
    payload: ATMUpdate,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    _apply_atm_payload(atm, payload)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="terminal_id déjà utilisé")

    db.refresh(atm)
    return APISuccess(data=_serialize_atm(atm))


@router.delete("/{atm_id}", response_model=APISuccess)
def delete_dab(
    atm_id: int,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    # Suppression en cascade : les tables enfants n'ont pas de ON DELETE CASCADE
    # en base, on doit donc purger les dépendances dans le bon ordre avant de
    # supprimer le DAB lui-même.
    db.execute(delete(CycleTresorerie).where(CycleTresorerie.atm_id == atm_id))
    db.execute(delete(CassetteEvent).where(CassetteEvent.atm_id == atm_id))
    db.execute(delete(Transaction).where(Transaction.atm_id == atm_id))
    db.execute(delete(TXFile).where(TXFile.atm_id == atm_id))
    db.execute(delete(ATMIdHistorique).where(ATMIdHistorique.atm_id == atm_id))
    db.execute(delete(AffectationATM).where(AffectationATM.atm_id == atm_id))
    db.delete(atm)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Impossible de supprimer ce DAB")

    return APISuccess(data={"id": atm_id})

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
            "num_autorisation_monetique": t.num_autorisation_monetique,
            "date_operation": str(t.date_operation),
            "heure_operation": str(t.heure_operation),
            "montant": float(t.montant),
            "reste_coffre": float(t.reste_coffre),
            "numero_carte": mask_pan(t.numero_carte)
        }
        for t in transactions
    ]
    return APISuccess(data=data, meta={"total": len(data), "skip": skip, "limit": limit})


def _build_dab_cycles_query(atm_id: int, date_debut: date | None, date_fin: date | None):
    query = select(CycleTresorerie).where(CycleTresorerie.atm_id == atm_id)

    if date_debut is not None:
        query = query.where(func.date(CycleTresorerie.datetime_dechargement) >= date_debut)
    if date_fin is not None:
        query = query.where(func.date(CycleTresorerie.datetime_dechargement) <= date_fin)

    return query


def _extract_cycle_export_rows(cycles: list[CycleTresorerie], atm: ATM) -> list[tuple]:
    # Extraction immédiate en valeurs simples : le write_audit() appelé plus loin
    # fait un commit() qui expire ces objets ORM, et le générateur ci-dessous n'est
    # consommé par le StreamingResponse qu'une fois la session déjà fermée.
    return [
        (
            atm.terminal_id,
            atm.nom,
            cycle.datetime_dechargement.isoformat() if cycle.datetime_dechargement else "",
            cycle.datetime_chargement.isoformat() if cycle.datetime_chargement else "",
            f"{float(cycle.montant_charge):.3f}" if cycle.montant_charge is not None else "",
            f"{float(cycle.montant_restant_avant_de):.3f}" if cycle.montant_restant_avant_de is not None else "",
            f"{float(cycle.montant_distribue):.3f}" if cycle.montant_distribue is not None else "",
            cycle.nb_billets_rejet,
        )
        for cycle in cycles
    ]


def _csv_export_generator_cycles(rows: list[tuple]) -> object:
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow([
        "terminal_id",
        "nom_dab",
        "datetime_dechargement",
        "datetime_chargement",
        "montant_charge",
        "montant_restant_avant_de",
        "montant_distribue",
        "nb_billets_rejet",
    ])
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)

    for row in rows:
        writer.writerow(row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


@router.get("/{atm_id}/cycles", response_model=APISuccess)
def list_dab_cycles(
    atm_id: int,
    date_debut: date | None = Query(default=None),
    date_fin: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
    db: Session = Depends(get_db_session),
):
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    if current_user.role == "AGENT":
        ensure_agent_has_atm_access(db, current_user.id, atm_id)

    query = _build_dab_cycles_query(atm_id, date_debut, date_fin)

    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)

    cycles = db.scalars(
        query.order_by(CycleTresorerie.datetime_dechargement.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    data = [serialize_cycle(cycle, atm) for cycle in cycles]
    return APISuccess(data=data, meta={"total": total, "page": page, "page_size": page_size})


@router.get("/{atm_id}/cycles/export")
def export_dab_cycles(
    atm_id: int,
    request: Request,
    date_debut: date | None = Query(default=None),
    date_fin: date | None = Query(default=None),
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AUDITOR")),
    db: Session = Depends(get_db_session),
):
    atm = db.get(ATM, atm_id)
    if not atm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DAB introuvable")

    query = _build_dab_cycles_query(atm_id, date_debut, date_fin)
    cycles = db.scalars(query.order_by(CycleTresorerie.datetime_dechargement.desc())).all()
    export_rows = _extract_cycle_export_rows(cycles, atm)

    write_audit(
        db,
        action="EXPORT_RAPPORT",
        utilisateur_id=current_user.id,
        ressource=f"cycles:{atm.terminal_id}",
        details={
            "date_debut": date_debut.isoformat() if date_debut else None,
            "date_fin": date_fin.isoformat() if date_fin else None,
            "total": len(cycles),
        },
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    filename = f"cycles_{atm.terminal_id}_{date.today().isoformat()}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(_csv_export_generator_cycles(export_rows), media_type="text/csv", headers=headers)
