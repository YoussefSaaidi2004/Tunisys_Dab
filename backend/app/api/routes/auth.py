from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db_session
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.utilisateur import Utilisateur
from app.schemas.auth import AccessTokenResponse, LoginRequest, RefreshRequest, TokenPair
from app.schemas.common import APISuccess
from app.services.audit import write_audit
from app.services.token_blocklist import blocklist_service

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=APISuccess)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db_session)):
    user = db.scalar(select(Utilisateur).where(Utilisateur.login == payload.login))

    if not user or not user.actif or not verify_password(payload.mot_de_passe, user.mot_de_passe_hash):
        write_audit(
            db,
            action="AUTH_LOGIN_FAILED",
            utilisateur_id=user.id if user else None,
            ressource=payload.login,
            details={"message": "Tentative de connexion échouée"},
            adresse_ip=request.client.host if request.client else None,
            resultat="ECHEC",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")

    access_token = create_access_token(subject=user.login, role=user.role)
    refresh_token = create_refresh_token(subject=user.login)

    write_audit(
        db,
        action="AUTH_LOGIN_SUCCESS",
        utilisateur_id=user.id,
        ressource=user.login,
        details={"message": "Connexion réussie"},
        adresse_ip=request.client.host if request.client else None,
        resultat="SUCCES",
    )

    return APISuccess(data=TokenPair(access_token=access_token, refresh_token=refresh_token).model_dump())


@router.post("/refresh", response_model=APISuccess)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db_session)):
    decoded = decode_token(payload.refresh_token)

    if decoded.get("token_type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraîchissement invalide")

    jti = decoded.get("jti")
    if not jti or blocklist_service.is_revoked(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token révoqué")

    login = decoded.get("sub")
    user = db.scalar(select(Utilisateur).where(Utilisateur.login == login))
    if not user or not user.actif:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur inactif ou introuvable")

    access_token = create_access_token(subject=user.login, role=user.role)
    return APISuccess(data=AccessTokenResponse(access_token=access_token).model_dump())


@router.post("/logout", response_model=APISuccess)
def logout(payload: RefreshRequest, current_user: Utilisateur = Depends(get_current_user), db: Session = Depends(get_db_session)):
    decoded = decode_token(payload.refresh_token)
    if decoded.get("token_type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraîchissement invalide")

    jti = decoded.get("jti")
    if jti:
        blocklist_service.revoke(jti)

    write_audit(
        db,
        action="AUTH_LOGOUT",
        utilisateur_id=current_user.id,
        ressource=current_user.login,
        details={"message": "Déconnexion avec révocation du refresh token"},
        resultat="SUCCES",
    )

    return APISuccess(data={"message": "Déconnexion effectuée"})
