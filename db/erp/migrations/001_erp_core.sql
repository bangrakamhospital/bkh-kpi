-- bkh_erp — phase 1: master data, ERP roles, documents (requisition /
-- receipt / adjustment), stock (moving-average cost + lots), audit log.
--
-- Target: PostgreSQL 14+. Runs inside ONE transaction (scripts/erp-migrate.mjs)
-- with search_path = erp. Never edit an applied migration: add a new file.
--
-- Conventions
--   * bigint identity primary keys, text + CHECK instead of varchar(n)
--   * money: numeric(18,4) internal values, numeric(16,2) document amounts
--   * quantities: numeric(14,3) (3 decimals, e.g. 0.5 กล่อง)
--   * identities of people = Provider ID OIDC `sub` (same as the web app's
--     users.json) + a cached display name. No citizen ID anywhere.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Append-only tables (stock_movement, document_event, audit_log): refuse
-- UPDATE / DELETE whatever the role. Corrections are new rows.
CREATE FUNCTION erp_forbid_modify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------

-- หน่วยงาน / ศูนย์ต้นทุน. parent_id = line of command (ฝ่าย -> งาน).
CREATE TABLE org_unit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  parent_id      bigint REFERENCES org_unit (id),
  is_cost_center boolean NOT NULL DEFAULT true,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX org_unit_parent_idx ON org_unit (parent_id);

