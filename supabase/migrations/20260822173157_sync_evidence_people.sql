-- Replace source-owned document/person roles in one transaction so corrected
-- metadata cannot leave stale guest or host links behind.
create or replace function public.replace_document_people_for_role(
  p_document_ids uuid[],
  p_role text,
  p_rows jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_role not in ('host', 'guest', 'author', 'researcher', 'subject', 'speaker') then
    raise exception 'Unsupported person role';
  end if;

  delete from public.document_people
  where document_id = any(coalesce(p_document_ids, '{}'::uuid[]))
    and role = p_role;

  insert into public.document_people (
    document_id,
    person_id,
    role,
    match_status,
    confidence,
    evidence,
    metadata
  )
  select
    row.document_id,
    row.person_id,
    row.role,
    row.match_status,
    row.confidence,
    row.evidence,
    coalesce(row.metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row(
    document_id uuid,
    person_id uuid,
    role text,
    match_status text,
    confidence numeric,
    evidence text,
    metadata jsonb
  )
  where row.document_id = any(coalesce(p_document_ids, '{}'::uuid[]))
    and row.role = p_role
  on conflict (document_id, person_id, role) do update
  set match_status = excluded.match_status,
      confidence = excluded.confidence,
      evidence = excluded.evidence,
      metadata = excluded.metadata;
end;
$$;

revoke all on function public.replace_document_people_for_role(uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_document_people_for_role(uuid[], text, jsonb) to service_role;
