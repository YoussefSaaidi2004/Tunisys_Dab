import os
import re
import stat
import logging
from datetime import datetime
from pathlib import Path

import paramiko

# ─────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────

SSH_CONFIG = {
    "hostname": "10.10.10.27",
    "port": 22,
    "username": "Youssef2",
    "password": "123456",
    "timeout": 30,
}

# Bureau du PC distant (Windows) — chemin SFTP avec slashes
REMOTE_DESKTOP_PATH = "C:/Users/Youssef2/Desktop"

# Terminal IDs (= noms des dossiers sur le bureau distant)
TERMINAL_IDS = [
    "120001",
    "100203",   # contient aussi les anciens fichiers TerID031002
    "111502",
]

# Migration Terminal ID : ancien_id → id_actuel
# NOTE : ce dictionnaire est conservé uniquement à titre documentaire/traçabilité
# (ex. pour alimenter manuellement la table atm_id_historique côté base de
# données). Il n'est PLUS utilisé pour filtrer les fichiers collectés : seuls
# les fichiers portant le Terminal ID ACTUEL (le plus récent) sont collectés ;
# les fichiers portant un ancien ID sont systématiquement ignorés.
TERMINAL_ID_MIGRATION = {
    "031002": "100203",   # Même terminal physique, ID changé le 08/04/2024
}

# ─────────────────────────────────────────────────────────────
#  ARBORESCENCE LOCALE D'ARCHIVAGE (source : Architecture §7.3)
#
#  C:\Archive_TX\
#    └── {TerminalID}\
#          └── {YYYY}\
#                └── {MM}\
#                      └── TX{AAAAMMJJ}TerID{TerminalID}.txt
# ─────────────────────────────────────────────────────────────

ARCHIVE_ROOT = Path(r"C:\Archive_TX")

# Fichier de log
LOG_FILE = r"C:\DAB_Solution\logs\collect_tx.log"

# ─────────────────────────────────────────────────────────────
#  PATTERNS REGEX
# ─────────────────────────────────────────────────────────────

# TX{AAAAMMJJ}TerID{TerminalID}.txt
TX_FILENAME_PATTERN = re.compile(
    r"^TX(?P<date>\d{8})TerID(?P<terminal_id>\d{6})\.txt$",
    re.IGNORECASE
)

# Ligne TR : heure HHMMSS (sans séparateurs)
TR_LINE_PATTERN = re.compile(
    r"^(?P<seq_dab>\d+)"
    r"\|TR"
    r"\|(?P<terminal_id>\d{6})"
    r"\|(?P<date>\d{2}/\d{2}/\d{2})"
    r"\|(?P<heure>\d{6})"
    r"\|(?P<seq_monetique>\d+)"
    r"\|(?P<montant>\d+)"
    r"\|(?P<numero_carte>\d+)"
    r"\|(?P<reste_coffre>\d+)"
    r"\|$"
)

# Ligne CH : heure HH:MM:SS (avec séparateurs)
CH_LINE_PATTERN = re.compile(
    r"^(?P<seq_dab>\d+)"
    r"\|CH"
    r"\|(?P<terminal_id>\d{6})"
    r"\|(?P<date>\d{2}/\d{2}/\d{2})"
    r"\|(?P<heure>\d{2}:\d{2}:\d{2})"
    r"\|(?P<cassettes>(?:\d+:\d+\|)+)$"
)

# Ligne DE : identique à CH
DE_LINE_PATTERN = re.compile(
    r"^(?P<seq_dab>\d+)"
    r"\|DE"
    r"\|(?P<terminal_id>\d{6})"
    r"\|(?P<date>\d{2}/\d{2}/\d{2})"
    r"\|(?P<heure>\d{2}:\d{2}:\d{2})"
    r"\|(?P<cassettes>(?:\d+:\d+\|)+)$"
)

# ─────────────────────────────────────────────────────────────
#  LOGGING
# ─────────────────────────────────────────────────────────────

# Créer le dossier de log si nécessaire
Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
#  CONSTRUCTION DU CHEMIN LOCAL D'ARCHIVAGE
# ─────────────────────────────────────────────────────────────

