from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db_session
from app.core.security import hash_password
from app.models.utilisateur import Utilisateur
from app.schemas.common import APISuccess
from app.schemas.utilisateur import (
    UtilisateurCreate,
    UtilisateurListResponse,
    UtilisateurResponse,
    UtilisateurUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/utilisateurs", tags=["Utilisateurs"])


def _get_utilisateur_or_404(db: Session, utilisateur_id: int) -> Utilisateur:
    user = db.get(Utilisateur, utilisateur_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")
    return user


def _check_login_email_unique(
    db: Session, login: str | None, email: str | None, exclude_id: int | None = None
) -> None:
    if login:
        query = select(Utilisateur.id).where(Utilisateur.login == login)
        if exclude_id:
            query = query.where(Utilisateur.id != exclude_id)
        if db.scalar(query):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ce login est déjà utilisé")

    if email:
        query = select(Utilisateur.id).where(Utilisateur.email == email)
        if exclude_id:
            query = query.where(Utilisateur.id != exclude_id)
        if db.scalar(query):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cet email est déjà utilisé")


@router.get("", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN"))])
def list_utilisateurs(
    db: Session = Depends(get_db_session),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    role: str | None = Query(default=None, description="Filtrer par rôle"),
    actif: bool | None = Query(default=None, description="Filtrer par statut actif/inactif"),
):
    query = select(Utilisateur)
    count_query = select(func.count()).select_from(Utilisateur)

    if role:
        query = query.where(Utilisateur.role == role)
        count_query = count_query.where(Utilisateur.role == role)
    if actif is not None:
        query = query.where(Utilisateur.actif == actif)
        count_query = count_query.where(Utilisateur.actif == actif)

    total = db.scalar(count_query) or 0
    users = db.scalars(query.order_by(Utilisateur.id).offset(skip).limit(limit)).all()

    result = UtilisateurListResponse(
        total=total,
        items=[UtilisateurResponse.model_validate(u) for u in users],
    )
    return APISuccess(data=result.model_dump())


@router.get("/{utilisateur_id}", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN"))])
def get_utilisateur(utilisateur_id: int, db: Session = Depends(get_db_session)):
    user = _get_utilisateur_or_404(db, utilisateur_id)
    return APISuccess(data=UtilisateurResponse.model_validate(user).model_dump())


@router.post("", response_model=APISuccess, status_code=status.HTTP_201_CREATED)
def create_utilisateur(
    payload: UtilisateurCreate,
    request: Request,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    _check_login_email_unique(db, payload.login, payload.email)

    user = Utilisateur(
        login=payload.login,
        mot_de_passe_hash=hash_password(payload.mot_de_passe),
        nom=payload.nom,
        email=payload.email,
        role=payload.role,
        actif=payload.actif,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    write_audit(
        db,
        action="UTILISATEUR_CREATE",
        utilisateur_id=current_user.id,
        ressource=f"utilisateur:{user.id}",
        details={"login_cree": user.login, "role": user.role},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(data=UtilisateurResponse.model_validate(user).model_dump())


@router.put("/{utilisateur_id}", response_model=APISuccess)
def update_utilisateur(
    utilisateur_id: int,
    payload: UtilisateurUpdate,
    request: Request,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    user = _get_utilisateur_or_404(db, utilisateur_id)

    # Un admin ne peut pas se rétrograder ou se désactiver lui-même (évite le verrouillage total)
    if user.id == current_user.id:
        if payload.role is not None and payload.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vous ne pouvez pas retirer votre propre rôle ADMIN",
            )
        if payload.actif is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vous ne pouvez pas désactiver votre propre compte",
            )

    _check_login_email_unique(db, None, payload.email, exclude_id=user.id)

    changed_fields: dict = {}

    if payload.nom is not None:
        user.nom = payload.nom
        changed_fields["nom"] = payload.nom
    if payload.email is not None:
        user.email = payload.email
        changed_fields["email"] = payload.email
    if payload.role is not None:
        user.role = payload.role
        changed_fields["role"] = payload.role
    if payload.actif is not None:
        user.actif = payload.actif
        changed_fields["actif"] = payload.actif
    if payload.mot_de_passe is not None:
        user.mot_de_passe_hash = hash_password(payload.mot_de_passe)
        changed_fields["mot_de_passe"] = "modifié"

    db.commit()
    db.refresh(user)

    write_audit(
        db,
        action="UTILISATEUR_UPDATE",
        utilisateur_id=current_user.id,
        ressource=f"utilisateur:{user.id}",
        details={"champs_modifies": changed_fields},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(data=UtilisateurResponse.model_validate(user).model_dump())


