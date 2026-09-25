CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','supervisor','agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension VARCHAR(4) UNIQUE NOT NULL CHECK (extension ~ '^[1-9][0-9]{3}$'),
  name TEXT NOT NULL,
  sip_secret_hash TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS did_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  did TEXT UNIQUE NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('extension','ivr','queue','conference')),
  destination TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized CDR table filled by API/AMI events or external CDR ingestion.
CREATE TABLE IF NOT EXISTS cdr (
  id BIGSERIAL PRIMARY KEY,
  uniqueid TEXT,
  linkedid TEXT,
  direction TEXT CHECK (direction IN ('inbound','outbound','internal')),
  src TEXT,
  dst TEXT,
  did TEXT,
  disposition TEXT,
  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration INTEGER DEFAULT 0,
  billsec INTEGER DEFAULT 0,
  recording_file TEXT,
  sip_cause INTEGER,
  sip_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdr_started_at ON cdr(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cdr_src ON cdr(src);
CREATE INDEX IF NOT EXISTS idx_cdr_dst ON cdr(dst);
CREATE INDEX IF NOT EXISTS idx_cdr_linkedid ON cdr(linkedid);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