def build_local_path(archive_root: Path, terminal_id: str, date_fichier) -> Path:
    """
    Construit le chemin local complet pour un fichier TX.

    Règle d'archivage (Architecture §7.3) :
        D:\\Archive_TX\\{TerminalID}\\{YYYY}\\{MM}\\

    Exemples :
        TX20241228TerID120001.txt  →  D:\\Archive_TX\\120001\\2024\\12\\
        TX20231025TerID031002.txt  →  D:\\Archive_TX\\100203\\2023\\10\\
          (noter : le dossier parent est l'ID actuel 100203, pas l'ancien 031002)

    Args:
        archive_root  : racine D:\\Archive_TX
        terminal_id   : ID actuel du terminal (= nom du dossier de 1er niveau)
        date_fichier  : objet date extrait du nom du fichier TX

    Returns:
        Path du dossier destination (sans le nom du fichier)
    """
    year  = date_fichier.strftime("%Y")   # ex: "2024"
    month = date_fichier.strftime("%m")   # ex: "12"  (zéro-padded)
    return archive_root / terminal_id / year / month


# ─────────────────────────────────────────────────────────────
#  VALIDATION
# ─────────────────────────────────────────────────────────────

def parse_tx_filename(filename: str) -> dict | None:
    """
    Valide et extrait les métadonnées d'un nom de fichier TX.

    Format : TX{AAAAMMJJ}TerID{TerminalID}.txt
    Exemples valides :
        TX20241228TerID120001.txt  ✅
        TX20231025TerID031002.txt  ✅
        TX20260518TerID111502.TXT  ✅  (extension majuscule tolérée)
    """
    match = TX_FILENAME_PATTERN.match(filename)
    if not match:
        return None

    date_str    = match.group("date")        # AAAAMMJJ
    terminal_id = match.group("terminal_id")

    try:
        date_fichier = datetime.strptime(date_str, "%Y%m%d").date()
    except ValueError:
        logger.warning(f"  ⚠ Date invalide dans le nom de fichier : {filename}")
        return None

    return {
        "filename"     : filename,
        "date_fichier" : date_fichier,
        "terminal_id"  : terminal_id,
    }


def check_terminal_id(terminal_id_in_file: str, current_terminal_id: str) -> str:
    """
    Compare le Terminal ID lu dans le nom du fichier avec le Terminal ID
    ACTUEL du DAB (= ID actuellement enregistré, ici représenté par le nom
    du dossier distant/local en cours de traitement).

    Règle (validée avec l'encadrant) :
        En cas de changement de Terminal ID, SEULS les fichiers portant le
        Terminal ID ACTUEL (le plus récent) sont collectés. Tous les fichiers
        portant un ancien Terminal ID (avant migration) sont ignorés, même
        si la migration est connue dans TERMINAL_ID_MIGRATION. Ce dictionnaire
        sert uniquement à la traçabilité/documentation de la migration, pas
        à la récupération rétroactive des anciens fichiers.

    Retourne un statut parmi :
        "MATCH"             : terminal_id_in_file == current_terminal_id
                               → fichier conservé.
        "MISMATCH_INCONNU"  : ID différent (ancien ID de migration connue ou
                               ID totalement étranger à ce DAB) → rejeté.
    """
    if terminal_id_in_file == current_terminal_id:
        return "MATCH"
    return "MISMATCH_INCONNU"


def resolve_folder_id(terminal_id_in_file: str) -> str:
    """
    Retourne l'ID actuel (dossier de 1er niveau dans Archive_TX)
    pour un terminal ID donné.

    Désormais, seuls les fichiers dont le Terminal ID correspond déjà à
    l'ID actuel sont traités (cf. check_terminal_id), donc cette fonction
    est conservée par simplicité mais renvoie toujours l'ID tel quel.
    """
    return terminal_id_in_file


# ─────────────────────────────────────────────────────────────
#  ANALYSE RAPIDE DU CONTENU D'UN FICHIER TX
# ─────────────────────────────────────────────────────────────

