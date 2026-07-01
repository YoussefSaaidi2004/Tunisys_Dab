-- ============================================================
-- Solution Centralisée de Collecte et d'Analyse des Fichiers TX des DAB
-- Script de création du schéma PostgreSQL (10 tables)
-- Version 2.0 — Juin 2026
-- ============================================================

BEGIN;

-- ============================================================
-- DOMAINE ATM
-- ============================================================

-- Table 1 : atm — Référentiel des terminaux DAB
CREATE TABLE atm (
    id              SERIAL PRIMARY KEY,
    terminal_id     VARCHAR(20) NOT NULL UNIQUE,
    nom             VARCHAR(100) NOT NULL,
    adresse         TEXT,
    latitude        NUMERIC(10,7),
    longitude       NUMERIC(10,7),
    ip_address      VARCHAR(45),
    ssh_port        INTEGER DEFAULT 22,
    ssh_login       VARCHAR(100),
    ssh_password    TEXT,                       -- chiffré AES-256 côté applicatif
    chemin_remote   VARCHAR(255),
    actif           BOOLEAN DEFAULT TRUE,
    date_creation   TIMESTAMPTZ DEFAULT NOW(),
    notes           TEXT,
    cardless_pan    VARCHAR(20) DEFAULT '9999999999999999'
);

-- Table 2 : atm_id_historique — Historique des Terminal IDs
CREATE TABLE atm_id_historique (
    id                      SERIAL PRIMARY KEY,
    atm_id                  INTEGER NOT NULL REFERENCES atm(id) ON DELETE CASCADE,
    terminal_id_ancien      VARCHAR(20) NOT NULL,
    terminal_id_nouveau     VARCHAR(20) NOT NULL,
    date_changement         DATE NOT NULL,
    notes                   TEXT,
    CONSTRAINT uq_atm_id_historique UNIQUE (atm_id, terminal_id_ancien)
);

-- ============================================================
-- DOMAINE TX
-- ============================================================

-- Table 3 : tx_file — Fichiers TX importés
CREATE TABLE tx_file (
    id              SERIAL PRIMARY KEY,
    atm_id          INTEGER NOT NULL REFERENCES atm(id) ON DELETE CASCADE,
    terminal_id     VARCHAR(20) NOT NULL,
    nom_fichier     VARCHAR(100) NOT NULL,
    date_fichier    DATE NOT NULL,
    chemin_local    TEXT,
    date_import     TIMESTAMPTZ DEFAULT NOW(),
    nb_lignes_tr    INTEGER DEFAULT 0,
    nb_lignes_ch    INTEGER DEFAULT 0,
    nb_lignes_de    INTEGER DEFAULT 0,
    statut          VARCHAR(20) DEFAULT 'IMPORTE'
                        CHECK (statut IN ('IMPORTE','PARSE','VIDE','ERREUR','ABSENT')),
    disponibilite   VARCHAR(20) NOT NULL
                        CHECK (disponibilite IN ('OPERATIONNEL','OPERATIONNEL_SANS_TX','INDISPONIBLE')),
    message_erreur  TEXT,
    CONSTRAINT uq_tx_file UNIQUE (terminal_id, date_fichier)
);

-- Table 4 : transaction — Retraits individuels (lignes TR)
CREATE TABLE transaction (
    id                  BIGSERIAL PRIMARY KEY,
    tx_file_id          INTEGER NOT NULL REFERENCES tx_file(id) ON DELETE CASCADE,
    atm_id              INTEGER NOT NULL REFERENCES atm(id) ON DELETE CASCADE,
    num_seq_dab         VARCHAR(20) NOT NULL,
    date_operation      DATE NOT NULL,
    heure_operation     TIME NOT NULL,
    datetime_operation  TIMESTAMPTZ,
    montant             NUMERIC(12,3) NOT NULL CHECK (montant > 0),
    reste_coffre        NUMERIC(12,3) NOT NULL CHECK (reste_coffre >= 0),
    is_cardless         BOOLEAN DEFAULT FALSE
);

-- Table 5 : cassette_event — Événements cassettes (lignes CH/DE)
CREATE TABLE cassette_event (
    id                  BIGSERIAL PRIMARY KEY,
    tx_file_id          INTEGER NOT NULL REFERENCES tx_file(id) ON DELETE CASCADE,
    atm_id              INTEGER NOT NULL REFERENCES atm(id) ON DELETE CASCADE,
    num_seq_dab         VARCHAR(20) NOT NULL,
    type_evenement      CHAR(2) NOT NULL CHECK (type_evenement IN ('CH','DE')),
    date_evenement      DATE NOT NULL,
    heure_evenement     TIME NOT NULL,
    datetime_evenement  TIMESTAMPTZ,
    billets_rejet       INTEGER DEFAULT 0,
    nb_cassettes        INTEGER NOT NULL
);

