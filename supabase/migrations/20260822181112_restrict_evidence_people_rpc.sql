-- Existing deployments may retain explicit API-role grants from schema default
-- privileges. Run the synchronization function with caller permissions and keep
-- it available only to the server-side ingestion service role.
alter function public.replace_document_people_for_role(uuid[], text, jsonb)
  security invoker;

revoke all on function public.replace_document_people_for_role(uuid[], text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_document_people_for_role(uuid[], text, jsonb)
  to service_role;
