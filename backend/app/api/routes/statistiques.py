from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.config import get_settings
from app.core.database import get_db_session
from app.models.atm import ATM
from app.models.cassette_event import CassetteEvent
from app.models.transaction import Transaction
from app.models.tx_file import TXFile
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess
from app.services.audit import write_audit

router = APIRouter(prefix="/statistiques")

GRAPHIQUE_JOURS = 30


@router.get("", response_model=APISuccess)
def get_dashboard_stats(
    request: Request,
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR")),
    db: Session = Depends(get_db_session),
):
    today = date.today()
    settings = get_settings()

    # 1. KPIs du jour
    nb_transactions_jour = db.scalar(
        select(func.count(Transaction.id)).where(Transaction.date_operation == today)
    ) or 0

    montant_distribue_jour = db.scalar(
        select(func.sum(Transaction.montant)).where(Transaction.date_operation == today)
    ) or 0

    nb_chargements_jour = db.scalar(
        select(func.count(CassetteEvent.id)).where(
            CassetteEvent.type_evenement == "CH",
            CassetteEvent.date_evenement == today,
        )
    ) or 0

    nb_terminaux_actifs = db.scalar(select(func.count(ATM.id)).where(ATM.actif == True)) or 0  # noqa: E712
    nb_terminaux_inactifs = db.scalar(select(func.count(ATM.id)).where(ATM.actif == False)) or 0  # noqa: E712

    # 2. Graphique de distribution (30 derniers jours), groupé par date et par ATM
    date_debut_graphique = today - timedelta(days=GRAPHIQUE_JOURS - 1)
    graphique_query = (
        select(
            Transaction.date_operation,
            ATM.terminal_id,
            ATM.nom,
            func.sum(Transaction.montant).label("montant_distribue"),
        )
        .join(ATM, ATM.id == Transaction.atm_id)
        .where(Transaction.date_operation.between(date_debut_graphique, today))
        .group_by(Transaction.date_operation, ATM.terminal_id, ATM.nom)
        .order_by(Transaction.date_operation.asc())
    )
    graphique_rows = db.execute(graphique_query).all()
    graphique_distribution = [
        {
            "date": row.date_operation.isoformat(),
            "terminal_id": row.terminal_id,
            "nom_terminal": row.nom,
            "montant_distribue": float(row.montant_distribue),
        }
        for row in graphique_rows
    ]

    # 3. Alertes seuil bas : dernière transaction connue par DAB actif
    rang_derniere_tx = (
        func.row_number()
        .over(
            partition_by=Transaction.atm_id,
            order_by=(
                Transaction.datetime_operation.desc().nullslast(),
                Transaction.date_operation.desc(),
                Transaction.heure_operation.desc(),
            ),
        )
        .label("rang")
    )
    dernieres_tx_subq = (
        select(
            Transaction.atm_id,
            Transaction.reste_coffre,
            Transaction.datetime_operation,
            Transaction.date_operation,
            Transaction.heure_operation,
            rang_derniere_tx,
        )
        .subquery()
    )
    derniere_tx_par_atm = (
        select(dernieres_tx_subq)
        .where(dernieres_tx_subq.c.rang == 1)
        .subquery()
    )

    alertes_query = (
        select(ATM, derniere_tx_par_atm.c.reste_coffre, derniere_tx_par_atm.c.datetime_operation,
               derniere_tx_par_atm.c.date_operation, derniere_tx_par_atm.c.heure_operation)
        .join(derniere_tx_par_atm, derniere_tx_par_atm.c.atm_id == ATM.id)
        .where(ATM.actif == True, derniere_tx_par_atm.c.reste_coffre < settings.seuil_alerte_coffre)  # noqa: E712
        .order_by(derniere_tx_par_atm.c.reste_coffre.asc())
    )
    alertes_rows = db.execute(alertes_query).all()

    alertes_seuil_bas = []
    for atm, reste_coffre, datetime_operation, date_operation, heure_operation in alertes_rows:
        if datetime_operation is not None:
            derniere_transaction = datetime_operation
        else:
            derniere_transaction = datetime.combine(date_operation, heure_operation)

        alertes_seuil_bas.append({
            "atm_id": atm.id,
            "terminal_id": atm.terminal_id,
            "nom": atm.nom,
            "reste_coffre": float(reste_coffre),
            "datetime_derniere_transaction": derniere_transaction.isoformat(),
        })

    # 4. Statut des 5 derniers imports TX
    derniers_imports_query = (
        select(TXFile)
        .order_by(TXFile.date_import.desc())
        .limit(5)
    )
    derniers_imports = [
        {
            "nom_fichier": f.nom_fichier,
            "terminal_id": f.terminal_id,
            "date_fichier": f.date_fichier.isoformat(),
            "statut": f.statut,
            "disponibilite": f.disponibilite,
        }
        for f in db.scalars(derniers_imports_query).all()
    ]

    write_audit(
        db,
        action="CONSULTATION_STATS",
        utilisateur_id=current_user.id,
        ressource="statistiques",
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(
        data={
            "kpis": {
                "nb_transactions_jour": nb_transactions_jour,
                "montant_distribue_jour": float(montant_distribue_jour),
                "nb_chargements_jour": nb_chargements_jour,
                "nb_terminaux_actifs": nb_terminaux_actifs,
                "nb_terminaux_inactifs": nb_terminaux_inactifs,
            },
            "graphique_distribution": graphique_distribution,
            "alertes_seuil_bas": alertes_seuil_bas,
            "derniers_imports": derniers_imports,
        },
        meta={},
    )
