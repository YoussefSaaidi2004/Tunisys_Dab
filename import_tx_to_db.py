#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_tx_to_db.py

Module Parser TX + insertion en base PostgreSQL.

Rôle :
    - Parcourt l'archive locale des fichiers TX collectés par le script SSH/SFTP
      (structure : Racine/{TerminalID}/{YYYY}/{MM}/TX{AAAAMMJJ}TerID{TerminalID}.txt)
    - Parse les lignes TR / CH / DE selon les règles définies dans le document
      d'analyse de l'existant.
    - Gère les fichiers vides (OPERATIONNEL_SANS_TX) et le filtrage par
      Terminal ID : en cas de changement d'ID, seuls les fichiers portant le
      Terminal ID ACTUEL (le plus récent) sont traités ; les fichiers portant
      un ancien Terminal ID sont ignorés (atm_id_historique ne sert qu'à la
      traçabilité de la migration, pas au rattachement des anciens fichiers).
    - Insère les données dans PostgreSQL via SQLAlchemy (Core), de façon
      idempotente (ré-import sans doublons grâce à la contrainte UNIQUE
      (terminal_id, date_fichier) sur tx_file).

Prérequis :
    pip install sqlalchemy psycopg2-binary python-dotenv

Configuration :
    Variables d'environnement (ou fichier .env) :
        DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
        ARCHIVE_ROOT  (ex: C:\\Archive_TX)

Usage :
    python import_tx_to_db.py                     # importe tous les fichiers non encore traités
    python import_tx_to_db.py --file <chemin.txt>  # importe un seul fichier
    python import_tx_to_db.py --terminal 120001     # importe uniquement un terminal
