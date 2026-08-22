-- Preserve the graph between an episode and the metadata-only resources it
-- references without copying the underlying third-party content.
update public.evidence_documents
set doi = lower(doi)
where doi is not null and doi <> lower(doi);

create table public.evidence_document_relations (
  source_document_id uuid not null references public.evidence_documents(id) on delete cascade,
  target_document_id uuid not null references public.evidence_documents(id) on delete cascade,
  source_key text not null references public.ingestion_sources(source_key),
  relation_type text not null check (
    relation_type in ('cites', 'transcript_for', 'media_of', 'mentions', 'updates')
  ),
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (source_document_id, target_document_id, source_key, relation_type),
  check (source_document_id <> target_document_id)
);

create index evidence_document_relations_target_idx
  on public.evidence_document_relations (target_document_id);
create index evidence_document_relations_source_key_idx
  on public.evidence_document_relations (source_key);

alter table public.evidence_document_relations enable row level security;
revoke all on public.evidence_document_relations from anon, authenticated;
grant select, insert, update, delete on public.evidence_document_relations to service_role;

create policy evidence_document_relations_service_role_all
  on public.evidence_document_relations for all to service_role
  using (true) with check (true);

insert into public.ingestion_sources (
  source_key,
  display_name,
  source_kind,
  base_url,
  rights_mode,
  enabled,
  rights_notes
) values
  (
    'huberman-episode-pages',
    'Huberman Lab public episode pages',
    'website',
    'https://www.hubermanlab.com/episode',
    'metadata_only',
    true,
    'Store structured episode metadata, transcript availability, cited links, books, media and lab/profile URLs. Never store transcript or page body text.'
  ),
  (
    'crossref-guests',
    'Crossref guest publication discovery',
    'publication_index',
    'https://api.crossref.org',
    'metadata_only',
    true,
    'Store bibliographic metadata only. Omit abstracts and full text. Exact-name author matches remain candidates until identity review.'
  )
on conflict (source_key) do update set
  display_name = excluded.display_name,
  source_kind = excluded.source_kind,
  base_url = excluded.base_url,
  rights_mode = excluded.rights_mode,
  enabled = excluded.enabled,
  rights_notes = excluded.rights_notes;

update public.ingestion_sources
set
  rights_mode = 'short_excerpt',
  rights_notes = 'Store canonical URLs, titles, structured publication/update dates, and at most 500 characters of public meta description. Do not copy page bodies or premium content.'
where source_key = 'huberman-site';
