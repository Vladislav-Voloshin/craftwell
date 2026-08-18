-- Provenance-first evidence ingestion.
--
-- These tables intentionally store source metadata, short attributed excerpts,
-- and Craftwell-derived claims. They are not a mirror for copyrighted podcast
-- transcripts, books, publisher abstracts, or licensed evidence databases.

create table public.ingestion_sources (
  source_key text primary key,
  display_name text not null,
  source_kind text not null check (
    source_kind in (
      'podcast_feed',
      'video_channel',
      'publication_index',
      'website',
      'licensed_api',
      'book_catalog',
      'lab_website'
    )
  ),
  base_url text not null,
  rights_mode text not null check (
    rights_mode in ('metadata_only', 'short_excerpt', 'licensed', 'user_provided')
  ),
  enabled boolean not null default true,
  rights_notes text not null default '',
  last_cursor text,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evidence_documents (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  document_type text not null check (
    document_type in (
      'podcast_episode',
      'video',
      'show_notes',
      'transcript_reference',
      'newsletter',
      'study',
      'book',
      'publication',
      'lab_update',
      'media'
    )
  ),
  canonical_url text not null,
  title text not null,
  source_excerpt text check (
    source_excerpt is null or char_length(source_excerpt) <= 500
  ),
  derived_summary text,
  published_at timestamptz,
  authors text[] not null default '{}',
  guests text[] not null default '{}',
  topics text[] not null default '{}',
  pmid text,
  doi text,
  language text not null default 'en',
  rights_mode text not null check (
    rights_mode in ('metadata_only', 'short_excerpt', 'licensed', 'user_provided')
  ),
  content_fingerprint text,
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_sources (
  document_id uuid not null references public.evidence_documents(id) on delete cascade,
  source_key text not null references public.ingestion_sources(source_key),
  external_id text not null,
  canonical_url text not null,
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (source_key, external_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text not null,
  credentials text[] not null default '{}',
  affiliations text[] not null default '{}',
  primary_url text,
  metadata jsonb not null default '{}',
  last_research_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_people (
  document_id uuid not null references public.evidence_documents(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (
    role in ('host', 'guest', 'author', 'researcher', 'subject', 'speaker')
  ),
  match_status text not null default 'extracted' check (
    match_status in ('verified', 'extracted', 'candidate', 'rejected')
  ),
  confidence numeric(4, 3) not null default 0.500 check (
    confidence >= 0 and confidence <= 1
  ),
  evidence text,
  created_at timestamptz not null default now(),
  primary key (document_id, person_id, role)
);

create table public.person_sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  source_kind text not null check (
    source_kind in (
      'lab',
      'institution',
      'publication_profile',
      'media',
      'book',
      'social',
      'other'
    )
  ),
  url text not null,
  title text,
  verified boolean not null default false,
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  unique (person_id, url)
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text references public.ingestion_sources(source_key),
  trigger_type text not null check (
    trigger_type in ('cron', 'manual', 'backfill', 'test')
  ),
  status text not null check (
    status in ('running', 'succeeded', 'partial', 'failed')
  ),
  request_id text,
  cursor_start text,
  cursor_end text,
  discovered_count integer not null default 0 check (discovered_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_summary text,
  metadata jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.evidence_claims (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.evidence_documents(id) on delete cascade,
  claim_hash text not null,
  claim_text text not null,
  claim_type text not null check (
    claim_type in ('finding', 'protocol', 'safety', 'limitation', 'context')
  ),
  evidence_level text check (
    evidence_level in (
      'systematic_review',
      'meta_analysis',
      'randomized_trial',
      'controlled_trial',
      'observational',
      'preclinical',
      'expert_opinion',
      'unknown'
    )
  ),
  structured_data jsonb not null default '{}',
  extraction_method text not null default 'deterministic',
  extraction_model text,
  review_status text not null default 'pending' check (
    review_status in ('pending', 'approved', 'rejected', 'superseded')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, claim_hash)
);

create table public.protocol_evidence (
  protocol_tool_id uuid not null references public.protocol_tools(id) on delete cascade,
  document_id uuid not null references public.evidence_documents(id) on delete cascade,
  claim_id uuid references public.evidence_claims(id) on delete set null,
  relation_type text not null check (
    relation_type in ('supports', 'contradicts', 'context', 'safety')
  ),
  notes text,
  created_at timestamptz not null default now(),
  primary key (protocol_tool_id, document_id, relation_type)
);

create index evidence_documents_published_idx
  on public.evidence_documents (published_at desc nulls last);
create index evidence_documents_type_idx
  on public.evidence_documents (document_type, published_at desc nulls last);
create index evidence_documents_topics_idx
  on public.evidence_documents using gin (topics);
create index document_sources_document_idx
  on public.document_sources (document_id);
create unique index evidence_documents_pmid_idx
  on public.evidence_documents (pmid)
  where pmid is not null;
create unique index evidence_documents_doi_idx
  on public.evidence_documents (lower(doi))
  where doi is not null;
create index document_people_person_idx on public.document_people (person_id);
create index person_sources_person_idx on public.person_sources (person_id);
create index people_research_queue_idx
  on public.people (last_research_check_at asc nulls first);
create index ingestion_runs_started_idx on public.ingestion_runs (started_at desc);
create index evidence_claims_document_idx on public.evidence_claims (document_id);

alter table public.ingestion_sources enable row level security;
alter table public.evidence_documents enable row level security;
alter table public.document_sources enable row level security;
alter table public.people enable row level security;
alter table public.document_people enable row level security;
alter table public.person_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.evidence_claims enable row level security;
alter table public.protocol_evidence enable row level security;

-- Content ingestion remains server-only. RLS is defense in depth and explicit
-- grants keep these tables out of the anon/authenticated Data API surface.
revoke all on public.ingestion_sources from anon, authenticated;
revoke all on public.evidence_documents from anon, authenticated;
revoke all on public.document_sources from anon, authenticated;
revoke all on public.people from anon, authenticated;
revoke all on public.document_people from anon, authenticated;
revoke all on public.person_sources from anon, authenticated;
revoke all on public.ingestion_runs from anon, authenticated;
revoke all on public.evidence_claims from anon, authenticated;
revoke all on public.protocol_evidence from anon, authenticated;

grant select, insert, update, delete on public.ingestion_sources to service_role;
grant select, insert, update, delete on public.evidence_documents to service_role;
grant select, insert, update, delete on public.document_sources to service_role;
grant select, insert, update, delete on public.people to service_role;
grant select, insert, update, delete on public.document_people to service_role;
grant select, insert, update, delete on public.person_sources to service_role;
grant select, insert, update, delete on public.ingestion_runs to service_role;
grant select, insert, update, delete on public.evidence_claims to service_role;
grant select, insert, update, delete on public.protocol_evidence to service_role;

drop trigger if exists update_ingestion_sources_updated_at on public.ingestion_sources;
create trigger update_ingestion_sources_updated_at
  before update on public.ingestion_sources
  for each row execute function public.update_updated_at();

drop trigger if exists update_evidence_documents_updated_at on public.evidence_documents;
create trigger update_evidence_documents_updated_at
  before update on public.evidence_documents
  for each row execute function public.update_updated_at();

drop trigger if exists update_people_updated_at on public.people;
create trigger update_people_updated_at
  before update on public.people
  for each row execute function public.update_updated_at();

drop trigger if exists update_evidence_claims_updated_at on public.evidence_claims;
create trigger update_evidence_claims_updated_at
  before update on public.evidence_claims
  for each row execute function public.update_updated_at();

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
    'huberman-rss',
    'Huberman Lab podcast RSS',
    'podcast_feed',
    'https://feeds.megaphone.fm/hubermanlab',
    'short_excerpt',
    true,
    'Store feed metadata, timestamps, links, and at most 500 characters of attributed description. Do not store episode audio or full transcripts.'
  ),
  (
    'huberman-youtube',
    'Huberman Lab YouTube channel',
    'video_channel',
    'https://www.youtube.com/@hubermanlab',
    'metadata_only',
    true,
    'Use the official YouTube Data API for metadata. Do not download audio or captions without rights and channel authorization.'
  ),
  (
    'huberman-site',
    'Huberman Lab official website',
    'website',
    'https://www.hubermanlab.com',
    'metadata_only',
    true,
    'Read the public sitemap and store canonical URL metadata only. Do not copy page bodies or premium content.'
  ),
  (
    'pubmed-health',
    'PubMed health and neuroscience index',
    'publication_index',
    'https://pubmed.ncbi.nlm.nih.gov',
    'metadata_only',
    true,
    'Use NCBI E-utilities. Store citation metadata and links; do not republish full abstracts or articles.'
  ),
  (
    'pubmed-guests',
    'PubMed guest publication discovery',
    'publication_index',
    'https://pubmed.ncbi.nlm.nih.gov',
    'metadata_only',
    true,
    'Author matches are candidates until identity evidence verifies the guest-publication relationship.'
  ),
  (
    'huberman-stanford-lab',
    'Huberman Laboratory publications via PubMed',
    'publication_index',
    'https://pubmed.ncbi.nlm.nih.gov',
    'metadata_only',
    true,
    'Discover author and Stanford-affiliation candidates through PubMed. Store citation metadata only and require identity review.'
  ),
  (
    'examine-connect',
    'Examine Connect licensed API',
    'licensed_api',
    'https://connect.examine.com',
    'licensed',
    false,
    'Disabled until an Examine API/data licence explicitly permits this use, retention period, and redistribution.'
  ),
  (
    'books-catalog',
    'Guest and podcast book metadata',
    'book_catalog',
    'https://openlibrary.org',
    'metadata_only',
    false,
    'Store bibliographic metadata and canonical links only. Never ingest copyrighted book text without a licence or user-provided rights.'
  )
on conflict (source_key) do update set
  display_name = excluded.display_name,
  source_kind = excluded.source_kind,
  base_url = excluded.base_url,
  rights_mode = excluded.rights_mode,
  enabled = excluded.enabled,
  rights_notes = excluded.rights_notes;