-- คลัง (คลังพัสดุกลาง, คลังยา, ...). org_unit_id = owning unit.
CREATE TABLE store (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  org_unit_id bigint REFERENCES org_unit (id),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ERP role grants. One person may hold several rows.
--   recorder, unit_head  -> scoped to org_unit_id (required)
--   store_officer        -> store_id NULL = every store, else one store
--   finance, hr, director, erp_admin -> hospital-wide
CREATE TABLE erp_user_role (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sub          text NOT NULL CHECK (length(sub) BETWEEN 1 AND 256),
  display_name text NOT NULL DEFAULT '',
  role         text NOT NULL CHECK (role IN (
                 'recorder', 'unit_head', 'store_officer', 'finance', 'hr',
                 'director', 'erp_admin')),
  org_unit_id  bigint REFERENCES org_unit (id),
  store_id     bigint REFERENCES store (id),
  granted_by   text NOT NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (role NOT IN ('recorder', 'unit_head') OR org_unit_id IS NOT NULL),
  CHECK (role IN ('recorder', 'unit_head') OR org_unit_id IS NULL),
  CHECK (store_id IS NULL OR role = 'store_officer')
);
CREATE UNIQUE INDEX erp_user_role_uniq
  ON erp_user_role (sub, role, COALESCE(org_unit_id, 0), COALESCE(store_id, 0));
CREATE INDEX erp_user_role_unit_idx ON erp_user_role (org_unit_id) WHERE org_unit_id IS NOT NULL;

-- ทะเบียนบุคลากรพื้นฐาน (phase 3: ลา/เวร/OT build on this). No citizen ID.
CREATE TABLE staff (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code   text UNIQUE CHECK (employee_code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  sub             text UNIQUE CHECK (length(sub) BETWEEN 1 AND 256),
  full_name       text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
  position        text NOT NULL DEFAULT '',
  employment_type text NOT NULL DEFAULT 'other' CHECK (employment_type IN (
                    'civil_servant', 'government_employee', 'ministry_employee',
                    'permanent_employee', 'temporary', 'other')),
  org_unit_id     bigint REFERENCES org_unit (id),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_org_unit_idx ON staff (org_unit_id);

-- ---------------------------------------------------------------------------
-- Items / vendors
-- ---------------------------------------------------------------------------

CREATE TABLE item_category (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_.-]{1,30}$'),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  unit           text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 30),
  category_id    bigint REFERENCES item_category (id),
  spec           text NOT NULL DEFAULT '',
  -- latest receipt price (informational; issue cost = moving average)
  last_unit_cost numeric(14, 4) NOT NULL DEFAULT 0 CHECK (last_unit_cost >= 0),
  reorder_point  numeric(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_category_idx ON item (category_id);

CREATE TABLE vendor (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text UNIQUE CHECK (code ~ '^[A-Za-z0-9_.-]{1,20}$'),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  tax_id     text NOT NULL DEFAULT '',
  phone      text NOT NULL DEFAULT '',
  address    text NOT NULL DEFAULT '',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Documents (generic header + lines; phase 2 adds PR/PO/... as new types)
-- ---------------------------------------------------------------------------

CREATE TABLE document_type (
  code   text PRIMARY KEY CHECK (code ~ '^[A-Z_]{2,30}$'),
  name   text NOT NULL,
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[A-Z]{2,4}$')
);
INSERT INTO document_type (code, name, prefix) VALUES
  ('REQUISITION', 'ใบเบิกพัสดุ', 'RQ'),
  ('RECEIPT', 'ใบรับพัสดุเข้าคลัง', 'RC'),
  ('ADJUSTMENT', 'ใบปรับปรุงยอด/ตรวจนับคลัง', 'AJ');

-- Running number per type per fiscal year (BE). Incremented with
-- INSERT .. ON CONFLICT DO UPDATE .. RETURNING inside the document's
-- transaction: the row lock serialises writers, a rollback releases the
-- number (no gaps for committed documents).
CREATE TABLE document_sequence (
  doc_type    text NOT NULL REFERENCES document_type (code),
  fiscal_year smallint NOT NULL CHECK (fiscal_year BETWEEN 2500 AND 2800),
  last_no     integer NOT NULL CHECK (last_no > 0),
  PRIMARY KEY (doc_type, fiscal_year)
);

CREATE TABLE document (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_type          text NOT NULL REFERENCES document_type (code),
  -- assigned on submit (requisition) / post (receipt, adjustment)
  doc_no            text UNIQUE,
  fiscal_year       smallint CHECK (fiscal_year BETWEEN 2500 AND 2800),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'submitted', 'approved', 'rejected', 'issued',
                      'posted', 'cancelled')),
  org_unit_id       bigint REFERENCES org_unit (id),
  store_id          bigint REFERENCES store (id),
  vendor_id         bigint REFERENCES vendor (id),
  ref_no            text NOT NULL DEFAULT '',
  ref_date          date,
  purpose           text NOT NULL DEFAULT '',
  total_amount      numeric(16, 2),
  -- optimistic concurrency: every change bumps it, clients send what they saw
  version           integer NOT NULL DEFAULT 1,
  created_by        text NOT NULL,
  created_by_name   text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  submitted_at      timestamptz,
  decided_by        text,
  decided_by_name   text,
  decided_at        timestamptz,
  completed_by      text,
  completed_by_name text,
  completed_at      timestamptz,
  CHECK ((doc_no IS NULL) = (fiscal_year IS NULL)),
  CHECK (status = 'draft' OR status = 'cancelled' OR doc_no IS NOT NULL)
);
CREATE INDEX document_unit_idx ON document (doc_type, org_unit_id, status);
CREATE INDEX document_store_idx ON document (doc_type, store_id, status);
CREATE INDEX document_creator_idx ON document (created_by);
CREATE INDEX document_created_idx ON document (created_at DESC);

CREATE TABLE document_line (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  bigint NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  line_no      smallint NOT NULL CHECK (line_no > 0),
  item_id      bigint NOT NULL REFERENCES item (id),
  -- requested (requisition) / received (receipt)
  qty          numeric(14, 3) NOT NULL CHECK (qty > 0),
  qty_approved numeric(14, 3) CHECK (qty_approved >= 0),
  qty_issued   numeric(14, 3) CHECK (qty_issued >= 0),
  -- cost per unit at issue (moving average) / receipt price
  unit_cost    numeric(14, 4) CHECK (unit_cost >= 0),
  amount       numeric(16, 2) CHECK (amount >= 0),
  lot_no       text NOT NULL DEFAULT '',
  expiry_date  date,
  note         text NOT NULL DEFAULT '',
  UNIQUE (document_id, line_no)
);
CREATE INDEX document_line_item_idx ON document_line (item_id);

-- Approval chain (phase 1: one unit_head step per requisition; phase 2
-- adds multi-step chains for purchase requests).
CREATE TABLE approval_step (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id     bigint NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  step_no         smallint NOT NULL CHECK (step_no > 0),
  required_role   text NOT NULL,
  org_unit_id     bigint REFERENCES org_unit (id),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'approved', 'rejected', 'skipped', 'cancelled')),
  decided_by      text,
  decided_by_name text,
  decided_at      timestamptz,
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, step_no)
);

