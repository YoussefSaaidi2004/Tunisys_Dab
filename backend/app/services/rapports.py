from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.atm import ATM
from app.models.cycle_tresorerie import CycleTresorerie
from app.models.transaction import Transaction

ALERTE_COFFRE_BAS_SEUIL = Decimal("50000.000")

MOIS_FR = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
]


@dataclass(frozen=True)
class PeriodRange:
    type: str
    from_date: date
    to_date: date
    label: str
    anchor: str


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _normalize_type(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in {"journalier", "hebdomadaire", "mensuel"}:
        raise ValueError("Type de rapport invalide")
    return normalized


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except Exception as exc:  # pragma: no cover - protection de robustesse
        raise ValueError("Date de rapport invalide") from exc


def _resolve_period(report_type: str, date_ancre: str) -> PeriodRange:
    normalized_type = _normalize_type(report_type)
    raw_value = str(date_ancre or "").strip()

    if normalized_type == "mensuel":
        month_value = raw_value[:7]
        if len(month_value) != 7 or month_value[4] != "-":
            raise ValueError("La période mensuelle doit être au format YYYY-MM")
        year, month = month_value.split("-")
        start = date(int(year), int(month), 1)
        if start.month == 12:
            end = date(start.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(start.year, start.month + 1, 1) - timedelta(days=1)
        month_label = MOIS_FR[start.month - 1]
        label = f"{month_label.capitalize()} {start.year}"
        return PeriodRange(type=normalized_type, from_date=start, to_date=end, label=label, anchor=month_value)

    start = _parse_iso_date(raw_value)
    if normalized_type == "hebdomadaire":
        end = start + timedelta(days=6)
        label = f"Semaine du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}"
    else:
        end = start
        label = start.strftime("%d/%m/%Y")

    return PeriodRange(type=normalized_type, from_date=start, to_date=end, label=label, anchor=start.isoformat())


def _terminal_ids_or_all(db: Session, terminal_ids: list[str] | None) -> list[str]:
    if terminal_ids:
        cleaned = [str(item).strip() for item in terminal_ids if str(item).strip()]
        if cleaned:
            return cleaned

    return [row[0] for row in db.execute(select(ATM.terminal_id).order_by(ATM.terminal_id.asc())).all()]


def _period_clause_for_transactions(period: PeriodRange):
    return Transaction.date_operation.between(period.from_date, period.to_date)


def _period_clause_for_cycles(period: PeriodRange):
    start_dt = datetime.combine(period.from_date, time.min)
    end_dt = datetime.combine(period.to_date, time.max)
    return start_dt, end_dt


def _build_series(db: Session, terminal_ids: list[str], period: PeriodRange) -> list[dict[str, Any]]:
    if period.type == "journalier":
        bucket_expr = func.extract("hour", Transaction.heure_operation)
        labels = [f"{hour:02d}h" for hour in range(24)]
        rows = db.execute(
            select(bucket_expr.label("bucket"), func.sum(Transaction.montant).label("montant"))
            .join(ATM, ATM.id == Transaction.atm_id)
            .where(ATM.terminal_id.in_(terminal_ids), _period_clause_for_transactions(period))
            .group_by(bucket_expr)
            .order_by(bucket_expr)
        ).all()
        row_map = {int(row.bucket): _to_float(row.montant) for row in rows if row.bucket is not None}
        return [{"label": label, "montant": row_map.get(index, 0.0)} for index, label in enumerate(labels)]

    date_rows = db.execute(
        select(Transaction.date_operation.label("bucket"), func.sum(Transaction.montant).label("montant"))
        .join(ATM, ATM.id == Transaction.atm_id)
        .where(ATM.terminal_id.in_(terminal_ids), _period_clause_for_transactions(period))
        .group_by(Transaction.date_operation)
        .order_by(Transaction.date_operation.asc())
    ).all()
    row_map = {row.bucket: _to_float(row.montant) for row in date_rows}

    current = period.from_date
    serie: list[dict[str, Any]] = []
    while current <= period.to_date:
        serie.append(
            {
                "label": current.strftime("%d/%m"),
                "montant": row_map.get(current, 0.0),
            }
        )
        current += timedelta(days=1)
    return serie


def _latest_reste_coffre_by_terminal(db: Session, terminal_ids: list[str], period: PeriodRange) -> dict[str, float]:
    ranked_transactions = (
        select(
            ATM.terminal_id.label("terminal_id"),
            Transaction.reste_coffre.label("reste_coffre"),
            func.row_number()
            .over(
                partition_by=Transaction.atm_id,
                order_by=(Transaction.date_operation.desc(), Transaction.heure_operation.desc(), Transaction.id.desc()),
            )
            .label("rn"),
        )
        .join(ATM, ATM.id == Transaction.atm_id)
        .where(ATM.terminal_id.in_(terminal_ids), _period_clause_for_transactions(period))
        .subquery()
    )

    rows = db.execute(
        select(ranked_transactions.c.terminal_id, ranked_transactions.c.reste_coffre)
        .where(ranked_transactions.c.rn == 1)
    ).all()
    return {row.terminal_id: _to_float(row.reste_coffre) for row in rows}


def _build_par_terminal(db: Session, terminal_ids: list[str], period: PeriodRange) -> tuple[list[dict[str, Any]], int]:
    transaction_agg = (
        select(
            ATM.terminal_id.label("terminal_id"),
            func.sum(Transaction.montant).label("montant_distribue"),
            func.count(Transaction.id).label("nb_transactions"),
        )
        .join(Transaction, Transaction.atm_id == ATM.id)
        .where(ATM.terminal_id.in_(terminal_ids), _period_clause_for_transactions(period))
        .group_by(ATM.terminal_id)
        .subquery()
    )

    latest_reste = _latest_reste_coffre_by_terminal(db, terminal_ids, period)

    rows = db.execute(
        select(
            ATM.terminal_id,
            ATM.nom,
            ATM.actif,
            transaction_agg.c.montant_distribue,
            transaction_agg.c.nb_transactions,
        )
        .outerjoin(transaction_agg, transaction_agg.c.terminal_id == ATM.terminal_id)
        .where(ATM.terminal_id.in_(terminal_ids))
        .order_by(ATM.terminal_id.asc())
    ).all()

    par_terminal: list[dict[str, Any]] = []
    alertes = 0
    for row in rows:
        montant_distribue = _to_float(row.montant_distribue)
        nb_transactions = int(row.nb_transactions or 0)
        reste_coffre = latest_reste.get(row.terminal_id)
        alerte = reste_coffre is not None and Decimal(str(reste_coffre)) <= ALERTE_COFFRE_BAS_SEUIL
        if alerte:
            alertes += 1

        par_terminal.append(
            {
                "terminal_id": row.terminal_id,
                "nom": row.nom,
                "montant_distribue": montant_distribue,
                "nb_transactions": nb_transactions,
                "reste_coffre_dernier": reste_coffre if reste_coffre is not None else 0.0,
                "disponibilite": "OPERATIONNEL" if row.actif else "INDISPONIBLE",
                "alerte_coffre_bas": alerte,
            }
        )

    return par_terminal, alertes


def _build_cycles(db: Session, terminal_ids: list[str], period: PeriodRange) -> list[dict[str, Any]]:
    start_dt, end_dt = _period_clause_for_cycles(period)
    rows = db.execute(
        select(
            ATM.terminal_id,
            ATM.nom,
            CycleTresorerie.datetime_dechargement,
            CycleTresorerie.montant_charge,
            CycleTresorerie.montant_distribue,
        )
        .join(ATM, ATM.id == CycleTresorerie.atm_id)
        .where(
            ATM.terminal_id.in_(terminal_ids),
            CycleTresorerie.datetime_dechargement >= start_dt,
            CycleTresorerie.datetime_dechargement <= end_dt,
        )
        .order_by(CycleTresorerie.datetime_dechargement.asc())
    ).all()

    cycles: list[dict[str, Any]] = []
    for row in rows:
        cycles.append(
            {
                "terminal_id": row.terminal_id,
                "nom": row.nom,
                "datetime_dechargement": row.datetime_dechargement.isoformat() if row.datetime_dechargement else None,
                "montant_charge": _to_float(row.montant_charge),
                "montant_distribue": _to_float(row.montant_distribue),
            }
        )
    return cycles


def _count_cycles(db: Session, terminal_ids: list[str], period: PeriodRange) -> tuple[int, int]:
    start_dt, end_dt = _period_clause_for_cycles(period)

    nb_dechargements = db.scalar(
        select(func.count(CycleTresorerie.id))
        .join(ATM, ATM.id == CycleTresorerie.atm_id)
        .where(
            ATM.terminal_id.in_(terminal_ids),
            CycleTresorerie.datetime_dechargement >= start_dt,
            CycleTresorerie.datetime_dechargement <= end_dt,
        )
    ) or 0

    nb_chargements = db.scalar(
        select(func.count(CycleTresorerie.id))
        .join(ATM, ATM.id == CycleTresorerie.atm_id)
        .where(
            ATM.terminal_id.in_(terminal_ids),
            CycleTresorerie.datetime_chargement.is_not(None),
            CycleTresorerie.datetime_chargement >= start_dt,
            CycleTresorerie.datetime_chargement <= end_dt,
        )
    ) or 0

    return int(nb_chargements), int(nb_dechargements)


def _build_alertes_coffre_bas(db: Session, terminal_ids: list[str], period: PeriodRange) -> int:
    latest_reste = _latest_reste_coffre_by_terminal(db, terminal_ids, period)
    return sum(1 for value in latest_reste.values() if Decimal(str(value)) <= ALERTE_COFFRE_BAS_SEUIL)


def build_rapport(db: Session, type: str, date_ancre: str, terminal_ids: list[str] | None) -> dict[str, Any]:
    period = _resolve_period(type, date_ancre)
    selected_terminal_ids = _terminal_ids_or_all(db, terminal_ids)

    terminal_rows = db.execute(
        select(ATM.terminal_id, ATM.nom, ATM.actif).where(ATM.terminal_id.in_(selected_terminal_ids)).order_by(ATM.terminal_id.asc())
    ).all()

    selected_terminal_ids = [row.terminal_id for row in terminal_rows]

    if not selected_terminal_ids:
        return {
            "periode": {
                "type": period.type,
                "from": period.from_date.isoformat(),
                "to": period.to_date.isoformat(),
                "libelle": period.label,
            },
            "kpis": {
                "montant_total_distribue": 0.0,
                "nb_transactions_tr": 0,
                "nb_chargements": 0,
                "nb_dechargements": 0,
                "terminaux_actifs": 0,
                "terminaux_inactifs": 0,
                "nb_alertes_coffre_bas": 0,
            },
            "serie_temporelle": _build_series(db, selected_terminal_ids, period),
            "par_terminal": [],
            "cycles": [],
        }

    tx_total = db.execute(
        select(
            func.coalesce(func.sum(Transaction.montant), 0),
            func.count(Transaction.id),
        )
        .join(ATM, ATM.id == Transaction.atm_id)
        .where(ATM.terminal_id.in_(selected_terminal_ids), _period_clause_for_transactions(period))
    ).one()

    terminals_actifs = sum(1 for row in terminal_rows if row.actif)
    terminals_inactifs = len(terminal_rows) - terminals_actifs

    nb_chargements, nb_dechargements = _count_cycles(db, selected_terminal_ids, period)
    serie_temporelle = _build_series(db, selected_terminal_ids, period)
    par_terminal, _ = _build_par_terminal(db, selected_terminal_ids, period)
    cycles = _build_cycles(db, selected_terminal_ids, period)
    nb_alertes_coffre_bas = _build_alertes_coffre_bas(db, selected_terminal_ids, period)

    return {
        "periode": {
            "type": period.type,
            "from": period.from_date.isoformat(),
            "to": period.to_date.isoformat(),
            "libelle": period.label,
        },
        "kpis": {
            "montant_total_distribue": _to_float(tx_total[0]),
            "nb_transactions_tr": int(tx_total[1] or 0),
            "nb_chargements": nb_chargements,
            "nb_dechargements": nb_dechargements,
            "terminaux_actifs": terminals_actifs,
            "terminaux_inactifs": terminals_inactifs,
            "nb_alertes_coffre_bas": nb_alertes_coffre_bas,
        },
        "serie_temporelle": serie_temporelle,
        "par_terminal": par_terminal,
        "cycles": cycles,
    }