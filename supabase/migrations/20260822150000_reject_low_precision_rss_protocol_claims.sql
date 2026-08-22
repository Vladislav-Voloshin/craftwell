-- Preserve the audit trail while removing low-precision RSS timestamp labels
-- from the pending evidence-review queue. Only deterministic, unreviewed
-- protocol candidates created by the first RSS classifier are affected.
update public.evidence_claims
set
  review_status = 'rejected',
  structured_data = structured_data || jsonb_build_object(
    'rejection_reason', 'low_precision_rss_timestamp_marker_v2',
    'rejected_by', 'deterministic_policy_migration'
  )
where claim_type = 'protocol'
  and review_status = 'pending'
  and extraction_method = 'deterministic_timestamp_marker'
  and structured_data->>'source' = 'huberman_rss_timestamp_label'
  and (
    lower(claim_text) ~ '(^|[^a-z])(sponsors?|sponsored[[:space:]]+by|advertisements?|ads?)([^a-z]|$)'
    or lower(btrim(claim_text)) ~ '^(support|subscribe|newsletter|disclaimer|title[[:space:]]+card)([^a-z]|$)'
    or lower(claim_text) !~ '(^|[^a-z])(tools?|protocols?|exercises?|meditat(e|es|ed|ing|ion|ions|ive)?|breath(s|ing|work)?|supplements?|supplementation|doses?|dosage|practices?|training|exposures?|timing|how[[:space:]]+to|steps?|recommend(ed|ation|ations|ing)?|routines?|methods?|techniques?|therap(y|ies)|interventions?|strateg(y|ies)|guidelines?|habits?|schedules?|optimi(s|z)(e|es|ed|ing|ation))([^a-z]|$)'
  );