-- Every status change / edit of a document (who, when, note). Append-only.
CREATE TABLE document_event (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES document (id),
  action      text NOT NULL,
  from_status text,
  to_status   text,
  actor_sub   text NOT NULL,
  actor_name  text NOT NULL DEFAULT '',
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_event_doc_idx ON document_event (document_id, id);
CREATE TRIGGER document_event_append_only
  BEFORE UPDATE OR DELETE ON document_event
  FOR EACH ROW EXECUTE FUNCTION erp_forbid_modify();

-- ---------------------------------------------------------------------------
-- Stock: moving weighted average cost per (store, item); lots for expiry
-- ---------------------------------------------------------------------------

-- Current balance. Issue cost = total_value * qty / qty_on_hand (whole
-- remaining value when the store is emptied: no rounding residue).
-- Row lock (SELECT .. FOR UPDATE) on this row serialises every change of
-- the item in the store (lots included).
CREATE TABLE stock_balance (
  store_id    bigint NOT NULL REFERENCES store (id),
  item_id     bigint NOT NULL REFERENCES item (id),
  qty_on_hand numeric(14, 3) NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  total_value numeric(18, 4) NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, item_id),
  CHECK (qty_on_hand > 0 OR total_value = 0)
);
CREATE INDEX stock_balance_item_idx ON stock_balance (item_id);

-- Quantity per lot (lot_no '' = no lot). Sum of lots = qty_on_hand.
-- Decreases consume lots FEFO (earliest expiry first, no expiry last).
CREATE TABLE stock_lot (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id    bigint NOT NULL,
  item_id     bigint NOT NULL,
  lot_no      text NOT NULL DEFAULT '',
  expiry_date date,
  qty_on_hand numeric(14, 3) NOT NULL CHECK (qty_on_hand >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, item_id) REFERENCES stock_balance (store_id, item_id)
);
CREATE UNIQUE INDEX stock_lot_key
  ON stock_lot (store_id, item_id, lot_no, COALESCE(expiry_date, DATE 'infinity'));
CREATE INDEX stock_lot_fefo
  ON stock_lot (store_id, item_id, expiry_date, received_at, id)
  WHERE qty_on_hand > 0;

-- Ledger. Append-only; qty_after / value_after = balance after this row.
--   RECEIVE  qty > 0 (vendor, receipt price)
--   ISSUE    qty < 0, org_unit_id = cost centre charged
--   ADJUST   +/- (ปรับปรุงยอด: damaged, expired, found ...)
--   COUNT    +/- difference found by a stock count (ตรวจนับ)
CREATE TABLE stock_movement (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movement_type    text NOT NULL CHECK (movement_type IN ('RECEIVE', 'ISSUE', 'ADJUST', 'COUNT')),
  store_id         bigint NOT NULL REFERENCES store (id),
  item_id          bigint NOT NULL REFERENCES item (id),
  qty_change       numeric(14, 3) NOT NULL CHECK (qty_change <> 0),
  value_change     numeric(18, 4) NOT NULL,
  unit_cost        numeric(14, 4) NOT NULL CHECK (unit_cost >= 0),
  qty_after        numeric(14, 3) NOT NULL CHECK (qty_after >= 0),
  value_after      numeric(18, 4) NOT NULL CHECK (value_after >= 0),
  lot_no           text NOT NULL DEFAULT '',
  expiry_date      date,
  document_id      bigint REFERENCES document (id),
  document_line_id bigint REFERENCES document_line (id),
  org_unit_id      bigint REFERENCES org_unit (id),
  vendor_id        bigint REFERENCES vendor (id),
  note             text NOT NULL DEFAULT '',
  created_by       text NOT NULL,
  created_by_name  text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (movement_type <> 'RECEIVE' OR qty_change > 0),
  CHECK (movement_type <> 'ISSUE' OR (qty_change < 0 AND org_unit_id IS NOT NULL))
);
CREATE INDEX stock_movement_store_idx ON stock_movement (store_id, created_at DESC, id DESC);
CREATE INDEX stock_movement_item_idx ON stock_movement (item_id, created_at DESC);
CREATE INDEX stock_movement_doc_idx ON stock_movement (document_id);
-- cost per unit (phase 4 dashboard)
CREATE INDEX stock_movement_cost_idx ON stock_movement (org_unit_id, created_at)
  WHERE movement_type = 'ISSUE';
CREATE TRIGGER stock_movement_append_only
  BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION erp_forbid_modify();

-- ---------------------------------------------------------------------------
-- Audit (ERP actions; page views stay in the web app's file audit log)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_sub   text NOT NULL,
  actor_name  text NOT NULL DEFAULT '',
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  user_agent  text
);
CREATE INDEX audit_log_time_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION erp_forbid_modify();
