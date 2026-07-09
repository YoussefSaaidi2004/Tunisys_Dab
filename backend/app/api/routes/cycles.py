from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_agent_has_atm_access, require_role
from app.core.database import get_db_session
from app.models.atm import ATM
from app.models.cassette_etat import CassetteEtat
from app.models.cycle_tresorerie import CycleTresorerie
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess

router = APIRouter(prefix="/cycles")


def serialize_cycle(cycle: CycleTresorerie, atm: ATM) -> dict[str, object]:
    return {
        "id": cycle.id,
        "atm_id": cycle.atm_id,
        "terminal_id": atm.terminal_id,
        "nom_dab": atm.nom,
        "datetime_dechargement": cycle.datetime_dechargement,
        "datetime_chargement": cycle.datetime_chargement,
        "montant_charge": float(cycle.montant_charge) if cycle.montant_charge is not None else None,
        "montant_restant_avant_de": float(cycle.montant_restant_avant_de) if cycle.montant_restant_avant_de is not None else None,
        "montant_distribue": float(cycle.montant_distribue) if cycle.montant_distribue is not None else None,
        "nb_billets_rejet": cycle.nb_billets_rejet,
    }


def serialize_cassette_state(cassette_state: CassetteEtat) -> dict[str, object]:
    return {
        "numero_caisse": cassette_state.numero_caisse,
        "denomination": cassette_state.denomination,
        "nb_billets": cassette_state.nb_billets,
        "montant": float(cassette_state.montant),
    }


@router.get("/{cycle_id}", response_model=APISuccess)
def get_cycle_detail(
    cycle_id: int,
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
    db: Session = Depends(get_db_session),
):
    row = db.execute(
        select(CycleTresorerie, ATM)
        .join(ATM, ATM.id == CycleTresorerie.atm_id)
        .where(CycleTresorerie.id == cycle_id)
    ).one_or_none()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle introuvable")

    cycle, atm = row

    if current_user.role == "AGENT":
        ensure_agent_has_atm_access(db, current_user.id, cycle.atm_id)

    # Ventilation par cassette : toujours basée sur le CH final (cassette_event_ch_id),
    # jamais sur le DE qui déclenche le cycle.
    caisses = []
    if cycle.cassette_event_ch_id is not None:
        caisses = db.scalars(
            select(CassetteEtat)
            .where(CassetteEtat.cassette_event_id == cycle.cassette_event_ch_id)
            .order_by(CassetteEtat.numero_caisse.asc())
        ).all()

    data = {
        **serialize_cycle(cycle, atm),
        "cassettes": [serialize_cassette_state(caisse) for caisse in caisses],
    }
    return APISuccess(data=data)
