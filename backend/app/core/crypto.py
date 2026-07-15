from __future__ import annotations

import base64
import binascii
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from app.core.config import get_settings


def _get_ssh_key_bytes() -> bytes:
    raw_key = get_settings().ssh_encryption_key.strip()
    if not raw_key:
        raise ValueError("SSH_ENCRYPTION_KEY manquante")

    padding = "=" * (-len(raw_key) % 4)
    try:
        key_bytes = base64.urlsafe_b64decode(raw_key + padding)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("SSH_ENCRYPTION_KEY invalide : base64 incorrect") from exc

    if len(key_bytes) != 32:
        raise ValueError("SSH_ENCRYPTION_KEY invalide : la clé doit décoder 32 octets")

    return key_bytes


def encrypt_ssh_field(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None

    key_bytes = _get_ssh_key_bytes()
    nonce = os.urandom(12)
    encryptor = Cipher(algorithms.AES(key_bytes), modes.GCM(nonce)).encryptor()
    ciphertext = encryptor.update(plaintext.encode("utf-8")) + encryptor.finalize()
    payload = nonce + ciphertext + encryptor.tag
    return base64.b64encode(payload).decode("ascii")


def decrypt_ssh_field(ciphertext_b64: str | None) -> str | None:
    if ciphertext_b64 is None:
        return None

    try:
        payload = base64.b64decode(ciphertext_b64)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("SSH ciphertext invalide : base64 incorrect") from exc

    if len(payload) < 28:
        raise ValueError("SSH ciphertext invalide : données trop courtes")

    nonce = payload[:12]
    tag = payload[-16:]
    ciphertext = payload[12:-16]

    try:
        key_bytes = _get_ssh_key_bytes()
        decryptor = Cipher(algorithms.AES(key_bytes), modes.GCM(nonce, tag)).decryptor()
        plaintext = decryptor.update(ciphertext) + decryptor.finalize()
        return plaintext.decode("utf-8")
    except (InvalidTag, ValueError, UnicodeDecodeError) as exc:
        raise ValueError("Impossible de déchiffrer le champ SSH : clé invalide ou données corrompues") from exc