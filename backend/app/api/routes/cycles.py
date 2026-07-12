from __future__ import annotations

import csv
import io
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import ensure_agent_has_atm_access, require_role
from app.core.database import get_db_session
from app.models.affectation_atm import AffectationATM
from app.models.atm import ATM
from app.models.cassette_etat import CassetteEtat
from app.models.cycle_tresorerie import CycleTresorerie
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess

router = APIRouter(prefix="/cycles")

MAX_EXPORT_ROWS = 50_000


def _build_reappro_query(
	current_user: Utilisateur,
	terminal_ids: list[str] | None,
	date_from: date | None,
	date_to: date | None,
	statut: Literal["IN_SERVICE", "OUT_OF_SERVICE"] | None,
	search: str | None,
):
	"""Journal de réapprovisionnement : une ligne = un cycle_tresorerie, à
	plat, toutes ATM confondues (contrairement à /dab/{atm_id}/cycles qui
	scope un seul terminal). date_reappro = datetime_chargement, avec
	fallback sur datetime_dechargement si le cycle n'a pas encore de CH."""
	date_reappro_expr = func.coalesce(CycleTresorerie.datetime_chargement, CycleTresorerie.datetime_dechargement)

	query = (
		select(
			CycleTresorerie.id.label("cycle_id"),
			CycleTresorerie.atm_id.label("atm_id"),
			ATM.terminal_id.label("terminal_id"),
			ATM.nom.label("atm_nom"),
			ATM.adresse.label("localisation"),
			ATM.actif.label("atm_actif"),
			date_reappro_expr.label("date_reappro"),
			CycleTresorerie.montant_restant_avant_de.label("montant_avant_reappro"),
			CycleTresorerie.montant_charge.label("montant_reapprovisionne"),
		)
		.select_from(CycleTresorerie)
		.join(ATM, ATM.id == CycleTresorerie.atm_id)
	)

	if current_user.role == "AGENT":
		assigned_atm_ids = select(AffectationATM.atm_id).where(AffectationATM.utilisateur_id == current_user.id)
		query = query.where(CycleTresorerie.atm_id.in_(assigned_atm_ids))

	if terminal_ids:
		query = query.where(ATM.terminal_id.in_(terminal_ids))

	if date_from is not None:
		query = query.where(func.date(date_reappro_expr) >= date_from)
	if date_to is not None:
		query = query.where(func.date(date_reappro_expr) <= date_to)

	if statut == "IN_SERVICE":
		query = query.where(ATM.actif.is_(True))
	elif statut == "OUT_OF_SERVICE":
		query = query.where(ATM.actif.is_(False))

	if search:
		pattern = f"%{search.strip()}%"
		query = query.where(or_(ATM.nom.ilike(pattern), ATM.adresse.ilike(pattern)))

	return query, date_reappro_expr


def _apply_reappro_sort(query, sort: str | None, date_reappro_expr):
	if sort == "date_reappro":
		return query.order_by(date_reappro_expr.asc().nullslast())
	return query.order_by(date_reappro_expr.desc().nullslast())


def _serialize_reappro_row(row) -> dict[str, object]:
	return {
		"cycle_id": row.cycle_id,
		"atm_id": row.atm_id,
		"terminal_id": row.terminal_id,
		"atm_nom": row.atm_nom,
		"localisation": row.localisation,
		"date_reappro": row.date_reappro,
		"montant_avant_reappro": float(row.montant_avant_reappro) if row.montant_avant_reappro is not None else None,
		"montant_reapprovisionne": float(row.montant_reapprovisionne) if row.montant_reapprovisionne is not None else None,
		"statut": "IN_SERVICE" if row.atm_actif else "OUT_OF_SERVICE",
	}


@router.get("", response_model=APISuccess)
def list_reapprovisionnements(
	page: int = Query(default=1, ge=1),
	page_size: int = Query(default=100, ge=1, le=200),
	terminal_id: list[str] | None = Query(default=None),
	date_from: date | None = Query(default=None),
	date_to: date | None = Query(default=None),
	statut: Literal["IN_SERVICE", "OUT_OF_SERVICE"] | None = Query(default=None),
	search: str | None = Query(default=None),
	sort: str = Query(default="-date_reappro"),
	current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
	db: Session = Depends(get_db_session),
):
	query, date_reappro_expr = _build_reappro_query(
		current_user=current_user,
		terminal_ids=terminal_id,
		date_from=date_from,
		date_to=date_to,
		statut=statut,
		search=search,
	)

	total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)

	rows = db.execute(
		_apply_reappro_sort(query, sort, date_reappro_expr).offset((page - 1) * page_size).limit(page_size)
	).all()

	data = [_serialize_reappro_row(row) for row in rows]
	return APISuccess(data=data, meta={"total": total, "page": page, "page_size": page_size})


@router.get("/export")
def export_reapprovisionnements(
	terminal_id: list[str] | None = Query(default=None),
	date_from: date | None = Query(default=None),
	date_to: date | None = Query(default=None),
	statut: Literal["IN_SERVICE", "OUT_OF_SERVICE"] | None = Query(default=None),
	search: str | None = Query(default=None),
	sort: str = Query(default="-date_reappro"),
	current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AUDITOR")),
	db: Session = Depends(get_db_session),
):
	query, date_reappro_expr = _build_reappro_query(
		current_user=current_user,
		terminal_ids=terminal_id,
		date_from=date_from,
		date_to=date_to,
		statut=statut,
		search=search,
	)

	total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
	if total > MAX_EXPORT_ROWS:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Export trop volumineux. Affinez vos filtres pour rester sous 50 000 lignes.",
		)

	rows = db.execute(_apply_reappro_sort(query, sort, date_reappro_expr)).all()

	def generate():
		buffer = io.StringIO()
		writer = csv.writer(buffer)
		writer.writerow([
			"Terminal",
			"Nom DAB",
			"Localisation",
			"Date réappro",
			"Montant avant réappro (DT)",
			"Montant réapprovisionné (DT)",
			"Statut",
		])
		yield buffer.getvalue()
		buffer.seek(0)
		buffer.truncate(0)

		for row in rows:
			data = _serialize_reappro_row(row)
			writer.writerow([
				data["terminal_id"],
				data["atm_nom"],
				data["localisation"] or "",
				data["date_reappro"].isoformat() if data["date_reappro"] else "",
				f"{data['montant_avant_reappro']:.3f}" if data["montant_avant_reappro"] is not None else "",
				f"{data['montant_reapprovisionne']:.3f}" if data["montant_reapprovisionne"] is not None else "",
				"In Service" if data["statut"] == "IN_SERVICE" else "Out Of Service",
			])
			yield buffer.getvalue()
			buffer.seek(0)
			buffer.truncate(0)

	headers = {"Content-Disposition": 'attachment; filename="reapprovisionnements_export.csv"'}
	return StreamingResponse(generate(), media_type="text/csv", headers=headers)


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
