import subprocess
from pathlib import Path


def run_collecte_et_import() -> dict[str, bool | str]:
    """
    Exécute en séquence les scripts collect_tx_files.py et import_tx_to_db.py.

    Retourne un dict avec :
        - collecte_ok: bool (True si collect_tx_files.py s'est exécuté avec code 0)
        - import_ok: bool (True si import_tx_to_db.py s'est exécuté avec code 0)
        - collecte_output: str (stdout + stderr du script de collecte)
        - import_output: str (stdout + stderr du script d'import)
    """
    # Chemins relatifs à la racine du repo
    repo_root = Path(__file__).resolve().parent.parent.parent
    collect_script = repo_root / "collect_tx_files.py"
    import_script = repo_root / "import_tx_to_db.py"

    result = {
        "collecte_ok": False,
        "import_ok": False,
        "collecte_output": "",
        "import_output": "",
    }

    # Étape 1 : Collecte des fichiers
    try:
        process = subprocess.run(
            ["python", str(collect_script)],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=300,
        )
        result["collecte_output"] = process.stdout + process.stderr
        result["collecte_ok"] = process.returncode == 0
    except subprocess.TimeoutExpired:
        result["collecte_output"] = "TIMEOUT: Collecte dépassée 300s"
    except Exception as e:
        result["collecte_output"] = f"ERREUR: {str(e)}"

    # Étape 2 : Import en base (seulement si collecte OK)
    if result["collecte_ok"]:
        try:
            process = subprocess.run(
                ["python", str(import_script)],
                cwd=str(repo_root),
                capture_output=True,
                text=True,
                timeout=300,
            )
            result["import_output"] = process.stdout + process.stderr
            result["import_ok"] = process.returncode == 0
        except subprocess.TimeoutExpired:
            result["import_output"] = "TIMEOUT: Import dépassé 300s"
        except Exception as e:
            result["import_output"] = f"ERREUR: {str(e)}"
    else:
        result["import_output"] = "Sauté : collecte a échoué"

    return result
