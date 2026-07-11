-- Migration 001 : transaction.num_seq_dab -> num_autorisation_monetique
--                  transaction.is_cardless -> numero_carte
--
-- Contexte : num_seq_dab (champ 1 de la ligne TR) n'est plus stocké ; la
-- colonne est renommée et repeuplée par le champ 6 de la ligne TR
-- (num_seq_monetique) lors des prochains imports. is_cardless est remplacé
-- par le stockage du numéro de carte (numero_carte), potentiellement masqué
-- par le parser (voir MASK_PAN dans import_tx_to_db.py).
--
-- Cette migration ne réécrit pas les lignes existantes : les valeurs de
-- num_autorisation_monetique pour les transactions déjà importées restent
-- celles de l'ancien num_seq_dab tant qu'un ré-import n'est pas effectué.

BEGIN;

ALTER TABLE transaction
    RENAME COLUMN num_seq_dab TO num_autorisation_monetique;

ALTER TABLE transaction ADD COLUMN numero_carte VARCHAR(20);

DROP INDEX IF EXISTS idx_transaction_cardless;

ALTER TABLE transaction DROP COLUMN is_cardless;

COMMIT;
