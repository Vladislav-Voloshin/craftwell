-- The official YouTube Data API adapter stores only channel/video metadata and
-- transcript availability. It never stores descriptions, captions, audio, or
-- transcript text.
update public.ingestion_sources
set
  enabled = true,
  rights_mode = 'metadata_only',
  rights_notes = 'Use the official YouTube Data API for channel/video metadata and caption availability only. Do not store descriptions, download audio, copy captions, or retain transcript text without explicit rights.',
  updated_at = now()
where source_key = 'huberman-youtube';
