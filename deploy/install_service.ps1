<#
.SYNOPSIS
    Installation du backend Tunisys_Dab en service Windows (NSSM) sur le serveur IIS.

.DESCRIPTION
    A executer sur le serveur, depuis PowerShell, en tant qu'administrateur,
    idealement en etant place dans le dossier backend :
        cd C:\Users\Administrator\Desktop\Tunisys_Dab\backend
        .\..\deploy\install_service.ps1

    Etapes realisees par ce script (uniquement) :
      1. Creation du venv .venv s'il n'existe pas deja (idempotent).
      2. Installation des dependances depuis requirements.txt (fige, fourni
         separement : fastapi 0.116.1, uvicorn 0.35.0, ne pas regenerer).
      3. Installation/mise a jour du service NSSM "Tunisys_Dab_Backend".
      4. Configuration du service en demarrage automatique + demarrage.

    Ce script NE TOUCHE PAS a la base de donnees. La creation du schema
    PostgreSQL (script SQL complet + fichiers de migration dans
    migrations\*.up.sql, appliques manuellement via psql, dans l'ordre
    numerique) est une etape PREALABLE, a realiser AVANT d'executer ce
    script. Voir CHECKLIST_DEPLOIEMENT.md, section "Base de donnees".

    IMPORTANT :
      - La commande Uvicorn ne doit JAMAIS contenir --reload en production
        (--reload est un outil de developpement : il recharge le process a
        chaque modification de fichier, ce qui n'a rien a faire sur un
        serveur en service Windows).
      - Le backend ecoute uniquement sur 127.0.0.1 (jamais 0.0.0.0) : il
        n'est joignable que depuis IIS sur la meme machine, via le
        reverse-proxy defini dans deploy\web.config.
      - NSSM (Non-Sucking Service Manager) doit deja etre installe et
        accessible dans le PATH de la machine (verifie en debut de script).
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# --- Parametres verrouilles du projet (ne pas deviner, valeurs fixes) ---
$RacineProjet   = "C:\Users\Administrator\Desktop\Tunisys_Dab"
$BackendDir     = Join-Path $RacineProjet "backend"
$VenvDir        = Join-Path $BackendDir ".venv"
$PythonExe      = Join-Path $VenvDir "Scripts\python.exe"
$RequirementsTx = Join-Path $BackendDir "requirements.txt"
$NomService     = "Tunisys_Dab_Backend"
$UvicornArgs    = "-m uvicorn app.main:app --host 127.0.0.1 --port 8000"

Write-Host "=== Installation du service $NomService ===" -ForegroundColor Cyan

# --- Verification prealable : NSSM disponible dans le PATH ---
$nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssmCmd) {
    throw "NSSM introuvable dans le PATH. Installer NSSM (https://nssm.cc/) et " +
          "s'assurer que nssm.exe est accessible depuis n'importe quel dossier " +
          "(variable d'environnement PATH) avant de relancer ce script."
}
Write-Host "NSSM detecte : $($nssmCmd.Source)" -ForegroundColor Green

# --- Verification prealable : dossier backend attendu ---
if (-not (Test-Path $BackendDir)) {
    throw "Dossier backend introuvable : $BackendDir. Verifier que le code a bien ete copie sur le serveur a cet emplacement exact."
}
if (-not (Test-Path $RequirementsTx)) {
    throw "requirements.txt introuvable : $RequirementsTx"
}

# =========================================================================
# ETAPE 1 : Creation du venv (idempotent)
# =========================================================================
if (Test-Path $PythonExe) {
    Write-Host "[1/4] venv deja present ($VenvDir), creation ignoree." -ForegroundColor Yellow
} else {
    Write-Host "[1/4] Creation du venv dans $VenvDir ..." -ForegroundColor Cyan
    $pythonSysteme = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonSysteme) {
        throw "Aucun 'python' trouve dans le PATH du serveur pour creer le venv. Installer Python 3 (celui qui a servi a figer requirements.txt) et reessayer."
    }
    & python -m venv $VenvDir
    if (-not (Test-Path $PythonExe)) {
        throw "Echec de creation du venv : $PythonExe n'existe pas apres 'python -m venv'."
    }
    Write-Host "venv cree." -ForegroundColor Green
}

# =========================================================================
# ETAPE 2 : Installation des dependances (figees, requirements.txt fourni tel quel)
# =========================================================================
Write-Host "[2/4] Installation des dependances depuis requirements.txt ..." -ForegroundColor Cyan
& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r $RequirementsTx
if ($LASTEXITCODE -ne 0) {
    throw "echec de 'pip install -r requirements.txt' (code $LASTEXITCODE)."
}
Write-Host "Dependances installees." -ForegroundColor Green

# =========================================================================
# ETAPE 3 : Installation / mise a jour du service NSSM
# =========================================================================
$serviceExiste = Get-Service -Name $NomService -ErrorAction SilentlyContinue

if ($serviceExiste) {
    Write-Host "[3/4] Service $NomService deja installe, mise a jour de sa configuration ..." -ForegroundColor Yellow
    # On s'assure que le service pointe bien vers les valeurs verrouillees
    # (utile si le script est relance apres un changement de version Python, etc.)
    & nssm.exe stop $NomService
    & nssm.exe set $NomService Application $PythonExe
    & nssm.exe set $NomService AppParameters $UvicornArgs
    & nssm.exe set $NomService AppDirectory $BackendDir
} else {
    Write-Host "[3/4] Installation du service $NomService ..." -ForegroundColor Cyan
    & nssm.exe install $NomService $PythonExe
    & nssm.exe set $NomService AppParameters $UvicornArgs
    # Startup directory = dossier backend, pour que les imports relatifs
    # (app.main:app) et la lecture de backend\.env fonctionnent comme en dev.
    & nssm.exe set $NomService AppDirectory $BackendDir
}

# Redirection des logs Uvicorn vers des fichiers (facilite le diagnostic
# en cas de probleme, le service Windows n'a pas de console visible).
$LogsDir = Join-Path $BackendDir "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}
& nssm.exe set $NomService AppStdout (Join-Path $LogsDir "service.out.log")
& nssm.exe set $NomService AppStderr (Join-Path $LogsDir "service.err.log")
& nssm.exe set $NomService AppRotateFiles 1

# =========================================================================
# ETAPE 4 : Demarrage automatique + demarrage du service
# =========================================================================
Write-Host "[4/4] Configuration du demarrage automatique et demarrage du service ..." -ForegroundColor Cyan
& nssm.exe set $NomService Start SERVICE_AUTO_START
& nssm.exe start $NomService

Start-Sleep -Seconds 2
$statut = Get-Service -Name $NomService
Write-Host ""
Write-Host "=== Statut du service $NomService : $($statut.Status) ===" -ForegroundColor Cyan
if ($statut.Status -ne "Running") {
    Write-Host "Le service n'est pas demarre. Consulter les logs : $LogsDir" -ForegroundColor Red
} else {
    Write-Host "Service demarre. Executer deploy\healthcheck.ps1 pour verifier que l'API repond." -ForegroundColor Green
}
