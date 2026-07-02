from __future__ import annotations

import csv
import io
from datetime import date, time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db_session
from app.models.affectation_atm import AffectationATM
from app.models.atm import ATM
from app.models.transaction import Transaction
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess

router = APIRouter(prefix="/transactions")

MAX_EXPORT_ROWS = 50_000


def _normalize_date_range(date_debut: date | None, date_fin: date | None) -> tuple[date, date]:
	today = date.today()

	if date_debut is None and date_fin is None:
		date_debut = today
		date_fin = today
	elif date_debut is None:
		date_debut = date_fin
	elif date_fin is None:
		date_fin = date_debut

	if date_debut > date_fin:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="date_debut doit être antérieure ou égale à date_fin")

	return date_debut, date_fin


def _validate_montant_range(montant_min: float | None, montant_max: float | None) -> None:
	if montant_min is not None and montant_max is not None and montant_min > montant_max:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="montant_min doit être inférieur ou égal à montant_max")


def _apply_transaction_filters(
	query,
	current_user: Utilisateur,
	atm_ids: list[int] | None,
	date_debut: date,
	date_fin: date,
	heure_debut: time | None,
	heure_fin: time | None,
	montant_min: float | None,
	montant_max: float | None,
	reste_coffre_max: float | None,
	is_cardless: bool | None,
):
	if current_user.role == "AGENT":
		assigned_atm_ids = select(AffectationATM.atm_id).where(AffectationATM.utilisateur_id == current_user.id)
		query = query.where(Transaction.atm_id.in_(assigned_atm_ids))
		if atm_ids:
			query = query.where(Transaction.atm_id.in_(atm_ids))
	elif atm_ids:
		query = query.where(Transaction.atm_id.in_(atm_ids))

	query = query.where(Transaction.date_operation.between(date_debut, date_fin))

	if heure_debut is not None:
		query = query.where(Transaction.heure_operation >= heure_debut)
	if heure_fin is not None:
		query = query.where(Transaction.heure_operation <= heure_fin)

	if montant_min is not None:
		query = query.where(Transaction.montant >= montant_min)
	if montant_max is not None:
		query = query.where(Transaction.montant <= montant_max)

	if reste_coffre_max is not None:
		query = query.where(Transaction.reste_coffre <= reste_coffre_max)

	if is_cardless is not None:
		query = query.where(Transaction.is_cardless == is_cardless)

	return query


def _build_transaction_query(
	current_user: Utilisateur,
	atm_ids: list[int] | None,
	date_debut: date,
	date_fin: date,
	heure_debut: time | None,
	heure_fin: time | None,
	montant_min: float | None,
	montant_max: float | None,
	reste_coffre_max: float | None,
	is_cardless: bool | None,
):
	query = select(Transaction, ATM).join(ATM, ATM.id == Transaction.atm_id)
	query = _apply_transaction_filters(
		query,
		current_user=current_user,
		atm_ids=atm_ids,
		date_debut=date_debut,
		date_fin=date_fin,
		heure_debut=heure_debut,
		heure_fin=heure_fin,
		montant_min=montant_min,
		montant_max=montant_max,
		reste_coffre_max=reste_coffre_max,
		is_cardless=is_cardless,
	)
	return query


def _serialize_transaction(transaction: Transaction, atm: ATM) -> dict[str, object]:
	return {
		"id": transaction.id,
		"atm_id": transaction.atm_id,
		"terminal_id": atm.terminal_id,
		"atm_nom": atm.nom,
		"num_seq_dab": transaction.num_seq_dab,
		"date_operation": transaction.date_operation,
		"heure_operation": transaction.heure_operation,
		"montant": float(transaction.montant),
		"reste_coffre": float(transaction.reste_coffre),
		"is_cardless": transaction.is_cardless,
	}


def _count_transactions(db: Session, query) -> int:
	count_stmt = select(func.count()).select_from(query.subquery())
	return int(db.scalar(count_stmt) or 0)


