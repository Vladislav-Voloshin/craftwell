# Evidence Ingestion

Craftwell refreshes its evidence registry every Tuesday at 04:15 UTC. The job
is provenance-first: it stores citation metadata, canonical links, timestamps,
short attributed excerpts where permitted, and Craftwell-derived records. It
does not mirror copyrighted source libraries.

## Source policy

| Source                    | Status                      | Stored                                                                             | Never stored automatically                       |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Huberman Lab RSS          | Active                      | Episode metadata, guests, topics, timestamps, up to 500 characters of feed summary | Audio or full transcripts                        |
| Huberman public sitemap   | Active                      | Public newsletter, topic, subtopic, annual-letter, and protocol-page URL metadata  | Page bodies or premium content                   |
| PubMed                    | Active                      | PMID, DOI, title, authors, journal, publication type, date, canonical URL          | Abstract or article text                         |
| Huberman lab via PubMed   | Active                      | Publication candidates from an author and Stanford-affiliation query               | Unverified identity claims or article text       |
| Podcast guests via PubMed | Active                      | Rotating exact-name author-query candidates                                        | Automatic assertion that a namesake is the guest |
| Huberman YouTube          | Registered, adapter pending | Metadata only after an API key and adapter review                                  | Audio, captions, or copied descriptions          |
| Examine                   | Disabled                    | Nothing until a suitable data licence is documented                                | Scraped member or editorial content              |
| Books                     | Disabled, adapter pending   | Bibliographic metadata only after source review                                    | Book text                                        |

Full transcripts, books, abstracts, captions, audio, and licensed databases may
only enter the system when Craftwell has a licence or the rights-holder/user has
provided the material for that purpose. The content policy rejects raw-content
keys recursively and caps source excerpts at 500 characters.

## Weekly flow

1. Vercel calls `GET /api/cron/weekly-ingestion` with `CRON_SECRET`.
2. The job reads a 14-day overlap window so late-indexed records are recovered.
3. Sources run independently and are recorded in `ingestion_runs`.
4. Canonical records merge by stable identity (`huberman-episode:*` or
   `pubmed:*`). `document_sources` retains every discovery path.
5. New episode guests enter a rotating research queue. Five guests are checked
   each week; exact-name results remain `candidate` until reviewed.
6. Successful cursors and guest checkpoints advance. A failed source does not
   roll back successful sources and is retried on the next overlapping run.

PubMed requests run serially and are paced for NCBI's unkeyed limit. Supplying
`NCBI_API_KEY` raises the permitted request rate; `NCBI_CONTACT_EMAIL` identifies
the operator to NCBI.

## Data model

- `ingestion_sources`: source status, rights mode, checkpoint, and last error.
- `evidence_documents`: one canonical metadata record per item.
- `document_sources`: source-specific identifiers, URLs, and provenance.
- `people` and `document_people`: hosts, guests, authors, and review status.
- `person_sources`: verified person, lab, publication, book, and media links.
- `ingestion_runs`: counts, status, cursor, duration, and errors for every run.
- `evidence_claims`: structured findings/protocol/safety records; new claims
  default to `pending`.
- `protocol_evidence`: reviewed links from a protocol tool to evidence.

All tables are server-only. RLS is enabled, anon/authenticated grants are
revoked, and only the Supabase service role can operate the ingestion registry.

## Manual operations

Use `POST /api/ingest` with `Authorization: Bearer <ADMIN_API_KEY>`.

| Step                         | Purpose                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `weekly-evidence`            | Run the same incremental job as the cron                                                                              |
| `backfill-huberman-evidence` | Load historical RSS episode metadata and guest names from December 2020                                               |
| `backfill-huberman-lab`      | Load Huberman lab publication candidates from 2000                                                                    |
| `backfill-recent-research`   | Load up to 500 broad PubMed records from the previous year                                                            |
| `backfill-guest-research`    | Process the next 10 queued guests and their 10 latest candidate publications; repeat until the queue has been covered |

Example:

```bash
curl -X POST https://craftwell.vercel.app/api/ingest \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"step":"weekly-evidence"}'
```

## Review and publication rules

- Candidate guest-author and lab-author links are not approved evidence.
- Protocol or medical claims are never published directly from source metadata.
- A claim must cite a canonical record, include evidence level and limitations,
  and move from `pending` to `approved` through human review.
- Contradictory, safety, and limitation records are retained rather than hidden.
- User-facing copy must link to the primary source and must not imply medical
  diagnosis or guaranteed outcomes.

## Adding a source

Before enabling a new adapter, document its terms/licence, robots/API rules,
allowed retention, attribution, deletion obligations, stable identity key, rate
limit, and failure behavior. Add policy and parser tests, a live opt-in smoke
test, a server-only source registry row, and an operational rollback plan.

Legacy scrapers that copied PubMed abstracts, video descriptions, newsletters,
or Examine content now fail closed and are not part of the supported pipeline.
