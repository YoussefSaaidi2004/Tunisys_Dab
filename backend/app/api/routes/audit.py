from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db_session
from app.models.journal_audit import JournalAudit
from app.models.utilisateur import Utilisateur
from app.schemas.audit import JournalAuditListResponse, JournalAuditResponse
from app.schemas.common import APISuccess

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN", "AUDITOR"))])
def list_journal_audit(
	db: Session = Depends(get_db_session),
	date_debut: date | None = Query(default=None),
	date_fin: date | None = Query(default=None),
	utilisateur_id: int | None = Query(default=None),
	action: str | None = Query(default=None, description="Filtrer par action"),
	skip: int = Query(0, ge=0),
	limit: int = Query(50, ge=1, le=200),
):
	query = select(JournalAudit, Utilisateur.login).outerjoin(
		Utilisateur, Utilisateur.id == JournalAudit.utilisateur_id
	)
	count_query = select(func.count()).select_from(JournalAudit)

	if date_debut:
		query = query.where(func.date(JournalAudit.horodatage) >= date_debut)
		count_query = count_query.where(func.date(JournalAudit.horodatage) >= date_debut)
	if date_fin:
		query = query.where(func.date(JournalAudit.horodatage) <= date_fin)
		count_query = count_query.where(func.date(JournalAudit.horodatage) <= date_fin)
	if utilisateur_id is not None:
		query = query.where(JournalAudit.utilisateur_id == utilisateur_id)
		count_query = count_query.where(JournalAudit.utilisateur_id == utilisateur_id)
	if action:
		query = query.where(JournalAudit.action.ilike(f"%{action}%"))
		count_query = count_query.where(JournalAudit.action.ilike(f"%{action}%"))

	total = db.scalar(count_query) or 0
	rows = db.execute(query.order_by(JournalAudit.horodatage.desc()).offset(skip).limit(limit)).all()

	items = [
		JournalAuditResponse.model_validate(audit).model_copy(update={"utilisateur_login": login})
		for audit, login in rows
	]

	result = JournalAuditListResponse(total=total, items=items)
	return APISuccess(data=result.model_dump())
