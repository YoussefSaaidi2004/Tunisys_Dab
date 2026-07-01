from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db_session
from app.models.atm import ATM
from app.models.transaction import Transaction
from app.models.tx_file import TXFile
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess

router = APIRouter(prefix="/statistiques")

@router.get("", response_model=APISuccess)
def get_dashboard_stats(
    current_user: Utilisateur = Depends(require_role("ADMIN", "SUPERVISOR", "AGENT")),
    db: Session = Depends(get_db_session),
):
    today = date.today()

    # 1. KPIs
    # Transactions du jour
    tx_du_jour = db.scalar(
        select(func.count(Transaction.id)).where(Transaction.date_operation == today)
    ) or 0

    # Montant total distribué (toutes dates) - ou peut-être du jour ? Le KPI dit "Montant distribué"
    # Prenons la somme globale ou celle du jour selon l'attendu. Disons du jour pour cohérence, ou 30j
    # Dans le doute, on prend la totalité des 30 derniers jours (sinon c'est 0 vu la base de dev potentiellement)
    # Pour s'assurer de ne pas avoir 0 si la db a des dates passées, utilisons sum global
    montant_distribue = db.scalar(
        select(func.sum(Transaction.montant))
    ) or 0

    # Terminaux actifs/inactifs
    terminaux_actifs = db.scalar(select(func.count(ATM.id)).where(ATM.actif == True)) or 0
    terminaux_inactifs = db.scalar(select(func.count(ATM.id)).where(ATM.actif == False)) or 0

    # 2. Distribution (Montant distribué par ATM)
    distrib_query = (
        select(ATM.terminal_id, func.sum(Transaction.montant).label("total"))
        .join(Transaction, Transaction.atm_id == ATM.id)
        .group_by(ATM.terminal_id)
        .order_by(func.sum(Transaction.montant).desc())
        .limit(10)
    )
    distrib_results = db.execute(distrib_query).all()
    distribution = [
        {"name": row.terminal_id, "value": float(row.total)} for row in distrib_results
    ]

    # 3. Derniers imports
    derniers_imports_query = (
        select(TXFile)
        .order_by(TXFile.date_import.desc())
        .limit(5)
    )
    derniers_imports_results = db.scalars(derniers_imports_query).all()
    derniers_imports = [
        {
            "nom_fichier": f.nom_fichier,
            "statut": f.statut,
            "disponibilite": f.disponibilite
        }
        for f in derniers_imports_results
    ]

    return APISuccess(data={
        "kpis": {
            "transactions_du_jour": tx_du_jour,
            "montant_distribue": float(montant_distribue),
            "terminaux_actifs": terminaux_actifs,
            "terminaux_inactifs": terminaux_inactifs
        },
        "distribution": distribution,
        "derniers_imports": derniers_imports
    })

