-- Cleanup: drop the unused backfill_jobs table.
--
-- It was created in the agency_dashboard migration for a cursor-driven backfill
-- design that the M1 reconciliation dropped — onboarding now drives the
-- stateless per-month /api/admin/backfill directly, with no job row. Nothing in
-- the codebase reads or writes this table.
drop table if exists backfill_jobs;
