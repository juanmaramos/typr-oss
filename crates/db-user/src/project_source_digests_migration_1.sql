-- Intentionally no-op. `ensure_project_knowledge_schema` owns this additive
-- column because some dev databases reached the latest migration version before
-- project knowledge tables existed.
CREATE TABLE IF NOT EXISTS project_source_digests_migration_1_noop (id INTEGER);
DROP TABLE IF EXISTS project_source_digests_migration_1_noop;
