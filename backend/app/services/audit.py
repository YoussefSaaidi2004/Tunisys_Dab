from sqlalchemy.orm import Session

from app.models.journal_audit import JournalAudit


def write_audit(
    db: Session,
    action: str,
    utilisateur_id: int | None,
    ressource: str | None = None,
    details: dict | None = None,
    adresse_ip: str | None = None,
    resultat: str | None = None,
) -> None:
    entry = JournalAudit(
        utilisateur_id=utilisateur_id,
        action=action,
        ressource=ressource,
        details=details,
        adresse_ip=adresse_ip,
        resultat=resultat,
    )
    db.add(entry)
    db.commit()
