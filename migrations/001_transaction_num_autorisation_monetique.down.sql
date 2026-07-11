-- Downgrade de la migration 001.
--
-- is_cardless est recréé à FALSE pour toutes les lignes existantes : la
-- valeur d'origine n'est pas récupérable une fois numero_carte supprimé.

BEGIN;

ALTER TABLE transaction ADD COLUMN is_cardless BOOLEAN DEFAULT FALSE;

ALTER TABLE transaction DROP COLUMN numero_carte;

CREATE INDEX idx_transaction_cardless ON transaction (is_cardless);

ALTER TABLE transaction
    RENAME COLUMN num_autorisation_monetique TO num_seq_dab;

COMMIT;