-- Table 6 : cassette_etat — État par caisse physique
CREATE TABLE cassette_etat (
    id                  BIGSERIAL PRIMARY KEY,
    cassette_event_id   BIGINT NOT NULL REFERENCES cassette_event(id) ON DELETE CASCADE,
    numero_caisse       INTEGER NOT NULL CHECK (numero_caisse >= 1),
    denomination        INTEGER NOT NULL,
    nb_billets          INTEGER DEFAULT 0,
    montant             NUMERIC(12,3) GENERATED ALWAYS AS (nb_billets * denomination) STORED,
    CONSTRAINT uq_cassette_etat UNIQUE (cassette_event_id, numero_caisse)
);

-- Table 7 : cycle_tresorerie — Cycles reconstitués DE -> CH
CREATE TABLE cycle_tresorerie (
    id                          SERIAL PRIMARY KEY,
    atm_id                      INTEGER NOT NULL REFERENCES atm(id) ON DELETE CASCADE,
    datetime_dechargement       TIMESTAMPTZ NOT NULL,
    datetime_chargement         TIMESTAMPTZ,
    montant_charge              NUMERIC(12,3),
    montant_restant_avant_de    NUMERIC(12,3),
    montant_distribue           NUMERIC(12,3)
        GENERATED ALWAYS AS (montant_charge - montant_restant_avant_de) STORED,
    nb_billets_rejet            INTEGER DEFAULT 0,
    cassette_event_de_id        BIGINT REFERENCES cassette_event(id),
    cassette_event_ch_id        BIGINT REFERENCES cassette_event(id)
);

-- ============================================================
-- DOMAINE SÉCURITÉ
-- ============================================================

-- Table 8 : utilisateur — Comptes applicatifs
CREATE TABLE utilisateur (
    id                  SERIAL PRIMARY KEY,
    login               VARCHAR(50) NOT NULL UNIQUE,
    mot_de_passe_hash   TEXT NOT NULL,
    nom                 VARCHAR(100) NOT NULL,
    email               VARCHAR(150) UNIQUE,
    role                VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','AGENT','AUDITOR')),
    actif               BOOLEAN DEFAULT TRUE,
    date_creation       TIMESTAMPTZ DEFAULT NOW(),
    derniere_connexion  TIMESTAMPTZ
);

-- Table 9 : affectation_atm — Liaison utilisateur/terminal (rôle AGENT)
CREATE TABLE affectation_atm (
    id                  SERIAL PRIMARY KEY,
    utilisateur_id      INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    atm_id              INTEGER NOT NULL REFERENCES atm(id) ON DELETE CASCADE,
    date_affectation    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_affectation_atm UNIQUE (utilisateur_id, atm_id)
);

-- Table 10 : journal_audit — Journal des actions (écriture seule)
CREATE TABLE journal_audit (
    id              BIGSERIAL PRIMARY KEY,
    utilisateur_id  INTEGER REFERENCES utilisateur(id),
    action          VARCHAR(50) NOT NULL,
    ressource       VARCHAR(50),
    details         JSONB,
    adresse_ip      VARCHAR(45),
    horodatage      TIMESTAMPTZ DEFAULT NOW(),
    resultat        VARCHAR(10) CHECK (resultat IN ('SUCCES','ECHEC'))
);

-- ============================================================
-- INDEX DE PERFORMANCE
-- ============================================================

CREATE INDEX idx_transaction_atm_date       ON transaction (atm_id, date_operation);
CREATE INDEX idx_transaction_datetime        ON transaction (datetime_operation);
CREATE INDEX idx_transaction_tx_file         ON transaction (tx_file_id);
CREATE INDEX idx_transaction_cardless        ON transaction (is_cardless);

CREATE INDEX idx_cassette_event_atm_datetime ON cassette_event (atm_id, datetime_evenement);

CREATE INDEX idx_cycle_tresorerie_atm_de     ON cycle_tresorerie (atm_id, datetime_dechargement);

CREATE INDEX idx_tx_file_atm_date            ON tx_file (atm_id, date_fichier);
CREATE INDEX idx_tx_file_disponibilite       ON tx_file (disponibilite);

CREATE INDEX idx_journal_audit_user_date     ON journal_audit (utilisateur_id, horodatage);
CREATE INDEX idx_journal_audit_action_date   ON journal_audit (action, horodatage);

COMMIT;