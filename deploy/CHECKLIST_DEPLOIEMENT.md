# Checklist de deploiement — Tunisys_Dab (IIS, HTTP, stage/demo)

Deploiement en **HTTP** (choix assume pour un environnement de stage/demo).
HTTPS est prevu pour une eventuelle mise en production reelle, avec un
certificat de l'institution — non traite dans cette checklist.

A suivre **dans l'ordre**, sur le serveur Windows cible.

---

## Prerequis

- [ ] PostgreSQL 15+ installe et le service PostgreSQL est demarre.
- [ ] La base `Tunisys_Dab` est creee (role `postgres` ou dedie, avec mot de passe connu).
- [ ] Le code du projet est copie sur le serveur dans
      `C:\Users\Administrator\Desktop\Tunisys_Dab` (arborescence complete :
      `backend\`, `frontend\`, `migrations\`, `Tunisys_Dab.sql`, `deploy\`).
- [ ] Module IIS **URL Rewrite** installe.
- [ ] Module IIS **Application Request Routing (ARR)** installe.
- [ ] Le **proxy ARR est active** : IIS Manager → noeud SERVEUR (pas le site)
      → *Application Request Routing Cache* → *Server Proxy Settings...* →
      case **Enable proxy** cochee. **Sans cette case, `/api/*` renverra
      404 ou 502.**
- [ ] **NSSM** telecharge et `nssm.exe` accessible dans le PATH systeme.

---

## Base de donnees (schema initial + migrations)

> Ce projet n'utilise pas Alembic. Le schema est gere via un dump SQL
> complet et des fichiers de migration bruts, **non idempotents** (rejouer
> un fichier deja applique provoque une erreur, ex. colonne deja renommee).
> A faire manuellement, avec prudence, avant de demarrer le service backend.

- [ ] Si la base est neuve : appliquer le schema initial complet
      ```powershell
      psql -h localhost -U postgres -d Tunisys_Dab -f "C:\Users\Administrator\Desktop\Tunisys_Dab\Tunisys_Dab.sql"
      ```
- [ ] Appliquer chaque migration de `migrations\*.up.sql` **dans l'ordre du
      prefixe numerique**, une seule fois chacune :
      ```powershell
      psql -h localhost -U postgres -d Tunisys_Dab -f "C:\Users\Administrator\Desktop\Tunisys_Dab\migrations\001_transaction_num_autorisation_monetique.up.sql"
      ```
- [ ] Noter quelque part (ex. ce fichier, coche a la main) quelles
      migrations ont deja ete appliquees sur cette base, puisqu'il n'y a
      pas de table de suivi automatique.

---

## Backend

- [ ] Copier `deploy\.env.example` vers `backend\.env` et renseigner les
      valeurs reelles : `DB_PASSWORD`, `JWT_SECRET_KEY` (a generer),
      `CORS_ORIGINS` (URL reelle du site IIS). Voir les commentaires du
      fichier pour la commande de generation de chaque cle.
- [ ] Depuis `backend\`, executer `deploy\install_service.ps1` (PowerShell
      en administrateur) :
      - [ ] Cree le venv `.venv` (idempotent, ignore s'il existe deja).
      - [ ] Installe `requirements.txt` tel quel (ne pas le regenerer :
            versions figees fastapi 0.116.1 / uvicorn 0.35.0).
      - [ ] Le script demande confirmation que le schema DB est a jour
            (voir section precedente) avant de continuer.
      - [ ] Installe/replace le service NSSM `Tunisys_Dab_Backend`
            (`python.exe` du venv, arguments `-m uvicorn app.main:app
            --host 127.0.0.1 --port 8000`, **sans** `--reload`, startup
            directory = `backend\`).
      - [ ] Configure le service en demarrage automatique et le demarre.
- [ ] Executer `deploy\healthcheck.ps1` : doit afficher **SUCCES (HTTP 200)**
      sur `http://127.0.0.1:8000/health`.

---

## Frontend

- [ ] Verifier que `frontend\dist` est un build **recent**, genere avec
      `VITE_USE_MOCK=false` (ou variable equivalente desactivant les mocks)
      et une base API relative `/api` (pas d'URL absolue `http://localhost:8000`
      codee en dur — sinon le reverse-proxy IIS ne sera jamais sollicite).
- [ ] Si le build est ancien ou incertain : reconstruire depuis le poste de
      dev puis recopier `frontend\dist` sur le serveur :
      ```powershell
      npm run build
      ```
- [ ] Verifier que `frontend\dist\index.html` et les assets (`assets\...`)
      sont bien presents dans le dossier copie sur le serveur.

---

## IIS

- [ ] Creer un site IIS pointant sur `C:\Users\Administrator\Desktop\Tunisys_Dab\frontend\dist`
      comme racine physique.
- [ ] Copier `deploy\web.config` a la racine de ce meme dossier
      (`frontend\dist\web.config`).
- [ ] Configurer un binding **HTTP** (port 80, ou port dedie) — aucun
      binding HTTPS/SSL a ce stade.
- [ ] Redemarrer le site (ou `iisreset`) apres la mise en place du
      `web.config` pour s'assurer que les regles de reecriture sont prises
      en compte.

---

## Pare-feu

- [ ] Verifier que rien ne bloque la communication **locale** IIS →
      `127.0.0.1:8000` (en general aucune regle de pare-feu Windows ne
      bloque le loopback, mais a verifier si une politique de securite
      restrictive est en place sur le serveur).
- [ ] Le port 8000 ne doit **pas** etre expose au-dela de la machine
      (le backend ecoute sur 127.0.0.1 uniquement — voir point d'attention
      ci-dessous si jamais une regle de pare-feu entrant a ete ouverte par
      erreur sur ce port).

---

## Tests bout-en-bout

- [ ] Ouvrir le site IIS dans un navigateur (URL/port du binding HTTP).
- [ ] Se connecter (login) avec un compte utilisateur existant.
- [ ] Ouvrir les outils de developpement du navigateur (onglet Reseau) et
      verifier qu'un appel `/api/...` renvoie bien du **JSON** avec
      l'enveloppe attendue `{ "status": ..., "data": ..., "meta": ... }`
      (et non une page HTML — signe que le reverse-proxy ne fonctionne pas).
- [ ] Naviguer vers une route interne (ex. `/dashboard/...`) puis faire un
      **F5 (refresh)** sur cette route : la page doit se recharger
      correctement (fallback SPA du `web.config`), pas de 404 IIS.
- [ ] Redemarrer le serveur (ou au minimum le service NSSM +
      `iisreset`) et verifier que tout redemarre correctement seul :
      service `Tunisys_Dab_Backend` en `Running`, site IIS accessible,
      `healthcheck.ps1` en succes.

---

## ⚠️ Points qui coincent (a surveiller en priorite)

- **Ordre des regles dans `web.config`** : la regle `/api` doit etre
  evaluee AVANT le fallback SPA, et le fallback doit explicitement exclure
  les chemins `api/`. Si inversee, les appels API renvoient `index.html`
  au lieu de JSON (bug silencieux cote frontend, souvent visible comme un
  ecran blanc ou une erreur de parsing JSON).
- **Proxy ARR non active** : symptome typique = `404` ou `502` sur tous
  les appels `/api/...`, alors que le site statique fonctionne
  normalement. Verifier *Enable proxy* au niveau serveur (pas seulement le
  module ARR installe — il faut aussi l'activer explicitement).
- **Pare-feu bloquant le port 8000 en local** : symptome = le healthcheck
  echoue avec une erreur de connexion alors que le service NSSM est
  `Running`. Rare en loopback, mais possible si une politique de
  securite du serveur bride explicitement certains ports meme en local.
- **Migrations rejouees par erreur** : les fichiers `migrations\*.up.sql`
  ne sont pas idempotents. Ne jamais relancer un fichier deja applique
  sur une base qui a deja recu la migration precedente.
