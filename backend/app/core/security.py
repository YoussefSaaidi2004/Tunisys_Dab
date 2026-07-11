from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from jose import JWTError, jwt
import bcrypt

from app.core.config import get_settings

settings = get_settings()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), 
            hashed_password.encode("utf-8")
        )
    except ValueError:
        return False


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _build_token(payload: dict[str, Any], expires_delta: timedelta) -> str:
    now = datetime.now(tz=timezone.utc)
    to_encode = payload.copy()
    to_encode.update(
        {
            "iat": int(now.timestamp()),
            "exp": int((now + expires_delta).timestamp()),
            "jti": str(uuid4()),
        }
    )
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, role: str) -> str:
    return _build_token(
        {"sub": subject, "role": role, "token_type": "access"},
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )


def create_refresh_token(subject: str) -> str:
    return _build_token(
        {"sub": subject, "token_type": "refresh"},
        timedelta(days=settings.jwt_refresh_token_expire_days),
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide ou expiré"
        ) from exc


def mask_pan(pan: str | None) -> str | None:
    """Masque un PAN au format BIN(6) + étoiles + 4 derniers chiffres.

    Idempotent : ré-appliquer sur une valeur déjà masquée ne change rien,
    ce qui permet de l'utiliser en défense à la sérialisation même si le
    parser stocke déjà la valeur masquée (voir MASK_PAN dans import_tx_to_db.py).
    """
    if pan is None or len(pan) < 10:
        return pan
    return pan[:6] + "*" * (len(pan) - 10) + pan[-4:]
