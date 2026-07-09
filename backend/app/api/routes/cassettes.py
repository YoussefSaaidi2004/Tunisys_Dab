from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db_session
from app.models.atm import ATM
from app.models.cassette_etat import CassetteEtat
from app.models.cassette_event import CassetteEvent
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess

router = APIRouter(prefix="/cassettes")

MAX_EXPORT_ROWS = 50_000


def _normalize_date_range(date_debut: date | None, date_fin: date | None) -> tuple[date, date]:
	today = date.today()

	if date_debut is None and date_fin is None:
		date_fin = today
		date_debut = today - timedelta(days=6)
	elif date_debut is None:
		date_debut = date_fin
	elif date_fin is None:
		date_fin = date_debut

	if date_debut > date_fin:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="date_debut doit être antérieure ou égale à date_fin")

	return date_debut, date_fin


def _build_cassette_event_query(
	atm_ids: list[int] | None,
	type_evenement: str | None,
	date_debut: date,
	date_fin: date,
):
	query = select(CassetteEvent, ATM).join(ATM, ATM.id == CassetteEvent.atm_id)

	if atm_ids:
		query = query.where(CassetteEvent.atm_id.in_(atm_ids))

	if type_evenement:
		query = query.where(CassetteEvent.type_evenement == type_evenement)

	query = query.where(CassetteEvent.date_evenement.between(date_debut, date_fin))
	return query


def _count_cassette_events(db: Session, query) -> int:
	count_stmt = select(func.count()).select_from(query.subquery())
	return int(db.scalar(count_stmt) or 0)


def _serialize_cassette_event(event: CassetteEvent, atm: ATM) -> dict[str, object]:
	return {
		"id": event.id,
		"atm_id": event.atm_id,
		"terminal_id": atm.terminal_id,
		"atm_nom": atm.nom,
		"type_evenement": event.type_evenement,
		"date_evenement": event.date_evenement,
		"heure_evenement": event.heure_evenement,
		"billets_rejet": event.billets_rejet,
		"nb_cassettes": event.nb_cassettes,
	}


def _serialize_cassette_state(cassette_state: CassetteEtat) -> dict[str, object]:
	return {
		"numero_caisse": cassette_state.numero_caisse,
		"denomination": cassette_state.denomination,
		"nb_billets": cassette_state.nb_billets,
		"montant": float(cassette_state.montant),
	}


def _csv_export_generator(rows) -> object:
	buffer = io.StringIO()
	writer = csv.writer(buffer)

	writer.writerow([
		"Terminal",
		"Date",
		"Heure",
		"Type",
		"Billets rejet",
		"Nb cassettes",
	])
	yield buffer.getvalue()
	buffer.seek(0)
	buffer.truncate(0)

	for event, atm in rows:
		writer.writerow([
			f"{atm.nom} ({atm.terminal_id})",
			event.date_evenement.isoformat(),
			event.heure_evenement.isoformat(),
			event.type_evenement,
			event.billets_rejet,
			event.nb_cassettes,
		])
		yield buffer.getvalue()
		buffer.seek(0)
		buffer.truncate(0)


@router.get("", response_model=APISuccess)
def list_cassette_events(
	atm_id: list[int] | None = Query(default=None),
	type_evenement: Literal["CH", "DE"] | None = Query(default=None),
	date_debut: date | None = Query(default=None),
	date_fin: date | None = Query(default=None),
	skip: int = Query(default=0, ge=0),
	limit: int = Query(default=50, ge=1, le=500),
	_current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR")),
	db: Session = Depends(get_db_session),
):
	date_debut, date_fin = _normalize_date_range(date_debut, date_fin)
	base_query = _build_cassette_event_query(atm_ids=atm_id, type_evenement=type_evenement, date_debut=date_debut, date_fin=date_fin)

	total = _count_cassette_events(db, base_query)
	rows = db.execute(
		base_query.order_by(
			CassetteEvent.datetime_evenement.desc().nullslast(),
			CassetteEvent.date_evenement.desc(),
			CassetteEvent.heure_evenement.desc(),
		).offset(skip).limit(limit)
	).all()

	data = [_serialize_cassette_event(event, atm) for event, atm in rows]
	return APISuccess(data=data, meta={"total": total, "skip": skip, "limit": limit})


@router.get("/export")
def export_cassette_events(
	format: Literal["csv"] = Query(default="csv"),
	atm_id: list[int] | None = Query(default=None),
	type_evenement: Literal["CH", "DE"] | None = Query(default=None),
	date_debut: date | None = Query(default=None),
	date_fin: date | None = Query(default=None),
	_current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR")),
	db: Session = Depends(get_db_session),
):
	if format != "csv":
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Format d’export invalide")

	date_debut, date_fin = _normalize_date_range(date_debut, date_fin)
	base_query = _build_cassette_event_query(atm_ids=atm_id, type_evenement=type_evenement, date_debut=date_debut, date_fin=date_fin)

	total = _count_cassette_events(db, base_query)
	if total > MAX_EXPORT_ROWS:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Export trop volumineux. Affinez vos filtres pour rester sous 50 000 lignes.",
		)

	rows = db.execute(
		base_query.order_by(
			CassetteEvent.datetime_evenement.desc().nullslast(),
			CassetteEvent.date_evenement.desc(),
			CassetteEvent.heure_evenement.desc(),
		)
	).all()

	headers = {"Content-Disposition": 'attachment; filename="cassettes_export.csv"'}
	return StreamingResponse(_csv_export_generator(rows), media_type="text/csv", headers=headers)


@router.get("/{event_id}", response_model=APISuccess)
def get_cassette_event_detail(
	event_id: int,
	_current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR")),
	db: Session = Depends(get_db_session),
):
	row = db.execute(
		select(CassetteEvent, ATM)
		.join(ATM, ATM.id == CassetteEvent.atm_id)
		.where(CassetteEvent.id == event_id)
	).one_or_none()

	if row is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Événement cassette introuvable")

	event, atm = row
	caisses = db.scalars(
		select(CassetteEtat)
		.where(CassetteEtat.cassette_event_id == event.id)
		.order_by(CassetteEtat.numero_caisse.asc())
	).all()

	data = {
		**_serialize_cassette_event(event, atm),
		"datetime_evenement": event.datetime_evenement,
		"caisses": [_serialize_cassette_state(cassette_state) for cassette_state in caisses],
	}
	return APISuccess(data=data)
