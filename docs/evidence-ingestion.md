# Evidence Ingestion

Craftwell refreshes its evidence registry every Tuesday at 04:15 UTC. The job
is provenance-first: it stores citation metadata, canonical links, timestamps,
short attributed excerpts where permitted, and Craftwell-derived records. It
does not mirror copyrighted source libraries.

## Source policy

| Source                         | Status                     | Stored                                                                                                 | Never stored automatically                        |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Huberman Lab RSS               | Active                     | Episode metadata, guests, topics, timestamps, up to 500 characters of feed summary and protocol labels | Audio or full transcripts                         |
| Huberman public episode pages  | Active                     | Transcript availability, cited links, books, associated media and lab/profile URLs                     | Page bodies, audio, captions or transcript text   |
| Huberman public sitemap/pages  | Active                     | Public URLs, titles, structured dates and up to 500 characters of public meta description              | Page bodies or premium content                    |
| PubMed                         | Active                     | PMID, DOI, title, authors, journal, publication type, date, canonical URL                              | Abstract or article text                          |
| Huberman lab via PubMed        | Active                     | Publication candidates from an author and Stanford-affiliation query                                   | Unverified identity claims or article text        |
| Podcast guests via PubMed      | Active                     | Rotating exact-name author-query candidates                                                            | Automatic assertion that a namesake is the guest  |
| Podcast guests via Crossref    | Active                     | DOI metadata for publications, proceedings, preprints, chapters and books; ORCID candidates            | Abstracts, full text or automatic identity claims |
| Huberman YouTube channel index | Active when API key is set | Official video IDs, titles, dates, duration/tags, and caption/transcript availability references       | Descriptions, captions, audio or transcript text  |
| Examine                        | Disabled                   | Nothing until a suitable data licence is documented                                                    | Scraped member or editorial content               |
| Open Library catalog           | Active                     | ISBN-matched titles, authors, years, publishers, languages and canonical work links                    | Descriptions, scans or book text                  |

Full transcripts, books, abstracts, captions, audio, and licensed databases may
only enter the system when Craftwell has a licence or the rights-holder/user has
provided the material for that purpose. The content policy rejects raw-content
keys recursively and caps source excerpts at 500 characters.

## Weekly flow

1. Vercel calls `GET /api/cron/weekly-ingestion` with `CRON_SECRET`.
2. The job reads a 14-day overlap window so late-indexed records are recovered.
3. RSS timestamp labels that look like tools or protocols become pending review
   candidates; they are never published as medical claims automatically.
4. Every new official episode page contributes transcript availability and a
   graph of cited studies, books, media, and public lab/profile links.
5. Valid cited ISBNs are resolved through one low-volume Open Library batch;
   only bibliographic fields are retained and results are cached in Supabase.
6. When `YOUTUBE_API_KEY` is configured, the official channel uploads playlist
   is checked for new videos. Caption availability is retained as a reference;
   description, caption, audio, and transcript bodies are discarded.
7. Sources run independently and are recorded in `ingestion_runs`. Retryable
   HTTP failures use bounded backoff; per-page failures make the run partial.
8. Canonical records merge by stable identity, PMID, or DOI.
   `document_sources` retains every discovery path and
   `evidence_document_relations` retains episode-to-resource provenance.
9. New episode guests enter a rotating research queue. Five guests are checked
   in both PubMed and Crossref each week; all name matches remain `candidate`
   until reviewed.
10. Successful cursors and guest checkpoints advance only when every selected
    guest source succeeds. A failed source does not roll back successful sources.

PubMed requests run serially and are paced for NCBI's unkeyed limit. Supplying
`NCBI_API_KEY` raises the permitted request rate; `NCBI_CONTACT_EMAIL` identifies
the operator to NCBI. Crossref requests use its one-request-per-second public
pool; `CROSSREF_CONTACT_EMAIL` opts into the polite pool when configured.
Open Library queries use ISBN batches of at most 50, a one-request-per-second
fallback, and `OPEN_LIBRARY_CONTACT_EMAIL` (or the NCBI contact) when available.

## Data model

- `ingestion_sources`: source status, rights mode, checkpoint, and last error.
- `evidence_documents`: one canonical metadata record per item.
- `document_sources`: source-specific identifiers, URLs, and provenance.
- `evidence_document_relations`: cited, transcript, media and mention graph.
- `people` and `document_people`: canonical people plus document-level identity
  evidence and review status. Candidate ORCID, affiliation, and match evidence
  stays on `document_people` and cannot overwrite a canonical profile.
- `person_sources`: verified person, lab, publication, book, and media links.
- `ingestion_runs`: counts, status, cursor, duration, and errors for every run.
- `evidence_claims`: structured findings/protocol/safety records; new claims
  default to `pending`.
- `protocol_evidence`: reviewed links from a protocol tool to evidence.

All tables are server-only. RLS is enabled, anon/authenticated grants are
revoked, and only the Supabase service role can operate the ingestion registry.

## Manual operations

Use `POST /api/ingest` with `Authorization: Bearer <ADMIN_API_KEY>`.

| Step                         | Purpose                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `weekly-evidence`            | Run the same incremental job as the cron                                            |
| `backfill-huberman-evidence` | Load historical RSS episode metadata and guest names from December 2020             |
| `backfill-huberman-youtube`  | Load official channel video metadata and transcript availability from December 2020 |
| `backfill-huberman-lab`      | Load Huberman lab publication candidates from 2000                                  |
| `backfill-recent-research`   | Load up to 500 broad PubMed records from the previous year                          |
| `backfill-guest-research`    | Process the next 10 queued guests through PubMed and Crossref candidate discovery   |

For the bounded historical page/reference and Crossref backfills, run:

```bash
npx tsx scripts/backfill-evidence-references.ts --source=all
npx tsx scripts/backfill-evidence-references.ts --source=books --limit=500
```

The script supports `--source=episodes|crossref|books`, `--offset`, `--limit`,
`--batch-size`, `--rows`, `--max-pages`, and `--guest="Guest Name"` for bounded,
resumable operations. Start Crossref backfills with a small guest-specific
canary; every name match remains a candidate until a reviewer validates the
identity against primary profile, affiliation, and ORCID evidence. The script
stores bibliographic and link metadata only.

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

Legacy newsletter/chunking paths that copied raw third-party text fail closed.
The legacy podcast admin action now delegates to the same provenance-safe RSS
and episode-page pipeline.
