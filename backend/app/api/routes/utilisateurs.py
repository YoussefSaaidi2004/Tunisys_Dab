from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db_session
from app.core.security import hash_password
from app.models.affectation_atm import AffectationATM
from app.models.atm import ATM
from app.models.utilisateur import Utilisateur
from app.schemas.affectation_atm import AffectationSetRequest
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


@router.get("/{utilisateur_id}/affectations", response_model=APISuccess, dependencies=[Depends(require_role("ADMIN"))])
def list_utilisateur_affectations(utilisateur_id: int, db: Session = Depends(get_db_session)):
    _get_utilisateur_or_404(db, utilisateur_id)

    rows = db.execute(
        select(
            AffectationATM.atm_id,
            ATM.terminal_id,
            ATM.nom,
            ATM.actif,
            AffectationATM.date_affectation,
        )
        .join(ATM, ATM.id == AffectationATM.atm_id)
        .where(AffectationATM.utilisateur_id == utilisateur_id)
        .order_by(ATM.terminal_id)
    ).all()

    data = [
        {
            "atm_id": row.atm_id,
            "terminal_id": row.terminal_id,
            "nom": row.nom,
            "actif": row.actif,
            "date_affectation": row.date_affectation.isoformat() if row.date_affectation else None,
        }
        for row in rows
    ]
    return APISuccess(data=data, meta={"total": len(data)})


@router.put("/{utilisateur_id}/affectations", response_model=APISuccess)
def set_utilisateur_affectations(
    utilisateur_id: int,
    payload: AffectationSetRequest,
    request: Request,
    current_user: Utilisateur = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db_session),
):
    user = _get_utilisateur_or_404(db, utilisateur_id)

    if user.role != "AGENT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seul un utilisateur de rôle AGENT peut recevoir des affectations DAB",
        )

    # Dédup en entrée : la liste peut contenir des doublons (ex. sélection UI),
    # on ne veut jamais tenter un INSERT en double sur (utilisateur_id, atm_id).
    requested_ids = set(payload.atm_ids)

    if requested_ids:
        existing_atm_ids = set(db.scalars(select(ATM.id).where(ATM.id.in_(requested_ids))).all())
        unknown_ids = sorted(requested_ids - existing_atm_ids)
        if unknown_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"DAB(s) inconnu(s) : {', '.join(str(i) for i in unknown_ids)}",
            )

    current_ids = set(
        db.scalars(
            select(AffectationATM.atm_id).where(AffectationATM.utilisateur_id == utilisateur_id)
        ).all()
    )

    a_ajouter = sorted(requested_ids - current_ids)
    a_retirer = sorted(current_ids - requested_ids)
    inchanges = sorted(requested_ids & current_ids)

    # Différentiel explicite (DELETE des seules lignes retirées, INSERT des
    # seules nouvelles) plutôt qu'un DELETE global + INSERT global : ce
    # dernier détruirait la date_affectation historique des lignes inchangées.
    try:
        if a_retirer:
            db.execute(
                delete(AffectationATM).where(
                    AffectationATM.utilisateur_id == utilisateur_id,
                    AffectationATM.atm_id.in_(a_retirer),
                )
            )
        for atm_id in a_ajouter:
            db.add(AffectationATM(utilisateur_id=utilisateur_id, atm_id=atm_id))

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflit lors de la mise à jour des affectations",
        ) from None

    write_audit(
        db,
        action="MODIF_AFFECTATION",
        utilisateur_id=current_user.id,
        ressource=f"utilisateur:{utilisateur_id}",
        details={
            "avant": sorted(current_ids),
            "apres": sorted(requested_ids),
            "ajoutes": a_ajouter,
            "retires": a_retirer,
        },
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(
        data={
            "ajoutes": a_ajouter,
            "retires": a_retirer,
            "inchanges": inchanges,
            "total": len(requested_ids),
        },
        meta={},
    )
