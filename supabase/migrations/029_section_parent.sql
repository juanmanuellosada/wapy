-- Add parent_id to sections for one-level subsection support.
--
-- A subsection is a regular row in the sections table with parent_id pointing
-- to its parent section. Products in a subsection simply have section_id = the
-- subsection's id — the products table is unchanged.
--
-- RLS note: existing policies on sections filter by store_id (via the stores
-- table). Subsection rows belong to the same store, so they are covered by the
-- same policies without any new RLS rules.

ALTER TABLE public.sections
  ADD COLUMN parent_id uuid REFERENCES public.sections(id) ON DELETE CASCADE;

-- Index for lookups of all subsections belonging to a parent.
CREATE INDEX idx_sections_parent_id ON public.sections (parent_id);
