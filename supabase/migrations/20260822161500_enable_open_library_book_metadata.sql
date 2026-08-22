insert into public.ingestion_sources (
  source_key,
  display_name,
  source_kind,
  base_url,
  rights_mode,
  enabled,
  rights_notes
) values (
  'books-catalog',
  'Open Library book metadata',
  'book_catalog',
  'https://openlibrary.org',
  'metadata_only',
  true,
  'Use low-volume, cached Search API ISBN batches. Store bibliographic metadata and canonical links only; never descriptions, scans, full text, or copyrighted book content.'
)
on conflict (source_key) do update set
  display_name = excluded.display_name,
  source_kind = excluded.source_kind,
  base_url = excluded.base_url,
  rights_mode = excluded.rights_mode,
  enabled = excluded.enabled,
  rights_notes = excluded.rights_notes;
