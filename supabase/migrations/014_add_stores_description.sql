-- Phase 4 (wapy-onboarding-wizard): add the missing `description` column to stores.
-- The Phase 1 spec mentioned this column but the actual migration 007 omitted it.
-- Fase 4's StepBasics form captures store description; without this column the
-- value was workarounded into `theme.description` as JSON. This migration
-- restores the intended normalized shape.
--
-- Safe to apply on populated data: nullable column, no defaults to backfill.
-- Existing rows that have theme.description stay as-is until next save (the
-- form re-saves description into the new column from then on).

ALTER TABLE public.stores ADD COLUMN description text;