"""

import argparse
import getpass
import logging
import os
import re
import sys
from datetime import datetime, date, time
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, URL
from sqlalchemy.exc import IntegrityError

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

# ------------------------------------------------------------------
# Configuration & logging
# ------------------------------------------------------------------

def load_environment() -> None:
    env_path = Path(__file__).with_name(".env")

    if load_dotenv is not None:
        load_dotenv(env_path)
        return

    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


load_environment()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "Tunisys_Dab")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD") or "123456"

ARCHIVE_ROOT = Path(os.getenv("ARCHIVE_ROOT", r"C:\Archive_TX"))

FICHIER_ENCODING = "cp1252"
TAILLE_FICHIER_VIDE_OCTETS = 100  # < 100 octets = considéré comme vide

LOG_DIR = Path(os.getenv("LOG_DIR", r"C:\DAB_Solution\logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / f"import_tx_{date.today().isoformat()}.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("import_tx")

# Regex du nom de fichier : TX{AAAAMMJJ}TerID{TerminalID}.txt
FILENAME_PATTERN = re.compile(
    r"^TX(?P<date>\d{8})TerID(?P<terminal_id>\d{6})\.txt$", re.IGNORECASE
)


# ------------------------------------------------------------------
# Connexion base de données
# ------------------------------------------------------------------


def resolve_db_password() -> str:
    if DB_PASSWORD:
        return DB_PASSWORD

    if not sys.stdin.isatty():
        raise RuntimeError(
            "DB_PASSWORD est vide dans .env et aucun terminal interactif n'est disponible. "
            "Renseignez DB_PASSWORD dans .env ou configurez .pgpass/PGPASSWORD."
        )

    return getpass.getpass(f"Mot de passe PostgreSQL pour {DB_USER}: ")

def get_engine() -> Engine:
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DB_USER,
        password=resolve_db_password() or None,
        host=DB_HOST,
        port=int(DB_PORT),
        database=DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


# ------------------------------------------------------------------
# Fonctions utilitaires de parsing
# ------------------------------------------------------------------

def parse_date_jjmmaa(date_str: str) -> date:
    """Convertit JJ/MM/AA en objet date (année 2000+AA)."""
    jour, mois, an = date_str.split("/")
    annee = 2000 + int(an)
    return date(annee, int(mois), int(jour))


def parse_heure_tr(heure_str: str) -> time:
    """Convertit HHMMSS (sans séparateur) en objet time."""
    heure_str = heure_str.strip().zfill(6)
    return time(int(heure_str[0:2]), int(heure_str[2:4]), int(heure_str[4:6]))


def parse_heure_chde(heure_str: str) -> time:
    """Convertit HH:MM:SS (avec séparateurs) en objet time."""
    h, m, s = heure_str.strip().split(":")
    return time(int(h), int(m), int(s))


def montant_to_numeric(montant_str: str) -> float:
    """Convertit un champ montant brut (ex: '0100') en valeur numérique DT."""
    return float(montant_str)


def parse_filename(filename: str) -> Optional[dict]:
    """Extrait date_fichier et terminal_id depuis le nom du fichier."""
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    date_fichier = datetime.strptime(m.group("date"), "%Y%m%d").date()
    return {"date_fichier": date_fichier, "terminal_id": m.group("terminal_id")}


# ------------------------------------------------------------------
# Résolution du terminal (gestion changement de Terminal ID)
# ------------------------------------------------------------------

def resoudre_atm(conn, terminal_id_fichier: str) -> Optional[dict]:
    """
    Détermine l'atm.id correspondant au terminal_id présent dans le nom du
    fichier.

    Règle métier (validée avec l'encadrant) :
        En cas de changement de Terminal ID, SEULS les fichiers portant le
        Terminal ID ACTUEL (le plus récent, enregistré dans atm.terminal_id)
        sont collectés et traités. Les fichiers portant un ancien Terminal ID
        (avant migration) sont ignorés, même si la migration est tracée dans
        atm_id_historique. La table atm_id_historique sert uniquement à
        conserver une trace de la migration (audit/traçabilité), pas à
        rattacher rétroactivement d'anciens fichiers.

        - Si terminal_id_fichier correspond à atm.terminal_id (ID courant) -> OK.
        - Sinon, si une migration est enregistrée dans atm_id_historique -> OK.
        - Sinon -> fichier ignoré (terminal totalement inconnu).
    """
    row = conn.execute(
        text("SELECT id, terminal_id FROM atm WHERE terminal_id = :tid"),
        {"tid": terminal_id_fichier},
    ).fetchone()
    if row:
        return {"atm_id": row.id, "terminal_id_actuel": row.terminal_id}

    row = conn.execute(
        text(
            """
            SELECT a.id, h.terminal_id_nouveau AS terminal_id
            FROM atm_id_historique h
            JOIN atm a ON a.id = h.atm_id
            WHERE h.terminal_id_nouveau = :tid
            ORDER BY h.id DESC
            LIMIT 1
            """
        ),
        {"tid": terminal_id_fichier},
    ).fetchone()
    if row:
        return {"atm_id": row.id, "terminal_id_actuel": row.terminal_id}

    return None


# ------------------------------------------------------------------
# Insertion tx_file (avec gestion vide / absent)
# ------------------------------------------------------------------

def upsert_tx_file(conn, atm_id: int, terminal_id: str, nom_fichier: str,
                    date_fichier: date, chemin_local: str,
                    statut: str, disponibilite: str,
                    nb_tr: int = 0, nb_ch: int = 0, nb_de: int = 0,
                    message_erreur: Optional[str] = None) -> int:
    """
    Insère ou met à jour l'enregistrement tx_file (idempotent grâce à la
    contrainte UNIQUE (terminal_id, date_fichier)).
    Retourne l'id de la ligne tx_file.
    """
    result = conn.execute(
        text(
            """
            INSERT INTO tx_file
                (atm_id, terminal_id, nom_fichier, date_fichier, chemin_local,
                 nb_lignes_tr, nb_lignes_ch, nb_lignes_de, statut, disponibilite,
                 message_erreur)
            VALUES
                (:atm_id, :terminal_id, :nom_fichier, :date_fichier, :chemin_local,
                 :nb_tr, :nb_ch, :nb_de, :statut, :disponibilite, :message_erreur)
            ON CONFLICT (terminal_id, date_fichier) DO UPDATE SET
                chemin_local = EXCLUDED.chemin_local,
                nb_lignes_tr = EXCLUDED.nb_lignes_tr,
                nb_lignes_ch = EXCLUDED.nb_lignes_ch,
                nb_lignes_de = EXCLUDED.nb_lignes_de,
                statut = EXCLUDED.statut,
                disponibilite = EXCLUDED.disponibilite,
                message_erreur = EXCLUDED.message_erreur
            RETURNING id
            """
        ),
        {
            "atm_id": atm_id,
            "terminal_id": terminal_id,
            "nom_fichier": nom_fichier,
            "date_fichier": date_fichier,
            "chemin_local": chemin_local,
            "nb_tr": nb_tr,
            "nb_ch": nb_ch,
            "nb_de": nb_de,
            "statut": statut,
            "disponibilite": disponibilite,
            "message_erreur": message_erreur,
        },
    )
    return result.scalar_one()


def purger_donnees_existantes(conn, tx_file_id: int) -> None:
    """
    Supprime les transactions et événements cassettes déjà liés à ce
    tx_file_id, pour permettre un ré-import propre (idempotence du contenu,
    pas seulement du fichier).
    """
    conn.execute(text("DELETE FROM transaction WHERE tx_file_id = :id"), {"id": tx_file_id})
    conn.execute(text("DELETE FROM cassette_event WHERE tx_file_id = :id"), {"id": tx_file_id})


# ------------------------------------------------------------------
# Parsing d'une ligne TR
# ------------------------------------------------------------------

def parse_ligne_tr(champs: list, tx_file_id: int, atm_id: int, cardless_pan: str,
                    ligne_num: int) -> Optional[dict]:
    """
    Format TR :
    {SeqDAB}|TR|{TerminalID}|{Date}|{Heure}|{SeqMonetique}|{Montant}|{NumeroCarte}|{ResteCoffre}|
    """
    if len(champs) < 9:
        logger.warning("Ligne TR %d malformée (champs insuffisants) : %s", ligne_num, champs)
        return None
    try:
        num_seq_dab = champs[0]
        date_operation = parse_date_jjmmaa(champs[3])
        heure_operation = parse_heure_tr(champs[4])
        montant = montant_to_numeric(champs[6])
        numero_carte = champs[7]
        reste_coffre = montant_to_numeric(champs[8])
    except (ValueError, IndexError) as e:
        logger.warning("Ligne TR %d invalide (%s) : %s", ligne_num, e, champs)
        return None

    datetime_operation = datetime.combine(date_operation, heure_operation)
    is_cardless = (numero_carte.strip() == cardless_pan.strip())

    return {
        "tx_file_id": tx_file_id,
        "atm_id": atm_id,
        "num_seq_dab": num_seq_dab,
        "date_operation": date_operation,
        "heure_operation": heure_operation,
        "datetime_operation": datetime_operation,
        "montant": montant,
        "reste_coffre": reste_coffre,
        "is_cardless": is_cardless,
    }


# ------------------------------------------------------------------
# Parsing d'une ligne CH / DE
# ------------------------------------------------------------------

def parse_ligne_chde(champs: list, type_ligne: str, tx_file_id: int, atm_id: int,
                      ligne_num: int) -> Optional[dict]:
    """
    Format CH/DE :
    {SeqDAB}|CH|{TerminalID}|{Date}|{Heure}|{Rejet}|{Caisse1}|{Caisse2}|...{CaisseN}|

    Le champ Rejet est au format {0}:{nb_billets} (ID=0 désigne la cassette
    de rejet). Les caisses suivantes sont au format {dénomination}:{nb_billets},
    en nombre variable, lues dynamiquement jusqu'à la fin de la ligne.
    """
    if len(champs) < 6:
        logger.warning("Ligne %s %d malformée (champs insuffisants) : %s", type_ligne, ligne_num, champs)
        return None
    try:
        num_seq_dab = champs[0]
        date_evenement = parse_date_jjmmaa(champs[3])
        heure_evenement = parse_heure_chde(champs[4])

        # Champ rejet : "0:58"
        rejet_id, rejet_nb = champs[5].split(":")
        billets_rejet = int(rejet_nb)

        # Caisses : tous les champs restants non vides, à partir de l'index 6
        caisses = []
        for champ in champs[6:]:
            champ = champ.strip()
            if not champ:
                continue
            if ":" not in champ:
                continue
            denom_str, nb_str = champ.split(":")
            caisses.append({"denomination": int(denom_str), "nb_billets": int(nb_str)})

    except (ValueError, IndexError) as e:
        logger.warning("Ligne %s %d invalide (%s) : %s", type_ligne, ligne_num, e, champs)
        return None

    datetime_evenement = datetime.combine(date_evenement, heure_evenement)

    return {
        "tx_file_id": tx_file_id,
        "atm_id": atm_id,
        "num_seq_dab": num_seq_dab,
        "type_evenement": type_ligne,
        "date_evenement": date_evenement,
        "heure_evenement": heure_evenement,
        "datetime_evenement": datetime_evenement,
        "billets_rejet": billets_rejet,
        "nb_cassettes": len(caisses),
        "caisses": caisses,
    }


# ------------------------------------------------------------------
# Insertion en base d'une ligne TR / CH / DE
# ------------------------------------------------------------------

def inserer_transaction(conn, data: dict) -> None:
    conn.execute(
        text(
            """
            INSERT INTO transaction
                (tx_file_id, atm_id, num_seq_dab, date_operation, heure_operation,
                 datetime_operation, montant, reste_coffre, is_cardless)
            VALUES
                (:tx_file_id, :atm_id, :num_seq_dab, :date_operation, :heure_operation,
                 :datetime_operation, :montant, :reste_coffre, :is_cardless)
            """
        ),
        data,
    )


def inserer_cassette_event(conn, data: dict) -> int:
    result = conn.execute(
        text(
            """
            INSERT INTO cassette_event
                (tx_file_id, atm_id, num_seq_dab, type_evenement, date_evenement,
                 heure_evenement, datetime_evenement, billets_rejet, nb_cassettes)
            VALUES
                (:tx_file_id, :atm_id, :num_seq_dab, :type_evenement, :date_evenement,
                 :heure_evenement, :datetime_evenement, :billets_rejet, :nb_cassettes)
            RETURNING id
            """
        ),
        {k: v for k, v in data.items() if k != "caisses"},
    )
    cassette_event_id = result.scalar_one()

    for idx, caisse in enumerate(data["caisses"], start=1):
        conn.execute(
            text(
                """
                INSERT INTO cassette_etat
                    (cassette_event_id, numero_caisse, denomination, nb_billets)
                VALUES
                    (:cassette_event_id, :numero_caisse, :denomination, :nb_billets)
                """
            ),
            {
                "cassette_event_id": cassette_event_id,
                "numero_caisse": idx,
                "denomination": caisse["denomination"],
                "nb_billets": caisse["nb_billets"],
            },
        )
    return cassette_event_id


# ------------------------------------------------------------------
# Traitement d'un fichier TX complet
# ------------------------------------------------------------------

def traiter_fichier(engine: Engine, filepath: Path) -> bool:
    """
    Traite un fichier TX : résout le terminal, gère les cas vide/absent,
    parse les lignes et insère en base. Retourne True si succès.
    """
    filename = filepath.name
    info = parse_filename(filename)
    if info is None:
        logger.error("Nom de fichier non conforme, ignoré : %s", filename)
        return False

    terminal_id_fichier = info["terminal_id"]
    date_fichier = info["date_fichier"]

    with engine.begin() as conn:
        atm_info = resoudre_atm(conn, terminal_id_fichier)
        if atm_info is None:
            logger.warning(
                "Fichier ignoré — Terminal ID %s (%s) ne correspond pas au Terminal ID "
                "actuel d'aucun DAB enregistré (ancien ID après migration, ou terminal "
                "totalement inconnu)",
                terminal_id_fichier, filename,
            )
            return False

        atm_id = atm_info["atm_id"]

        # Récupération du cardless_pan configuré pour ce DAB
        cardless_pan = conn.execute(
            text("SELECT cardless_pan FROM atm WHERE id = :id"), {"id": atm_id}
        ).scalar_one()

        # Cas fichier absent (ne devrait pas arriver ici, géré en amont par le
        # script de collecte, mais on le gère par robustesse)
        if not filepath.exists():
            upsert_tx_file(
                conn, atm_id, terminal_id_fichier, filename, date_fichier,
                str(filepath), statut="ABSENT", disponibilite="INDISPONIBLE",
            )
            logger.info("Fichier absent enregistré : %s", filename)
            return True

        taille = filepath.stat().st_size

        # Cas fichier vide
        if taille < TAILLE_FICHIER_VIDE_OCTETS:
            upsert_tx_file(
                conn, atm_id, terminal_id_fichier, filename, date_fichier,
                str(filepath), statut="VIDE", disponibilite="OPERATIONNEL_SANS_TX",
            )
            logger.info("Fichier vide enregistré (DAB sans activité) : %s", filename)
            return True

        # Lecture du contenu
        try:
            contenu = filepath.read_text(encoding=FICHIER_ENCODING)
        except UnicodeDecodeError as e:
            upsert_tx_file(
                conn, atm_id, terminal_id_fichier, filename, date_fichier,
                str(filepath), statut="ERREUR", disponibilite="OPERATIONNEL",
                message_erreur=f"Erreur d'encodage : {e}",
            )
            logger.error("Erreur d'encodage sur %s : %s", filename, e)
            return False

        lignes = contenu.splitlines()

        # Première ligne toujours vide -> ignorée systématiquement
        if lignes and lignes[0].strip() == "":
            lignes = lignes[1:]

        nb_tr = nb_ch = nb_de = 0
        nb_erreurs = 0

        # Création préalable de tx_file pour obtenir son id
        tx_file_id = upsert_tx_file(
            conn, atm_id, terminal_id_fichier, filename, date_fichier,
            str(filepath), statut="IMPORTE", disponibilite="OPERATIONNEL",
        )

        # Ré-import propre : on repart d'une base vide pour ce fichier
        purger_donnees_existantes(conn, tx_file_id)

        for i, ligne in enumerate(lignes, start=2):  # 2 car ligne 1 = vide ignorée
            ligne = ligne.strip()
            if not ligne:
                continue

            champs = ligne.split("|")
            type_ligne = champs[1].strip().upper() if len(champs) > 1 else ""

            # Vérification cohérence Terminal ID nom de fichier vs contenu
            # (les deux doivent être identiques au Terminal ID actuel, puisque
            # seuls ces fichiers sont désormais acceptés)
            terminal_id_ligne = champs[2].strip() if len(champs) > 2 else ""
            if terminal_id_ligne and terminal_id_ligne != atm_info["terminal_id_actuel"]:
                logger.warning(
                    "Divergence Terminal ID ligne %d : fichier=%s, ligne=%s (%s)",
                    i, terminal_id_fichier, terminal_id_ligne, filename,
                )

            if type_ligne == "TR":
                data = parse_ligne_tr(champs, tx_file_id, atm_id, cardless_pan, i)
                if data:
                    inserer_transaction(conn, data)
                    nb_tr += 1
                else:
                    nb_erreurs += 1

            elif type_ligne in ("CH", "DE"):
                data = parse_ligne_chde(champs, type_ligne, tx_file_id, atm_id, i)
                if data:
                    inserer_cassette_event(conn, data)
                    if type_ligne == "CH":
                        nb_ch += 1
                    else:
                        nb_de += 1
                else:
                    nb_erreurs += 1
            else:
                logger.warning("Type de ligne inconnu '%s' à la ligne %d de %s", type_ligne, i, filename)
                nb_erreurs += 1

        statut_final = "PARSE" if nb_erreurs == 0 else "ERREUR"
        message = None if nb_erreurs == 0 else f"{nb_erreurs} ligne(s) en erreur lors du parsing"

        upsert_tx_file(
            conn, atm_id, terminal_id_fichier, filename, date_fichier,
            str(filepath), statut=statut_final, disponibilite="OPERATIONNEL",
            nb_tr=nb_tr, nb_ch=nb_ch, nb_de=nb_de, message_erreur=message,
        )

        logger.info(
            "Fichier traité : %s | TR=%d CH=%d DE=%d erreurs=%d",
            filename, nb_tr, nb_ch, nb_de, nb_erreurs,
        )
        return nb_erreurs == 0


# ------------------------------------------------------------------
# Reconstitution des cycles de trésorerie (DE -> CH)
# ------------------------------------------------------------------

def reconstituer_cycles(engine: Engine, atm_id: Optional[int] = None) -> None:
    """
    Reconstitue les cycles de trésorerie : pour chaque événement DE non
    encore rattaché à un cycle, recherche la dernière ligne CH stable qui
    suit (avant la reprise des TR) et crée une ligne cycle_tresorerie.

    Règle simplifiée : la "dernière CH stable" est le dernier événement CH
    de même atm_id survenant après le DE et avant le prochain DE (ou avant
    la première transaction TR qui suit, si elle est antérieure).
    """
    with engine.begin() as conn:
        filtre_atm = "AND ce.atm_id = :atm_id" if atm_id else ""
        params = {"atm_id": atm_id} if atm_id else {}

        evenements_de = conn.execute(
            text(
                f"""
                SELECT ce.id, ce.atm_id, ce.datetime_evenement, ce.billets_rejet
                FROM cassette_event ce
                WHERE ce.type_evenement = 'DE'
                  AND NOT EXISTS (
                      SELECT 1 FROM cycle_tresorerie ct
                      WHERE ct.cassette_event_de_id = ce.id
                  )
                  {filtre_atm}
                ORDER BY ce.atm_id, ce.datetime_evenement
                """
            ),
            params,
        ).fetchall()

        for de in evenements_de:
            # Prochain DE du même terminal, pour borner la recherche
            prochain_de = conn.execute(
                text(
                    """
                    SELECT datetime_evenement FROM cassette_event
                    WHERE atm_id = :atm_id AND type_evenement = 'DE'
                      AND datetime_evenement > :dt
                    ORDER BY datetime_evenement ASC LIMIT 1
                    """
                ),
                {"atm_id": de.atm_id, "dt": de.datetime_evenement},
            ).fetchone()

            borne_sup = prochain_de.datetime_evenement if prochain_de else None

            # Dernière CH stable après ce DE et avant le prochain DE
            if borne_sup:
                ch_query = text(
                    """
                    SELECT id, datetime_evenement FROM cassette_event
                    WHERE atm_id = :atm_id AND type_evenement = 'CH'
                      AND datetime_evenement > :dt_de
                      AND datetime_evenement < :dt_sup
                    ORDER BY datetime_evenement DESC LIMIT 1
                    """
                )
                ch_params = {"atm_id": de.atm_id, "dt_de": de.datetime_evenement, "dt_sup": borne_sup}
            else:
                ch_query = text(
                    """
                    SELECT id, datetime_evenement FROM cassette_event
                    WHERE atm_id = :atm_id AND type_evenement = 'CH'
                      AND datetime_evenement > :dt_de
                    ORDER BY datetime_evenement DESC LIMIT 1
                    """
                )
                ch_params = {"atm_id": de.atm_id, "dt_de": de.datetime_evenement}

            derniere_ch = conn.execute(ch_query, ch_params).fetchone()
            if not derniere_ch:
                continue  # cycle incomplet, on ne le reconstitue pas encore

            # Montant chargé = somme(denomination * nb_billets) pour cette CH
            montant_charge = conn.execute(
                text(
                    """
                    SELECT COALESCE(SUM(denomination * nb_billets), 0)
                    FROM cassette_etat
                    WHERE cassette_event_id = :ch_id
                    """
                ),
                {"ch_id": derniere_ch.id},
            ).scalar_one()

            # Montant restant avant DE = reste_coffre de la dernière TR avant le DE
            montant_restant = conn.execute(
                text(
                    """
                    SELECT reste_coffre FROM transaction
                    WHERE atm_id = :atm_id AND datetime_operation < :dt_de
                    ORDER BY datetime_operation DESC LIMIT 1
                    """
                ),
                {"atm_id": de.atm_id, "dt_de": de.datetime_evenement},
            ).scalar()

            conn.execute(
                text(
                    """
                    INSERT INTO cycle_tresorerie
                        (atm_id, datetime_dechargement, datetime_chargement,
                         montant_charge, montant_restant_avant_de, nb_billets_rejet,
                         cassette_event_de_id, cassette_event_ch_id)
                    VALUES
                        (:atm_id, :dt_de, :dt_ch, :montant_charge, :montant_restant,
                         :nb_rejet, :de_id, :ch_id)
                    """
                ),
                {
                    "atm_id": de.atm_id,
                    "dt_de": de.datetime_evenement,
                    "dt_ch": derniere_ch.datetime_evenement,
                    "montant_charge": montant_charge,
                    "montant_restant": montant_restant or 0,
                    "nb_rejet": de.billets_rejet,
                    "de_id": de.id,
                    "ch_id": derniere_ch.id,
                },
            )
            logger.info(
                "Cycle de trésorerie créé pour atm_id=%s (DE %s -> CH %s)",
                de.atm_id, de.datetime_evenement, derniere_ch.datetime_evenement,
            )


# ------------------------------------------------------------------
# Découverte des fichiers à traiter
# ------------------------------------------------------------------

def lister_fichiers_a_traiter(terminal_filtre: Optional[str] = None) -> list:
    """Parcourt ARCHIVE_ROOT et retourne tous les .txt correspondant au format TX."""
    fichiers = []
    if not ARCHIVE_ROOT.exists():
        logger.error("Répertoire d'archive introuvable : %s", ARCHIVE_ROOT)
        return fichiers

    for path in ARCHIVE_ROOT.rglob("*.txt"):
        if parse_filename(path.name) is None:
            continue
        if terminal_filtre and terminal_filtre not in path.name:
            continue
        fichiers.append(path)

    return sorted(fichiers)


# ------------------------------------------------------------------
# Point d'entrée
# ------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Import des fichiers TX collectés vers PostgreSQL")
    parser.add_argument("--file", type=str, help="Traiter un seul fichier (chemin complet)")
    parser.add_argument("--terminal", type=str, help="Filtrer sur un Terminal ID donné")
    parser.add_argument("--skip-cycles", action="store_true",
                         help="Ne pas reconstituer les cycles de trésorerie après l'import")
    args = parser.parse_args()

    engine = get_engine()

    try:
        engine.connect().close()
    except Exception as e:
        logger.critical("Connexion à la base de données impossible : %s", e)
        sys.exit(1)

    if args.file:
        fichiers = [Path(args.file)]
    else:
        fichiers = lister_fichiers_a_traiter(terminal_filtre=args.terminal)

    logger.info("%d fichier(s) à traiter", len(fichiers))

    nb_succes = nb_echecs = 0
    for filepath in fichiers:
        try:
            if traiter_fichier(engine, filepath):
                nb_succes += 1
            else:
                nb_echecs += 1
        except IntegrityError as e:
            logger.error("Erreur d'intégrité sur %s : %s", filepath.name, e)
            nb_echecs += 1
        except Exception as e:
            logger.exception("Erreur inattendue sur %s : %s", filepath.name, e)
            nb_echecs += 1

    logger.info("Import terminé : %d succès, %d échec(s)", nb_succes, nb_echecs)

    if not args.skip_cycles:
        logger.info("Reconstitution des cycles de trésorerie...")
        atm_id_filtre = None
        if args.terminal:
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT id FROM atm WHERE terminal_id = :tid"),
                    {"tid": args.terminal},
                ).fetchone()
                atm_id_filtre = row.id if row else None
        reconstituer_cycles(engine, atm_id=atm_id_filtre)
        logger.info("Reconstitution des cycles terminée.")


if __name__ == "__main__":
    main()