import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createEvidenceStore } from "./store";
import type { EvidenceBatch } from "./types";

interface StoredDocumentRow {
  id: string;
  identity_key: string;
  content_fingerprint: string | null;
  pmid: string | null;
  doi: string | null;
}

interface RecordedUpsert {
  table: string;
  rows: Array<Record<string, unknown>>;
  onConflict?: string;
}

interface StoredPersonRow {
  id: string;
  normalized_name: string;
  display_name: string;
  credentials: string[];
  affiliations: string[];
  primary_url: string | null;
  metadata: Record<string, unknown>;
}

interface StoredDocumentSourceRow {
  document_id: string;
  source_key: string;
}

interface RecordedRpc {
  name: string;
  args: Record<string, unknown>;
}

function createFakeClient(
  existingDocuments: StoredDocumentRow[] = [],
  existingPeople: StoredPersonRow[] = [],
  existingDocumentSources: StoredDocumentSourceRow[] = []
) {
  const upserts: RecordedUpsert[] = [];
  const rpcs: RecordedRpc[] = [];

  class Query {
    private action: "select" | "upsert" = "select";
    private filter?: { column: string; values: string[] };
    private rows: Array<Record<string, unknown>> = [];
    private onConflict?: string;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    in(column: string, values: string[]) {
      this.filter = { column, values };
      return this;
    }

    upsert(rows: Array<Record<string, unknown>>, options?: { onConflict?: string }) {
      this.action = "upsert";
      this.rows = rows;
      this.onConflict = options?.onConflict;
      upserts.push({ table: this.table, rows, onConflict: this.onConflict });
      return this;
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private execute() {
      if (this.action === "upsert" && this.table === "evidence_documents") {
        return {
          data: this.rows.map((row, index) => ({
            id: `stored-${index}-${String(row.identity_key)}`,
            identity_key: row.identity_key,
            content_fingerprint: row.content_fingerprint,
          })),
          error: null,
        };
      }
      if (this.action === "upsert" && this.table === "people") {
        return {
          data: this.rows.map((row, index) => ({
            id:
              existingPeople.find((person) => person.normalized_name === row.normalized_name)?.id ??
              `person-${index}`,
            normalized_name: row.normalized_name,
          })),
          error: null,
        };
      }
      if (this.action === "upsert") return { data: null, error: null };
      if (!this.filter) {
        return { data: [], error: null };
      }
      if (this.table === "people") {
        return {
          data: existingPeople.filter((person) =>
            this.filter!.values.includes(person.normalized_name)
          ),
          error: null,
        };
      }
      if (this.table === "document_sources") {
        return {
          data: existingDocumentSources.filter((source) =>
            this.filter!.values.includes(source.document_id)
          ),
          error: null,
        };
      }
      if (this.table !== "evidence_documents") return { data: [], error: null };
      return {
        data: existingDocuments.filter((document) => {
          const value = document[this.filter!.column as keyof StoredDocumentRow];
          return typeof value === "string" && this.filter!.values.includes(value);
        }),
        error: null,
      };
    }
  }

  const client = {
    from(table: string) {
      return new Query(table);
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, upserts, rpcs };
}

describe("evidence store persistence", () => {
  it("merges duplicate in-batch DOI records while preserving both source IDs", async () => {
    const { client, upserts } = createFakeClient();
    const store = createEvidenceStore(client);

    const result = await store.persistBatch({
      sourceKey: "pubmed-guests",
      cursor: "2026-08-22T00:00:00.000Z",
      documents: [
        {
          identityKey: "pubmed:100",
          sourceKey: "pubmed-guests",
          externalId: "100",
          documentType: "study",
          canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/100/",
          title: "First PubMed record",
          pmid: "100",
          doi: "10.1000/shared",
          rightsMode: "metadata_only",
        },
        {
          identityKey: "pubmed:101",
          sourceKey: "pubmed-guests",
          externalId: "101",
          documentType: "study",
          canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/101/",
          title: "Duplicate PubMed record",
          pmid: "101",
          doi: "10.1000/shared",
          rightsMode: "metadata_only",
        },
      ],
      people: [],
    });

    expect(result).toMatchObject({ discovered: 2, inserted: 1, skipped: 1, errors: 0 });
    expect(upserts.find((call) => call.table === "evidence_documents")?.rows).toHaveLength(1);
    const sourceRows = upserts.find((call) => call.table === "document_sources")?.rows ?? [];
    expect(sourceRows).toHaveLength(2);
    expect(new Set(sourceRows.map((row) => row.document_id)).size).toBe(1);
    expect(sourceRows.map((row) => row.external_id)).toEqual(["100", "101"]);
  });

  it("prefers an existing DOI record over a stale identity row without that DOI", async () => {
    const { client, upserts } = createFakeClient([
      {
        id: "stale-pubmed",
        identity_key: "pubmed:200",
        content_fingerprint: "stale",
        pmid: "200",
        doi: null,
      },
      {
        id: "canonical-doi",
        identity_key: "doi:10.1000/converged",
        content_fingerprint: "crossref",
        pmid: null,
        doi: "10.1000/converged",
      },
    ]);
    const store = createEvidenceStore(client);

    const result = await store.persistBatch({
      sourceKey: "pubmed-guests",
      cursor: "2026-08-22T00:00:00.000Z",
      documents: [
        {
          identityKey: "pubmed:200",
          sourceKey: "pubmed-guests",
          externalId: "200",
          documentType: "study",
          canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/200/",
          title: "Now linked to its DOI",
          pmid: "200",
          doi: "10.1000/converged",
          rightsMode: "metadata_only",
        },
      ],
      people: [],
    });

    expect(result).toMatchObject({ inserted: 0, updated: 0, skipped: 1, errors: 0 });
    expect(upserts.some((call) => call.table === "evidence_documents")).toBe(false);
    expect(upserts.find((call) => call.table === "document_sources")?.rows[0]).toMatchObject({
      document_id: "canonical-doi",
      external_id: "200",
    });
  });

  it("atomically clears stale synchronized roles when a source no longer reports a guest", async () => {
    const { client, rpcs } = createFakeClient();
    const store = createEvidenceStore(client);

    await store.persistBatch({
      sourceKey: "huberman-rss",
      cursor: "2026-08-22T00:00:00.000Z",
      documents: [
        {
          identityKey: "huberman-episode:solo",
          sourceKey: "huberman-rss",
          externalId: "solo",
          documentType: "podcast_episode",
          canonicalUrl: "https://www.hubermanlab.com/episode/solo",
          title: "A solo episode with science-based tools",
          rightsMode: "metadata_only",
        },
        {
          identityKey: "book:reference",
          sourceKey: "huberman-rss",
          externalId: "book-reference",
          documentType: "book",
          canonicalUrl: "https://openlibrary.org/isbn/123",
          title: "Referenced book",
          rightsMode: "metadata_only",
        },
      ],
      people: [],
      synchronizePersonRoles: { guest: ["huberman-episode:solo"] },
    });

    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({
      name: "replace_document_people_for_role",
      args: {
        p_document_ids: ["stored-0-huberman-episode:solo"],
        p_role: "guest",
        p_rows: [],
      },
    });
  });

  it("links a DOI source to an existing PubMed document without inserting a duplicate", async () => {
    const { client, upserts } = createFakeClient([
      {
        id: "existing-pubmed",
        identity_key: "pubmed:12345",
        content_fingerprint: "existing-fingerprint",
        pmid: "12345",
        doi: "10.1000/example",
      },
    ]);
    const store = createEvidenceStore(client);

    const result = await store.persistBatch({
      sourceKey: "crossref-guests",
      cursor: "2026-08-18T00:00:00.000Z",
      documents: [
        {
          identityKey: "doi:10.1000/example",
          sourceKey: "crossref-guests",
          externalId: "doi:10.1000/example",
          documentType: "publication",
          canonicalUrl: "https://doi.org/10.1000/example",
          title: "Example publication",
          doi: "10.1000/EXAMPLE",
          rightsMode: "metadata_only",
        },
      ],
      people: [],
    });

    expect(result).toMatchObject({ inserted: 0, updated: 0, skipped: 1, errors: 0 });
    expect(upserts.some((call) => call.table === "evidence_documents")).toBe(false);
    expect(upserts.find((call) => call.table === "document_sources")?.rows[0]).toMatchObject({
      document_id: "existing-pubmed",
      source_key: "crossref-guests",
      external_id: "doi:10.1000/example",
    });
  });

  it("does not let episode-page metadata overwrite an official YouTube record", async () => {
    const existingDocuments: StoredDocumentRow[] = [
      {
        id: "official-video",
        identity_key: "youtube:video-1",
        content_fingerprint: "official-fingerprint",
        pmid: null,
        doi: null,
      },
    ];
    const { client, upserts } = createFakeClient(
      existingDocuments,
      [],
      [{ document_id: "official-video", source_key: "huberman-youtube" }]
    );
    const store = createEvidenceStore(client);

    const result = await store.persistBatch({
      sourceKey: "huberman-episode-pages",
      cursor: "2026-08-22T00:00:00.000Z",
      documents: [
        {
          identityKey: "youtube:video-1",
          sourceKey: "huberman-episode-pages",
          externalId: "youtube:video-1",
          documentType: "video",
          canonicalUrl: "https://www.youtube.com/watch?v=video-1",
          title: "Video: lower-detail link label",
          rightsMode: "metadata_only",
          contentFingerprint: "episode-page-fingerprint",
        },
      ],
      people: [],
    });

    expect(result).toMatchObject({ inserted: 0, updated: 0, skipped: 1, errors: 0 });
    expect(upserts.some((call) => call.table === "evidence_documents")).toBe(false);
    expect(upserts.find((call) => call.table === "document_sources")?.rows[0]).toMatchObject({
      document_id: "official-video",
      source_key: "huberman-episode-pages",
    });
  });

  it("lets an official YouTube source upgrade an episode-page video record", async () => {
    const existingDocuments: StoredDocumentRow[] = [
      {
        id: "linked-video",
        identity_key: "youtube:video-1",
        content_fingerprint: "episode-page-fingerprint",
        pmid: null,
        doi: null,
      },
    ];
    const { client, upserts } = createFakeClient(
      existingDocuments,
      [],
      [{ document_id: "linked-video", source_key: "huberman-episode-pages" }]
    );
    const store = createEvidenceStore(client);

    const result = await store.persistBatch({
      sourceKey: "huberman-youtube",
      cursor: "2026-08-22T00:00:00.000Z",
      documents: [
        {
          identityKey: "youtube:video-1",
          sourceKey: "huberman-youtube",
          externalId: "video-1",
          documentType: "video",
          canonicalUrl: "https://www.youtube.com/watch?v=video-1",
          title: "Official video title",
          rightsMode: "metadata_only",
          contentFingerprint: "official-fingerprint",
        },
      ],
      people: [],
    });

    expect(result).toMatchObject({ inserted: 0, updated: 1, skipped: 0, errors: 0 });
    expect(upserts.find((call) => call.table === "evidence_documents")?.rows[0]).toMatchObject({
      identity_key: "youtube:video-1",
      title: "Official video title",
      content_fingerprint: "official-fingerprint",
    });
  });

  it("persists pending claims and episode-to-reference provenance with canonical IDs", async () => {
    const { client, upserts } = createFakeClient();
    const store = createEvidenceStore(client);
    const batch: EvidenceBatch = {
      sourceKey: "huberman-episode-pages",
      cursor: "2026-08-18T00:00:00.000Z",
      documents: [
        {
          identityKey: "huberman:episode-1",
          sourceKey: "huberman-episode-pages",
          externalId: "episode-1",
          documentType: "podcast_episode",
          canonicalUrl: "https://www.hubermanlab.com/episode/episode-1",
          title: "Episode one",
          rightsMode: "metadata_only",
        },
        {
          identityKey: "doi:10.1000/reference",
          sourceKey: "huberman-episode-pages",
          externalId: "doi:10.1000/reference",
          documentType: "publication",
          canonicalUrl: "https://doi.org/10.1000/reference",
          title: "Referenced study",
          doi: "10.1000/reference",
          rightsMode: "metadata_only",
        },
      ],
      people: [],
      claims: [
        {
          documentIdentityKey: "huberman:episode-1",
          claimHash: "claim-1",
          claimText: "Candidate protocol mentioned in public show-note metadata.",
          claimType: "protocol",
          evidenceLevel: "unknown",
        },
      ],
      relations: [
        {
          sourceDocumentIdentityKey: "huberman:episode-1",
          targetDocumentIdentityKey: "doi:10.1000/reference",
          sourceKey: "huberman-episode-pages",
          relationType: "cites",
        },
      ],
    };

    const result = await store.persistBatch(batch);

    expect(result).toMatchObject({ inserted: 2, updated: 0, skipped: 0, errors: 0 });
    expect(upserts.find((call) => call.table === "evidence_claims")?.rows[0]).toMatchObject({
      document_id: "stored-0-huberman:episode-1",
      claim_hash: "claim-1",
      claim_type: "protocol",
    });
    expect(
      upserts.find((call) => call.table === "evidence_document_relations")?.rows[0]
    ).toMatchObject({
      source_document_id: "stored-0-huberman:episode-1",
      target_document_id: "stored-1-doi:10.1000/reference",
      source_key: "huberman-episode-pages",
      relation_type: "cites",
    });
  });

  it("does not let unverified author candidates overwrite a guest profile", async () => {
    const { client, upserts } = createFakeClient(
      [],
      [
        {
          id: "person-peter",
          normalized_name: "peter attia",
          display_name: "Peter Attia",
          credentials: ["MD"],
          affiliations: ["Early Medical"],
          primary_url: "https://peterattiamd.com",
          metadata: { roles: ["guest"] },
        },
      ]
    );
    const store = createEvidenceStore(client);

    await store.persistBatch({
      sourceKey: "crossref-guests",
      cursor: "2026-08-18T00:00:00.000Z",
      documents: [
        {
          identityKey: "doi:10.1000/battery",
          sourceKey: "crossref-guests",
          externalId: "doi:10.1000/battery",
          documentType: "publication",
          canonicalUrl: "https://doi.org/10.1000/battery",
          title: "Battery research",
          doi: "10.1000/battery",
          rightsMode: "metadata_only",
        },
      ],
      people: [
        {
          documentSourceKey: "crossref-guests",
          documentExternalId: "doi:10.1000/battery",
          displayName: "Peter Attia",
          normalizedName: "peter attia",
          credentials: ["PhD"],
          affiliations: ["Battery Lab"],
          primaryUrl: "https://wrong.example.com",
          role: "author",
          matchStatus: "candidate",
          confidence: 0.48,
          metadata: { crossrefMatchedName: "Peter M Attia", orcid: "candidate" },
        },
      ],
    });

    expect(upserts.find((call) => call.table === "people")?.rows[0]).toEqual({
      normalized_name: "peter attia",
      display_name: "Peter Attia",
      credentials: ["MD"],
      affiliations: ["Early Medical"],
      primary_url: "https://peterattiamd.com",
      metadata: { roles: ["guest"] },
    });
    expect(upserts.find((call) => call.table === "document_people")?.rows[0]).toMatchObject({
      person_id: "person-peter",
      role: "author",
      match_status: "candidate",
      metadata: { crossrefMatchedName: "Peter M Attia", orcid: "candidate" },
    });
  });
});
