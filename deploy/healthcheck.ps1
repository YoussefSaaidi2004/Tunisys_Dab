<#
.SYNOPSIS
    Verifie que le backend Tunisys_Dab (Uvicorn, service NSSM) repond en local.

.DESCRIPTION
    A executer sur le serveur, apres l'installation/demarrage du service via
    install_service.ps1. Interroge l'endpoint de sante expose par l'app
    FastAPI (app/main.py) : GET http://127.0.0.1:8000/health, qui renvoie
    {"status": "success", "data": {...}} quand tout va bien.

    Ce endpoint est prefere a /docs (Swagger UI) car :
      - il est plus leger (pas de rendu HTML),
      - il refletera un futur ajout de verification (ex: ping DB) si le
        endpoint /health est enrichi cote backend,
      - /docs peut etre desactive en production (debug=false) alors que
        /health est un endpoint applicatif explicite.

    Usage :
        .\deploy\healthcheck.ps1
        .\deploy\healthcheck.ps1 -Url "http://127.0.0.1:8000/docs"   # variante manuelle si besoin
#>

[CmdletBinding()]
param(
    [string]$Url = "http://127.0.0.1:8000/health"
)

$NomServiceAttendu = "Tunisys_Dab_Backend"

Write-Host "Verification du backend Tunisys_Dab : $Url" -ForegroundColor Cyan

try {
    $reponse = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 10
    $code = $reponse.StatusCode

    if ($code -ge 200 -and $code -lt 300) {
        Write-Host "SUCCES : le backend repond (HTTP $code)." -ForegroundColor Green
        Write-Host "Reponse : $($reponse.Content)" -ForegroundColor Gray
        exit 0
    } else {
        Write-Host "ECHEC : reponse HTTP inattendue ($code)." -ForegroundColor Red
        exit 1
    }
} catch {
    # Invoke-WebRequest leve une exception .NET pour les codes 4xx/5xx et
    # en cas d'echec de connexion (service arrete, port bloque, etc.).
    $codeErreur = $null
    if ($_.Exception.Response) {
        $codeErreur = [int]$_.Exception.Response.StatusCode
    }

    if ($codeErreur) {
        Write-Host "ECHEC : le backend a repondu avec une erreur HTTP $codeErreur." -ForegroundColor Red
    } else {
        Write-Host "ECHEC : impossible de joindre le backend sur $Url." -ForegroundColor Red
        Write-Host "Causes possibles : service '$NomServiceAttendu' arrete, port 8000 non ecoute, pare-feu local." -ForegroundColor Red
    }
    Write-Host "Detail : $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
