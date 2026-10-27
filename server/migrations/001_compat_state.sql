CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS runtime_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Immutable full source archive, including unknown fields and legacy sessions.
-- Access only through a restricted database account, never expose through HTTP.
CREATE TABLE IF NOT EXISTS migration_runs (
  id text PRIMARY KEY,
  source_sha256 text NOT NULL,
  canonical_sha256 text NOT NULL,
  imported_sha256 text NOT NULL,
  counts jsonb NOT NULL,
  original_document jsonb NOT NULL,
  original_bytes bytea NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trainbuddy_app') THEN
    GRANT SELECT, UPDATE ON runtime_state TO trainbuddy_app;
    REVOKE ALL ON migration_runs FROM trainbuddy_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trainbuddy_backup') THEN
    GRANT SELECT ON runtime_state, migration_runs, schema_migrations TO trainbuddy_backup;
  END IF;
END $$;