def _csv_export_generator(rows) -> object:
	buffer = io.StringIO()
	writer = csv.writer(buffer)

	writer.writerow([
		"Terminal",
		"Date",
		"Heure",
		"Montant (DT)",
		"Reste coffre (DT)",
		"N° séq. DAB",
		"Cardless",
	])
	yield buffer.getvalue()
	buffer.seek(0)
	buffer.truncate(0)

	for transaction, atm in rows:
		writer.writerow([
			f"{atm.nom} ({atm.terminal_id})",
			transaction.date_operation.isoformat(),
			transaction.heure_operation.isoformat(),
			f"{float(transaction.montant):.3f}",
			f"{float(transaction.reste_coffre):.3f}",
			transaction.num_seq_dab,
			"Oui" if transaction.is_cardless else "Non",
		])
		yield buffer.getvalue()
		buffer.seek(0)
		buffer.truncate(0)


@router.get("", response_model=APISuccess)
def list_transactions(
	atm_id: list[int] | None = Query(default=None),
	date_debut: date | None = Query(default=None),
	date_fin: date | None = Query(default=None),
	heure_debut: time | None = Query(default=None),
	heure_fin: time | None = Query(default=None),
	montant_min: float | None = Query(default=None),
	montant_max: float | None = Query(default=None),
	reste_coffre_max: float | None = Query(default=None),
	is_cardless: bool | None = Query(default=None),
	skip: int = Query(default=0, ge=0),
	limit: int = Query(default=50, ge=1, le=500),
	current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT", "AUDITOR")),
	db: Session = Depends(get_db_session),
):
	date_debut, date_fin = _normalize_date_range(date_debut, date_fin)
	_validate_montant_range(montant_min, montant_max)

	base_query = _build_transaction_query(
		current_user=current_user,
		atm_ids=atm_id,
		date_debut=date_debut,
		date_fin=date_fin,
		heure_debut=heure_debut,
		heure_fin=heure_fin,
		montant_min=montant_min,
		montant_max=montant_max,
		reste_coffre_max=reste_coffre_max,
		is_cardless=is_cardless,
	)

	total = _count_transactions(db, base_query)
	rows = db.execute(
		base_query.order_by(
			Transaction.datetime_operation.desc().nullslast(),
			Transaction.date_operation.desc(),
			Transaction.heure_operation.desc(),
		).offset(skip).limit(limit)
	).all()

	data = [_serialize_transaction(transaction, atm) for transaction, atm in rows]
	return APISuccess(data=data, meta={"total": total, "skip": skip, "limit": limit})


@router.get("/export")
def export_transactions(
	format: Literal["csv", "xlsx"] = Query(default="csv"),
	atm_id: list[int] | None = Query(default=None),
	date_debut: date | None = Query(default=None),
	date_fin: date | None = Query(default=None),
	heure_debut: time | None = Query(default=None),
	heure_fin: time | None = Query(default=None),
	montant_min: float | None = Query(default=None),
	montant_max: float | None = Query(default=None),
	reste_coffre_max: float | None = Query(default=None),
	is_cardless: bool | None = Query(default=None),
	current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AUDITOR")),
	db: Session = Depends(get_db_session),
):
	if format == "xlsx":
		# TODO: implémenter après ajout d'openpyxl aux dépendances
		raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Export XLSX non implémenté")

	date_debut, date_fin = _normalize_date_range(date_debut, date_fin)
	_validate_montant_range(montant_min, montant_max)

	base_query = _build_transaction_query(
		current_user=current_user,
		atm_ids=atm_id,
		date_debut=date_debut,
		date_fin=date_fin,
		heure_debut=heure_debut,
		heure_fin=heure_fin,
		montant_min=montant_min,
		montant_max=montant_max,
		reste_coffre_max=reste_coffre_max,
		is_cardless=is_cardless,
	)

	total = _count_transactions(db, base_query)
	if total > MAX_EXPORT_ROWS:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Export trop volumineux. Affinez vos filtres pour rester sous 50 000 lignes.",
		)

	rows = db.execute(
		base_query.order_by(
			Transaction.datetime_operation.desc().nullslast(),
			Transaction.date_operation.desc(),
			Transaction.heure_operation.desc(),
		)
	).all()

	headers = {"Content-Disposition": 'attachment; filename="transactions_export.csv"'}
	return StreamingResponse(_csv_export_generator(rows), media_type="text/csv", headers=headers)
