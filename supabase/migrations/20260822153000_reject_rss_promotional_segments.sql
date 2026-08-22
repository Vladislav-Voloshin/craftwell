-- Newer RSS timestamp templates combine calls to follow/review the show with
-- action-cue words such as "protocols" or "supplements". Preserve the rows for
-- audit, but remove these deterministic promotional segments from review.
update public.evidence_claims
set
  review_status = 'rejected',
  structured_data = structured_data || jsonb_build_object(
    'rejection_reason', 'promotional_rss_timestamp_marker_v3',
    'rejected_by', 'deterministic_policy_migration'
  )
where claim_type = 'protocol'
  and review_status = 'pending'
  and extraction_method = 'deterministic_timestamp_marker'
  and structured_data->>'source' = 'huberman_rss_timestamp_label'
  and (
    lower(claim_text) ~ '(^|[^a-z])(sponsors?|sponsored[[:space:]]+by|advertisements?|ads?|newsletters?|protocols?[[:space:]]+book|book[[:space:]]+recommendations?|zero[-[:space:]]*cost[[:space:]]+support|supporting[[:space:]]+the[[:space:]]+hlp|see[[:space:]]+caption([[:space:]]+on[[:space:]]+youtube)?|live[[:space:]]+events?)([^a-z]|$)'
    or lower(btrim(claim_text)) ~ '^(support|subscribe|disclaimer|title[[:space:]]+card|announcement)([^a-z]|$)'
  );
