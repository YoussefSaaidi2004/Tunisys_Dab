from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.cassettes import router as cassettes_router
from app.api.routes.collecte import router as collecte_router
from app.api.routes.cycles import router as cycles_router
from app.api.routes.dab import router as dab_router
from app.api.routes.statistiques import router as statistiques_router
from app.api.routes.transactions import router as transactions_router
from app.api.routes.tx_files import router as tx_files_router
from app.api.routes.utilisateurs import router as utilisateurs_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.app_debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audit_router, prefix=settings.api_prefix, tags=["audit"])
app.include_router(auth_router, prefix=settings.api_prefix, tags=["auth"])
app.include_router(cassettes_router, prefix=settings.api_prefix, tags=["cassettes"])
app.include_router(collecte_router, prefix=settings.api_prefix, tags=["collecte"])
app.include_router(cycles_router, prefix=settings.api_prefix, tags=["cycles"])
app.include_router(dab_router, prefix=settings.api_prefix, tags=["dab"])
app.include_router(statistiques_router, prefix=settings.api_prefix, tags=["statistiques"])
app.include_router(transactions_router, prefix=settings.api_prefix, tags=["transactions"])
app.include_router(tx_files_router, prefix=settings.api_prefix, tags=["fichiers-tx"])
app.include_router(utilisateurs_router, prefix=settings.api_prefix, tags=["utilisateurs"])


@app.get("/health")
def health() -> dict:
    return {"status": "success", "data": {"service": settings.app_name}}
