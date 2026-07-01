from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.core.security import decode_token
from app.models.affectation_atm import AffectationATM
from app.models.utilisateur import Utilisateur

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db_session),
) -> Utilisateur:
    payload = decode_token(token)

    if payload.get("token_type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Type de token invalide")

    login = payload.get("sub")
    if not login:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    user = db.scalar(select(Utilisateur).where(Utilisateur.login == login))
    if not user or not user.actif:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur inactif ou introuvable")

    return user


def require_role(*roles: str) -> Callable:
    def role_dependency(current_user: Utilisateur = Depends(get_current_user)) -> Utilisateur:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Droits insuffisants pour accéder à cette ressource",
            )
        return current_user

    return role_dependency


def ensure_agent_has_atm_access(db: Session, utilisateur_id: int, atm_id: int) -> None:
    is_assigned = db.scalar(
        select(AffectationATM.id).where(
            AffectationATM.utilisateur_id == utilisateur_id,
            AffectationATM.atm_id == atm_id,
        )
    )
    if not is_assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé : ce DAB n'est pas assigné à cet agent",
        )