def analyze_tx_file(local_path: Path) -> dict:
    """
    Analyse le contenu d'un fichier TX local.

    Trois statuts de disponibilité (règle métier critique) :
      < 100 octets  → OPERATIONNEL_SANS_TX  (DAB en marche, 0 transaction)
      >= 100 octets → OPERATIONNEL           (lignes TR/CH/DE présentes)
      absent        → INDISPONIBLE           (géré en amont, jamais appelé ici)

    Encodage : cp1252 (Windows Western Europe), CRLF ignorés par strip()
    """
    if local_path.stat().st_size < 100:
        return {
            "statut"           : "VIDE",
            "disponibilite"    : "OPERATIONNEL_SANS_TX",
            "nb_lignes_tr"     : 0,
            "nb_lignes_ch"     : 0,
            "nb_lignes_de"     : 0,
            "nb_lignes_inconnu": 0,
            "erreur"           : None,
        }

    result = {
        "statut"           : "IMPORTE",
        "disponibilite"    : "OPERATIONNEL",
        "nb_lignes_tr"     : 0,
        "nb_lignes_ch"     : 0,
        "nb_lignes_de"     : 0,
        "nb_lignes_inconnu": 0,
        "erreur"           : None,
    }

    try:
        # cp1252 = encodage Windows Western Europe standard
        with open(local_path, encoding="cp1252", errors="replace") as f:
            for raw_line in f:
                line = raw_line.strip()   # supprime \r\n et espaces
                if not line:
                    continue  # 1ère ligne vide attendue — ignorée
                if "|TR|" in line:
                    result["nb_lignes_tr"] += 1
                elif "|CH|" in line:
                    result["nb_lignes_ch"] += 1
                elif "|DE|" in line:
                    result["nb_lignes_de"] += 1
                else:
                    result["nb_lignes_inconnu"] += 1
    except Exception as e:
        result["statut"] = "ERREUR"
        result["erreur"] = str(e)

    return result


# ─────────────────────────────────────────────────────────────
#  CONNEXION SSH / SFTP
# ─────────────────────────────────────────────────────────────

