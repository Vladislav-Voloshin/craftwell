-- Keep candidate identity evidence attached to the document relationship.
-- Unverified Crossref/PubMed data must not overwrite the canonical person row.
alter table public.document_people
  add column metadata jsonb not null default '{}';
