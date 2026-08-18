-- Explicit service-role policies document the only supported access path and
-- keep Supabase's RLS advisor free of ambiguous policyless-table notices.

create policy ingestion_sources_service_role_all
  on public.ingestion_sources for all to service_role
  using (true) with check (true);
create policy evidence_documents_service_role_all
  on public.evidence_documents for all to service_role
  using (true) with check (true);
create policy document_sources_service_role_all
  on public.document_sources for all to service_role
  using (true) with check (true);
create policy people_service_role_all
  on public.people for all to service_role
  using (true) with check (true);
create policy document_people_service_role_all
  on public.document_people for all to service_role
  using (true) with check (true);
create policy person_sources_service_role_all
  on public.person_sources for all to service_role
  using (true) with check (true);
create policy ingestion_runs_service_role_all
  on public.ingestion_runs for all to service_role
  using (true) with check (true);
create policy evidence_claims_service_role_all
  on public.evidence_claims for all to service_role
  using (true) with check (true);
create policy protocol_evidence_service_role_all
  on public.protocol_evidence for all to service_role
  using (true) with check (true);

create index ingestion_runs_source_idx
  on public.ingestion_runs (source_key);
create index protocol_evidence_document_idx
  on public.protocol_evidence (document_id);
create index protocol_evidence_claim_idx
  on public.protocol_evidence (claim_id)
  where claim_id is not null;