def create_ssh_client() -> paramiko.SSHClient:
    """Crée et retourne une connexion SSH authentifiée."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(**SSH_CONFIG)
        logger.info(f"✅ Connexion SSH établie vers {SSH_CONFIG['hostname']}")
        return client
    except paramiko.AuthenticationException:
        logger.error("❌ Échec d'authentification SSH — vérifiez les identifiants.")
        raise
    except paramiko.SSHException as e:
        logger.error(f"❌ Erreur SSH : {e}")
        raise
    except Exception as e:
        logger.error(f"❌ Impossible de se connecter : {e}")
        raise


def is_remote_dir(sftp: paramiko.SFTPClient, path: str) -> bool:
    """Vérifie si un chemin distant est un dossier."""
    try:
        return stat.S_ISDIR(sftp.stat(path).st_mode)
    except FileNotFoundError:
        return False


def reopen_sftp(ssh_client: paramiko.SSHClient) -> paramiko.SFTPClient:
    """Ouvre un nouveau canal SFTP quand la session courante a été coupée."""
    return ssh_client.open_sftp()


def download_with_retry(
    ssh_client: paramiko.SSHClient,
    sftp: paramiko.SFTPClient,
    remote_file_path: str,
    local_file_path: Path,
) -> tuple[paramiko.SFTPClient, bool]:
    """
    Télécharge un fichier distant avec une reprise sur nouvelle session SFTP
    si le canal courant a été fermé par le serveur.
    """
    retriable_errors = (
        EOFError,
        OSError,
        paramiko.SSHException,
    )

    for attempt in range(2):
        try:
            sftp.get(remote_file_path, str(local_file_path))
            return sftp, True
        except retriable_errors as exc:
            if attempt == 0:
                logger.warning(
                    f"  ↻ Session SFTP interrompue, nouvelle tentative : {local_file_path.name} ({exc})"
                )
                try:
                    sftp.close()
                except Exception:
                    pass
                sftp = reopen_sftp(ssh_client)
                continue
            return sftp, False

    return sftp, False


# ─────────────────────────────────────────────────────────────
#  COLLECTE PAR TERMINAL ID
# ─────────────────────────────────────────────────────────────

def collect_terminal_files(
    ssh_client  : paramiko.SSHClient,
    sftp         : paramiko.SFTPClient,
    terminal_id  : str,
    remote_base  : str,
    archive_root : Path,
) -> dict:
    """
    Collecte tous les fichiers TX d'un dossier Terminal ID distant
    et les archive dans la structure D:\\Archive_TX\\{ID}\\{YYYY}\\{MM}\\.

    Validations appliquées sur chaque fichier :
      1. Nom conforme : TX{AAAAMMJJ}TerID{TerminalID}.txt
      2. Terminal ID dans le nom = ID actuel du dossier (sinon ignoré,
         y compris pour un ancien ID de migration connue)
      3. Pas de doublon : on ne re-télécharge que si le fichier distant est plus récent
    """
    stats = {
        "terminal_id"        : terminal_id,
        "files_found"        : 0,
        "files_valid"        : 0,
        "files_copied"       : 0,
        "files_skipped"      : 0,
        "files_invalid_name"   : 0,
        "files_id_mismatch"    : 0,   # rejetés : ID ≠ ID actuel du DAB (ancien ID ou autre DAB)
        "errors"               : 0,
        "details"            : [],
    }

    # Chemin SFTP du dossier distant — slashes obligatoires pour SFTP
    remote_dir = f"{remote_base}/{terminal_id}"

    if not is_remote_dir(sftp, remote_dir):
        logger.warning(f"⚠️  Dossier distant introuvable : {remote_dir}")
        stats["errors"] += 1
        return stats

    logger.info(f"\n📂 Terminal [{terminal_id}] — lecture de {remote_dir}")

    try:
        remote_entries = sftp.listdir_attr(remote_dir)
    except Exception as e:
        logger.error(f"❌ Impossible de lister {remote_dir} : {e}")
        stats["errors"] += 1
        return stats

    for entry in remote_entries:
        if stat.S_ISDIR(entry.st_mode):
            continue   # ignorer les sous-dossiers éventuels

        filename = entry.filename
        stats["files_found"] += 1

        # ── Validation 1 : format du nom de fichier ───────────────────
        meta = parse_tx_filename(filename)
        if meta is None:
            logger.warning(f"  ⚠ Nom invalide (ignoré) : {filename}")
            stats["files_invalid_name"] += 1
            continue

        # ── Validation 2 : Terminal ID du fichier vs ID ACTUEL du DAB ──
        #
        #  Le DAB "actuel" traité = `terminal_id` (nom du dossier en cours,
        #  qui représente l'ID actuellement enregistré pour ce DAB).
        #  Seuls les fichiers qui correspondent à ce DAB précis sont
        #  conservés ; tout le reste est ignoré.
        #
        check = check_terminal_id(meta["terminal_id"], terminal_id)

        if check == "MISMATCH_INCONNU":
            logger.warning(
                f"  ⚠ Terminal ID ne correspond pas au DAB actuel (ignoré) : {filename} "
                f"[fichier={meta['terminal_id']}, DAB actuel={terminal_id}] "
                f"— ancien ID après migration ou fichier d'un autre DAB, "
                f"non collecté par règle métier (seul l'ID le plus récent est pris)"
            )
            stats["files_id_mismatch"] += 1
            continue

        stats["files_valid"] += 1

        # ── Construction du chemin local d'archivage ──────────────────
        #
        #  Règle : le dossier de 1er niveau = ID actuel du terminal
        #          même si le fichier porte un ancien ID (migration)
        #
        #  Ex : TX20231025TerID031002.txt dans dossier 100203
        #       → D:\Archive_TX\100203\2023\10\TX20231025TerID031002.txt
        #
        folder_id      = resolve_folder_id(meta["terminal_id"])
        local_dir      = build_local_path(archive_root, folder_id, meta["date_fichier"])
        local_file_path = local_dir / filename
        remote_file_path = f"{remote_dir}/{filename}"

        # ── Validation 3 : éviter les doublons ───────────────────────
        if local_file_path.exists():
            if local_file_path.stat().st_mtime >= entry.st_mtime:
                logger.info(f"  ⏭  Déjà à jour : {filename}")
                stats["files_skipped"] += 1
                continue

        # ── Téléchargement ────────────────────────────────────────────
        try:
            local_dir.mkdir(parents=True, exist_ok=True)
            sftp, downloaded = download_with_retry(
                ssh_client       = ssh_client,
                sftp             = sftp,
                remote_file_path = remote_file_path,
                local_file_path  = local_file_path,
            )
            if not downloaded:
                raise ConnectionError("Téléchargement impossible après reprise SFTP")

            tx_info = analyze_tx_file(local_file_path)
            logger.info(
                f"  ✅ {filename}\n"
                f"     → {local_file_path}\n"
                f"     TR={tx_info['nb_lignes_tr']}  "
                f"CH={tx_info['nb_lignes_ch']}  "
                f"DE={tx_info['nb_lignes_de']}  "
                f"[{tx_info['disponibilite']}]"
            )
            stats["files_copied"] += 1
            stats["details"].append({
                "filename"           : filename,
                "chemin_local"       : str(local_file_path),
                "date_fichier"       : meta["date_fichier"].isoformat(),
                "terminal_id_fichier": meta["terminal_id"],
                **tx_info,
            })

        except Exception as e:
            logger.error(f"  ❌ Erreur téléchargement {filename} : {e}")
            stats["errors"] += 1

    return stats


# ─────────────────────────────────────────────────────────────
#  RÉSUMÉ FINAL
# ─────────────────────────────────────────────────────────────

def print_summary(all_stats: list[dict], duration_seconds: float) -> None:
    lines = [
        "",
        "═" * 62,
        "          RÉSUMÉ DE LA COLLECTE TX DAB",
        "═" * 62,
        f"  Durée                    : {duration_seconds:.1f}s",
        f"  Terminaux traités        : {len(all_stats)}",
        f"  Fichiers trouvés         : {sum(s['files_found']        for s in all_stats)}",
        f"  Fichiers valides         : {sum(s['files_valid']        for s in all_stats)}",
        f"  Fichiers copiés          : {sum(s['files_copied']       for s in all_stats)}",
        f"  Déjà à jour (ignorés)    : {sum(s['files_skipped']      for s in all_stats)}",
        f"  Noms invalides (rejetés) : {sum(s['files_invalid_name'] for s in all_stats)}",
        f"  ID ≠ DAB actuel (rejetés): {sum(s['files_id_mismatch']  for s in all_stats)}",
        f"  Erreurs                  : {sum(s['errors']             for s in all_stats)}",
        "─" * 62,
        "  Détail par Terminal :",
    ]

    for s in all_stats:
        icon = "✅" if s["errors"] == 0 else "⚠️ "
        lines.append(
            f"\n  {icon} [{s['terminal_id']}]  "
            f"trouvés={s['files_found']:3d}  copiés={s['files_copied']:3d}  "
            f"ignorés={s['files_skipped']:3d}  "
            f"rejetés={s['files_invalid_name'] + s['files_id_mismatch']:3d}  "
            f"erreurs={s['errors']:3d}"
        )
        for d in s.get("details", []):
            lines.append(f"     → {d['chemin_local']}")
            lines.append(
                f"       TR={d['nb_lignes_tr']:4d}  "
                f"CH={d['nb_lignes_ch']:3d}  "
                f"DE={d['nb_lignes_de']:3d}  "
                f"[{d['disponibilite']}]"
            )

    lines.append("\n" + "═" * 62)
    logger.info("\n".join(lines))


# ─────────────────────────────────────────────────────────────
#  POINT D'ENTRÉE
# ─────────────────────────────────────────────────────────────

def main():
    start_time = datetime.now()
    logger.info("=" * 62)
    logger.info(f"  COLLECTE TX DAB — {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"  Archive locale  : {ARCHIVE_ROOT}")
    logger.info(f"  PC distant      : {SSH_CONFIG['hostname']}")
    logger.info("=" * 62)

    all_stats  = []
    ssh_client = None

    try:
        ssh_client = create_ssh_client()
        sftp = ssh_client.open_sftp()

        for terminal_id in TERMINAL_IDS:
            stats = collect_terminal_files(
                ssh_client   = ssh_client,
                sftp         = sftp,
                terminal_id  = terminal_id,
                remote_base  = REMOTE_DESKTOP_PATH,
                archive_root = ARCHIVE_ROOT,
            )
            all_stats.append(stats)

        sftp.close()

    except Exception as e:
        logger.error(f"❌ Erreur critique : {e}")
    finally:
        if ssh_client:
            ssh_client.close()
            logger.info("🔌 Connexion SSH fermée.")

    duration = (datetime.now() - start_time).total_seconds()
    print_summary(all_stats, duration)


if __name__ == "__main__":
    main()