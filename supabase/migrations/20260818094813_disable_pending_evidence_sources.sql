-- Registered sources remain fail-closed until their reviewed adapters and
-- source-specific rights checks are complete.
update public.ingestion_sources
set enabled = false
where source_key in ('huberman-youtube');
