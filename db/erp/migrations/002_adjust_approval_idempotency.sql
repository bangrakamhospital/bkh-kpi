-- 002: idempotency keys, two-person approval of stock adjustments,
-- schema_migrations closed to the app account.
-- PostgreSQL 14+. Runs in one transaction with search_path = erp.

-- Client-generated UUID per "create" action (requisition, receipt,
-- adjustment): a retried / double-clicked request returns the document
-- created the first time instead of a second one.
ALTER TABLE document ADD COLUMN idempotency_key uuid;
ALTER TABLE document ADD CONSTRAINT document_idempotency_key_uniq UNIQUE (idempotency_key);

-- Stock adjustments / counts are now documents that wait for a second
-- person (finance / director, not the creator) before they post:
--   ADJUSTMENT: submitted --approve--> posted | --reject--> rejected | --cancel--> cancelled
-- The single line keeps what was requested:
--   adjust_mode   'adjust' (signed change) | 'count' (stock count)
--   adjust_delta  signed quantity change (count: counted - expected)
--   expected_qty  balance the officer saw when counting / requesting
--   counted_qty   count only: quantity counted
--   lot_no / expiry_date (existing columns): adjust a specific lot
-- qty (existing, > 0) = |adjust_delta|.
ALTER TABLE document_line
  ADD COLUMN adjust_mode text CHECK (adjust_mode IN ('adjust', 'count')),
  ADD COLUMN adjust_delta numeric(14, 3) CHECK (adjust_delta <> 0),
  ADD COLUMN expected_qty numeric(14, 3) CHECK (expected_qty >= 0),
  ADD COLUMN counted_qty numeric(14, 3) CHECK (counted_qty >= 0),
  ADD CONSTRAINT document_line_adjust_ck CHECK (
    (adjust_mode IS NULL AND adjust_delta IS NULL AND counted_qty IS NULL)
    OR (adjust_mode = 'adjust' AND adjust_delta IS NOT NULL AND expected_qty IS NOT NULL)
    OR (adjust_mode = 'count' AND adjust_delta IS NOT NULL AND expected_qty IS NOT NULL AND counted_qty IS NOT NULL)
  );

CREATE INDEX document_pending_adjust_idx ON document (store_id) WHERE doc_type = 'ADJUSTMENT' AND status = 'submitted';

-- The web app has no business with the migration bookkeeping.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bkh_erp_app') THEN
    EXECUTE 'REVOKE ALL ON TABLE schema_migrations FROM bkh_erp_app';
  END IF;
END
$$;
