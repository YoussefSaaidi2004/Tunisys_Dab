class TokenBlocklistService:
    """Stockage mémoire minimal des refresh tokens révoqués.

    TODO: remplacer par un stockage persistant (Redis/table SQL) en production.
    """

    def __init__(self) -> None:
        self._revoked_jti: set[str] = set()

    def revoke(self, jti: str) -> None:
        self._revoked_jti.add(jti)

    def is_revoked(self, jti: str) -> bool:
        return jti in self._revoked_jti


blocklist_service = TokenBlocklistService()
