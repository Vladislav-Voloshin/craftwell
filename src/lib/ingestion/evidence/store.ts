import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../shared";
import { assertMetadataDoesNotContainRawContent, validateEvidenceDocument } from "./policy";
import type {
  EvidenceClaimInput,
  EvidenceDocumentInput,
  EvidenceRelationInput,
  EvidenceStore,
  GuestResearchCandidate,
  PersonMentionInput,
  PersonRole,
  PersonSourceInput,
} from "./types";

const WRITE_BATCH_SIZE = 50;

// Direct, source-owned metadata must not be replaced by lower-detail links
// discovered on another page. Equal-priority sources can still refresh a
// canonical record, while every source always retains its own provenance row.
const SOURCE_PRIORITIES: Readonly<Record<string, number>> = {
  "huberman-episode-pages": 20,
  "crossref-guests": 60,
  "huberman-site": 80,
  "huberman-rss": 90,
  "books-catalog": 90,
  "huberman-youtube": 100,
  "pubmed-health": 100,
  "pubmed-guests": 100,
  "huberman-stanford-lab": 100,
  "examine-connect": 110,
};

interface StoredDocument {
  id: string;
  identity_key: string;
  content_fingerprint?: string | null;
  pmid?: string | null;
  doi?: string | null;
}

interface DocumentResolution {
  byInputKey: Map<string, StoredDocument>;
  highestSourcePriorityByDocumentId: Map<string, number>;
}

interface StoredPerson {
  id: string;
  normalized_name: string;
  display_name?: string;
  credentials?: string[];
  affiliations?: string[];
  primary_url?: string | null;
  metadata?: Record<string, unknown>;
}

export function createEvidenceStore(client: SupabaseClient = getSupabaseAdmin()): EvidenceStore {
  return {
    async startRun(input) {
      const { data, error } = await client
        .from("ingestion_runs")
        .insert({
          source_key: input.sourceKey,
          trigger_type: input.trigger,
          status: "running",
          request_id: input.requestId ?? null,
          cursor_start: input.cursorStart ?? null,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Unable to start ${input.sourceKey} ingestion: ${error?.message}`);
      }
      return data.id as string;
    },

    async persistBatch(batch) {
      const sourceDocuments = batch.documents.map(validateEvidenceDocument);
      const deduped = deduplicateDocuments(sourceDocuments);
      const documents = deduped.documents;
      const existingDocuments = await loadExistingDocuments(client, sourceDocuments);
      mapExistingAliasesToCanonicalDocuments(
        existingDocuments,
        sourceDocuments,
        deduped.canonicalIdentityByInputIdentity
      );
      const changedDocuments = documents.filter((document) => {
        const existing = existingDocuments.byInputKey.get(document.identityKey);
        if (!existing) return true;
        if (
          existing.identity_key !== document.identityKey ||
          existing.content_fingerprint === document.contentFingerprint
        ) {
          return false;
        }
        const existingPriority =
          existingDocuments.highestSourcePriorityByDocumentId.get(existing.id) ?? 0;
        return sourcePriority(document.sourceKey) >= existingPriority;
      });
      const changedStoredDocuments = await upsertDocuments(client, changedDocuments);
      const documentIds = buildDocumentIdMap(
        sourceDocuments,
        existingDocuments,
        changedStoredDocuments,
        deduped.canonicalIdentityByInputIdentity
      );
      await upsertDocumentSources(client, documentIds, sourceDocuments);
      await upsertPeopleAndRelationships(
        client,
        documentIds,
        sourceDocuments,
        batch.people,
        batch.synchronizePersonRoles ?? {}
      );
      const missingPersonSources = await upsertPersonSources(client, batch.personSources ?? []);
      const missingClaims = await upsertEvidenceClaims(client, documentIds, batch.claims ?? []);
      const missingRelations = await upsertDocumentRelations(
        client,
        documentIds,
        batch.relations ?? []
      );
      await syncLegacyPodcastEpisodes(client, sourceDocuments);

      const inserted = changedDocuments.filter(
        (document) => !existingDocuments.byInputKey.has(documentKey(document))
      ).length;
      const unchanged = documents.length - changedDocuments.length;
      const errors =
        (batch.errors?.length ?? 0) + missingPersonSources + missingClaims + missingRelations;
      return {
        discovered: batch.documents.length,
        inserted,
        updated: changedDocuments.length - inserted,
        skipped: deduped.duplicates + unchanged,
        errors,
      };
    },

    async listGuestResearchCandidates(limit) {
      const { data, error } = await client
        .from("people")
        .select(
          "display_name, normalized_name, credentials, affiliations, primary_url, document_people!inner(role,match_status)"
        )
        .eq("document_people.role", "guest")
        .in("document_people.match_status", ["verified", "extracted"])
        .order("last_research_check_at", { ascending: true, nullsFirst: true })
        .limit(Math.min(Math.max(limit, 1), 500));
      if (error) {
        throw new Error(`Unable to load guest research queue: ${error.message}`);
      }
      return (
        (data ?? []) as Array<{
          display_name: string;
          normalized_name: string;
          credentials: string[];
          affiliations: string[];
          primary_url: string | null;
        }>
      ).map(
        (person): GuestResearchCandidate => ({
          displayName: person.display_name,
          normalizedName: person.normalized_name,
          credentials: person.credentials ?? [],
          affiliations: person.affiliations ?? [],
          primaryUrl: person.primary_url ?? undefined,
        })
      );
    },

    async markGuestResearchChecked(normalizedNames, checkedAt) {
      if (normalizedNames.length === 0) return;
      const { error } = await client
        .from("people")
        .update({ last_research_check_at: checkedAt })
        .in("normalized_name", normalizedNames);
      if (error) {
        throw new Error(`Unable to checkpoint guest research: ${error.message}`);
      }
    },

    async finishRun(input) {
      const completedAt = new Date().toISOString();
      const { error: runError } = await client
        .from("ingestion_runs")
        .update({
          status: input.status,
          cursor_end: input.cursorEnd ?? null,
          discovered_count: input.result.discovered,
          inserted_count: input.result.inserted,
          updated_count: input.result.updated,
          skipped_count: input.result.skipped,
          error_count: input.result.errors,
          error_summary: input.error ?? null,
          metadata: input.metadata ?? {},
          completed_at: completedAt,
        })
        .eq("id", input.runId);
      if (runError) {
        throw new Error(`Unable to finish ingestion run: ${runError.message}`);
      }

      const sourceUpdate =
        input.status === "failed"
          ? { last_error: input.error ?? "Ingestion failed" }
          : {
              last_cursor: input.cursorEnd ?? null,
              last_success_at: completedAt,
              last_error: input.status === "partial" ? (input.error ?? null) : null,
            };
      const { error: sourceError } = await client
        .from("ingestion_sources")
        .update(sourceUpdate)
        .eq("source_key", input.sourceKey);
      if (sourceError) {
        throw new Error(`Unable to update source checkpoint: ${sourceError.message}`);
      }
    },
  };
}

function deduplicateDocuments(documents: EvidenceDocumentInput[]): {
  documents: EvidenceDocumentInput[];
  duplicates: number;
  canonicalIdentityByInputIdentity: Map<string, string>;
} {
  const parents = documents.map((_, index) => index);
  const ranks = documents.map(() => 0);
  const indexByKey = new Map<string, number>();

  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  };
  const union = (left: number, right: number) => {
    let leftRoot = find(left);
    let rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot] < ranks[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    parents[rightRoot] = leftRoot;
    if (ranks[leftRoot] === ranks[rightRoot]) ranks[leftRoot] += 1;
  };

  documents.forEach((document, index) => {
    const keys = [
      `identity:${document.identityKey}`,
      ...(document.pmid ? [`pmid:${document.pmid}`] : []),
      ...(document.doi ? [`doi:${document.doi.toLowerCase()}`] : []),
    ];
    for (const key of keys) {
      const prior = indexByKey.get(key);
      if (prior === undefined) indexByKey.set(key, index);
      else union(index, prior);
    }
  });

  const groups = new Map<number, number[]>();
  documents.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });

  const canonicalIdentityByInputIdentity = new Map<string, string>();
  const canonicalDocuments = Array.from(groups.values()).map((indices) => {
    const canonicalIndex = indices.reduce((best, index) =>
      canonicalDocumentScore(documents[index]) > canonicalDocumentScore(documents[best])
        ? index
        : best
    );
    const canonical = documents[canonicalIndex];
    for (const index of indices) {
      canonicalIdentityByInputIdentity.set(documents[index].identityKey, canonical.identityKey);
    }
    return canonical;
  });

  return {
    documents: canonicalDocuments,
    duplicates: documents.length - canonicalDocuments.length,
    canonicalIdentityByInputIdentity,
  };
}

function canonicalDocumentScore(document: EvidenceDocumentInput): number {
  return (
    sourcePriority(document.sourceKey) * 100 + (document.pmid ? 20 : 0) + (document.doi ? 10 : 0)
  );
}

function mapExistingAliasesToCanonicalDocuments(
  existing: DocumentResolution,
  documents: EvidenceDocumentInput[],
  canonicalIdentityByInputIdentity: Map<string, string>
): void {
  for (const document of documents) {
    const stored = existing.byInputKey.get(document.identityKey);
    const canonicalIdentity = canonicalIdentityByInputIdentity.get(document.identityKey);
    if (stored && canonicalIdentity && !existing.byInputKey.has(canonicalIdentity)) {
      existing.byInputKey.set(canonicalIdentity, stored);
    }
  }
}

async function loadExistingDocuments(
  client: SupabaseClient,
  documents: EvidenceDocumentInput[]
): Promise<DocumentResolution> {
  const byIdentity = new Map<string, StoredDocument>();
  const byPmid = new Map<string, StoredDocument>();
  const byDoi = new Map<string, StoredDocument>();

  await loadDocumentsByColumn(
    client,
    "identity_key",
    documents.map((document) => document.identityKey),
    (document) => byIdentity.set(document.identity_key, document)
  );
  await loadDocumentsByColumn(
    client,
    "pmid",
    documents.map((document) => document.pmid).filter((value): value is string => Boolean(value)),
    (document) => {
      if (document.pmid) byPmid.set(document.pmid, document);
    }
  );
  await loadDocumentsByColumn(
    client,
    "doi",
    documents.map((document) => document.doi).filter((value): value is string => Boolean(value)),
    (document) => {
      if (document.doi) byDoi.set(document.doi.toLowerCase(), document);
    }
  );

  const byInputKey = new Map<string, StoredDocument>();
  for (const document of documents) {
    const existing =
      (document.doi ? byDoi.get(document.doi.toLowerCase()) : undefined) ??
      (document.pmid ? byPmid.get(document.pmid) : undefined) ??
      byIdentity.get(document.identityKey);
    if (existing) byInputKey.set(document.identityKey, existing);
  }

  const highestSourcePriorityByDocumentId = await loadHighestDocumentSourcePriorities(
    client,
    unique(Array.from(byInputKey.values()).map((document) => document.id))
  );

  return { byInputKey, highestSourcePriorityByDocumentId };
}

async function loadHighestDocumentSourcePriorities(
  client: SupabaseClient,
  documentIds: string[]
): Promise<Map<string, number>> {
  const priorities = new Map<string, number>();
  for (const batch of batches(documentIds, 100)) {
    const { data, error } = await client
      .from("document_sources")
      .select("document_id, source_key")
      .in("document_id", batch);
    if (error) throw new Error(`Unable to load evidence source priority: ${error.message}`);
    for (const row of (data ?? []) as Array<{ document_id: string; source_key: string }>) {
      priorities.set(
        row.document_id,
        Math.max(priorities.get(row.document_id) ?? 0, sourcePriority(row.source_key))
      );
    }
  }
  return priorities;
}

function sourcePriority(sourceKey: string): number {
  return SOURCE_PRIORITIES[sourceKey] ?? 50;
}

async function loadDocumentsByColumn(
  client: SupabaseClient,
  column: "identity_key" | "pmid" | "doi",
  values: string[],
  collect: (document: StoredDocument) => void
): Promise<void> {
  for (const batch of batches(unique(values), 100)) {
    const { data, error } = await client
      .from("evidence_documents")
      .select("id, identity_key, content_fingerprint, pmid, doi")
      .in(column, batch);
    if (error) {
      throw new Error(`Unable to check evidence duplicates by ${column}: ${error.message}`);
    }
    for (const row of data ?? []) collect(row as StoredDocument);
  }
}

function buildDocumentIdMap(
  documents: EvidenceDocumentInput[],
  existing: DocumentResolution,
  changed: StoredDocument[],
  canonicalIdentityByInputIdentity: Map<string, string>
): Map<string, string> {
  const changedByIdentity = new Map(
    changed.map((document) => [document.identity_key, document.id])
  );
  const result = new Map<string, string>();
  for (const document of documents) {
    const canonicalIdentity =
      canonicalIdentityByInputIdentity.get(document.identityKey) ?? document.identityKey;
    const documentId =
      changedByIdentity.get(canonicalIdentity) ??
      existing.byInputKey.get(canonicalIdentity)?.id ??
      existing.byInputKey.get(document.identityKey)?.id;
    if (documentId) {
      result.set(document.identityKey, documentId);
      result.set(canonicalIdentity, documentId);
    }
  }
  return result;
}

async function upsertDocuments(
  client: SupabaseClient,
  documents: EvidenceDocumentInput[]
): Promise<StoredDocument[]> {
  const stored: StoredDocument[] = [];
  const seenAt = new Date().toISOString();

  for (const batch of batches(documents, WRITE_BATCH_SIZE)) {
    const rows = batch.map((document) => ({
      identity_key: document.identityKey,
      document_type: document.documentType,
      canonical_url: document.canonicalUrl,
      title: document.title,
      source_excerpt: document.sourceExcerpt ?? null,
      derived_summary: document.derivedSummary ?? null,
      published_at: document.publishedAt ?? null,
      authors: document.authors ?? [],
      guests: document.guests ?? [],
      topics: document.topics ?? [],
      pmid: document.pmid ?? null,
      doi: document.doi ?? null,
      language: document.language ?? "en",
      rights_mode: document.rightsMode,
      content_fingerprint: document.contentFingerprint ?? null,
      metadata: document.metadata ?? {},
      last_seen_at: seenAt,
    }));
    const { data, error } = await client
      .from("evidence_documents")
      .upsert(rows, { onConflict: "identity_key" })
      .select("id, identity_key, content_fingerprint");
    if (error) throw new Error(`Unable to store evidence documents: ${error.message}`);
    stored.push(...((data ?? []) as StoredDocument[]));
  }

  return stored;
}

async function upsertDocumentSources(
  client: SupabaseClient,
  documentIds: Map<string, string>,
  documents: EvidenceDocumentInput[]
): Promise<void> {
  const seenAt = new Date().toISOString();
  const rows = documents.flatMap((document) => {
    const documentId = documentIds.get(document.identityKey);
    if (!documentId) return [];
    return [
      {
        document_id: documentId,
        source_key: document.sourceKey,
        external_id: document.externalId,
        canonical_url: document.canonicalUrl,
        metadata: {
          rightsMode: document.rightsMode,
          contentFingerprint: document.contentFingerprint ?? null,
          sourceMetadata: document.metadata ?? {},
        },
        last_seen_at: seenAt,
      },
    ];
  });

  for (const batch of batches(rows, WRITE_BATCH_SIZE)) {
    const { error } = await client
      .from("document_sources")
      .upsert(batch, { onConflict: "source_key,external_id" });
    if (error) throw new Error(`Unable to store evidence sources: ${error.message}`);
  }
}

async function upsertPeopleAndRelationships(
  client: SupabaseClient,
  documentIdsByIdentity: Map<string, string>,
  sourceDocuments: EvidenceDocumentInput[],
  mentions: PersonMentionInput[],
  synchronizeRoles: Partial<Record<PersonRole, string[]>>
): Promise<void> {
  if (documentIdsByIdentity.size === 0) return;

  const mergedMentions = mergePersonMentions(mentions);
  const names = Array.from(mergedMentions.keys());
  const existingPeople = new Map<string, StoredPerson>();

  for (const batch of batches(names, 100)) {
    const { data, error } = await client
      .from("people")
      .select("id, normalized_name, display_name, credentials, affiliations, primary_url, metadata")
      .in("normalized_name", batch);
    if (error) throw new Error(`Unable to load people: ${error.message}`);
    for (const person of (data ?? []) as StoredPerson[]) {
      existingPeople.set(person.normalized_name, person);
    }
  }

  const personRows = names.map((name) => {
    const incoming = mergedMentions.get(name)!;
    const existing = existingPeople.get(name);
    const existingRoles = Array.isArray(existing?.metadata?.roles)
      ? existing.metadata.roles.filter((role): role is string => typeof role === "string")
      : [];
    const incomingRoles = mentions
      .filter(
        (mention) => mention.normalizedName === name && isTrustedPersonProfileMention(mention)
      )
      .map((mention) => mention.role);
    return {
      normalized_name: name,
      display_name: existing?.display_name || incoming.displayName,
      credentials: unique([...(existing?.credentials ?? []), ...incoming.credentials]),
      affiliations: unique([...(existing?.affiliations ?? []), ...incoming.affiliations]),
      primary_url: existing?.primary_url || incoming.primaryUrl || null,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(incoming.metadata ?? {}),
        roles: unique([...existingRoles, ...incomingRoles]),
      },
    };
  });

  const storedPeople: StoredPerson[] = [];
  for (const batch of batches(personRows, WRITE_BATCH_SIZE)) {
    const { data, error } = await client
      .from("people")
      .upsert(batch, { onConflict: "normalized_name" })
      .select("id, normalized_name");
    if (error) throw new Error(`Unable to store people: ${error.message}`);
    storedPeople.push(...((data ?? []) as StoredPerson[]));
  }

  const documentIds = new Map(
    sourceDocuments.flatMap((document) => {
      const documentId = documentIdsByIdentity.get(document.identityKey);
      return documentId ? [[`${document.sourceKey}\u0000${document.externalId}`, documentId]] : [];
    })
  );
  const personIds = new Map(storedPeople.map((person) => [person.normalized_name, person.id]));
  const relationshipRows = mentions.flatMap((mention) => {
    const documentId = documentIds.get(
      `${mention.documentSourceKey}\u0000${mention.documentExternalId}`
    );
    const personId = personIds.get(mention.normalizedName);
    if (!documentId || !personId) return [];
    assertMetadataDoesNotContainRawContent(mention.metadata ?? {});
    return [
      {
        document_id: documentId,
        person_id: personId,
        role: mention.role,
        match_status: mention.matchStatus,
        confidence: mention.confidence,
        evidence: mention.evidence ?? null,
        metadata: mention.metadata ?? {},
      },
    ];
  });

  const dedupedRelationships = deduplicateBy(
    relationshipRows,
    (row) => `${row.document_id}\u0000${row.person_id}\u0000${row.role}`
  );
  const synchronizedRoleSet = new Set(Object.keys(synchronizeRoles) as PersonRole[]);
  for (const role of synchronizedRoleSet) {
    const identityKeys = synchronizeRoles[role] ?? [];
    const missingIdentityKeys = identityKeys.filter(
      (identityKey) => !documentIdsByIdentity.has(identityKey)
    );
    if (missingIdentityKeys.length > 0) {
      throw new Error(
        `Unable to synchronize ${role} evidence people: ${missingIdentityKeys.length} document IDs were unresolved`
      );
    }
    const synchronizedDocumentIds = unique(
      identityKeys.flatMap((identityKey) => {
        const documentId = documentIdsByIdentity.get(identityKey);
        return documentId ? [documentId] : [];
      })
    );
    if (synchronizedDocumentIds.length === 0) continue;
    const synchronizedDocumentIdSet = new Set(synchronizedDocumentIds);
    const rows = dedupedRelationships.filter(
      (row) => row.role === role && synchronizedDocumentIdSet.has(row.document_id)
    );
    const { error } = await client.rpc("replace_document_people_for_role", {
      p_document_ids: synchronizedDocumentIds,
      p_role: role,
      p_rows: rows,
    });
    if (error) throw new Error(`Unable to synchronize ${role} evidence people: ${error.message}`);
  }

  const additiveRelationships = dedupedRelationships.filter(
    (row) => !synchronizedRoleSet.has(row.role)
  );
  for (const batch of batches(additiveRelationships, WRITE_BATCH_SIZE)) {
    const { error } = await client
      .from("document_people")
      .upsert(batch, { onConflict: "document_id,person_id,role" });
    if (error) throw new Error(`Unable to link people to evidence: ${error.message}`);
  }
}

async function upsertPersonSources(
  client: SupabaseClient,
  sources: PersonSourceInput[]
): Promise<number> {
  if (sources.length === 0) return 0;
  const normalizedNames = unique(sources.map((source) => source.normalizedName));
  const personIds = new Map<string, string>();
  for (const batch of batches(normalizedNames, 100)) {
    const { data, error } = await client
      .from("people")
      .select("id, normalized_name")
      .in("normalized_name", batch);
    if (error) throw new Error(`Unable to load people for source links: ${error.message}`);
    for (const person of (data ?? []) as StoredPerson[]) {
      personIds.set(person.normalized_name, person.id);
    }
  }

  let missing = 0;
  const rows = sources.flatMap((source) => {
    const personId = personIds.get(source.normalizedName);
    if (!personId || !isHttpUrl(source.url)) {
      missing += 1;
      return [];
    }
    assertMetadataDoesNotContainRawContent(source.metadata ?? {});
    return [
      {
        person_id: personId,
        source_kind: source.sourceKind,
        url: source.url,
        title: source.title ?? null,
        verified: source.verified ?? false,
        metadata: source.metadata ?? {},
        last_checked_at: new Date().toISOString(),
      },
    ];
  });

  const dedupedRows = deduplicateBy(rows, (row) => `${row.person_id}\u0000${row.url}`);
  for (const batch of batches(dedupedRows, WRITE_BATCH_SIZE)) {
    const { error } = await client
      .from("person_sources")
      .upsert(batch, { onConflict: "person_id,url" });
    if (error) throw new Error(`Unable to store person source links: ${error.message}`);
  }
  return missing;
}

async function upsertEvidenceClaims(
  client: SupabaseClient,
  documentIds: Map<string, string>,
  claims: EvidenceClaimInput[]
): Promise<number> {
  if (claims.length === 0) return 0;
  let missing = 0;
  const rows = claims.flatMap((claim) => {
    const documentId = documentIds.get(claim.documentIdentityKey);
    if (!documentId || !claim.claimHash || !claim.claimText.trim()) {
      missing += 1;
      return [];
    }
    assertMetadataDoesNotContainRawContent(claim.structuredData ?? {});
    return [
      {
        document_id: documentId,
        claim_hash: claim.claimHash,
        claim_text: claim.claimText.trim().slice(0, 1_000),
        claim_type: claim.claimType,
        evidence_level: claim.evidenceLevel ?? "unknown",
        structured_data: claim.structuredData ?? {},
        extraction_method: claim.extractionMethod ?? "deterministic",
        extraction_model: claim.extractionModel ?? null,
      },
    ];
  });

  const dedupedRows = deduplicateBy(rows, (row) => `${row.document_id}\u0000${row.claim_hash}`);
  for (const batch of batches(dedupedRows, WRITE_BATCH_SIZE)) {
    const { error } = await client
      .from("evidence_claims")
      .upsert(batch, { onConflict: "document_id,claim_hash" });
    if (error) throw new Error(`Unable to store evidence claims: ${error.message}`);
  }
  return missing;
}

async function upsertDocumentRelations(
  client: SupabaseClient,
  batchDocumentIds: Map<string, string>,
  relations: EvidenceRelationInput[]
): Promise<number> {
  if (relations.length === 0) return 0;
  const documentIds = new Map(batchDocumentIds);
  const requestedKeys = unique(
    relations.flatMap((relation) => [
      relation.sourceDocumentIdentityKey,
      relation.targetDocumentIdentityKey,
    ])
  ).filter((identityKey) => !documentIds.has(identityKey));
  await loadDocumentsByColumn(client, "identity_key", requestedKeys, (document) => {
    documentIds.set(document.identity_key, document.id);
  });

  let missing = 0;
  const seenAt = new Date().toISOString();
  const rows = relations.flatMap((relation) => {
    const sourceDocumentId = documentIds.get(relation.sourceDocumentIdentityKey);
    const targetDocumentId = documentIds.get(relation.targetDocumentIdentityKey);
    if (!sourceDocumentId || !targetDocumentId) {
      missing += 1;
      return [];
    }
    if (sourceDocumentId === targetDocumentId) return [];
    assertMetadataDoesNotContainRawContent(relation.metadata ?? {});
    return [
      {
        source_document_id: sourceDocumentId,
        target_document_id: targetDocumentId,
        source_key: relation.sourceKey,
        relation_type: relation.relationType,
        metadata: relation.metadata ?? {},
        last_seen_at: seenAt,
      },
    ];
  });

  const dedupedRows = deduplicateBy(
    rows,
    (row) =>
      `${row.source_document_id}\u0000${row.target_document_id}\u0000${row.source_key}\u0000${row.relation_type}`
  );
  for (const batch of batches(dedupedRows, WRITE_BATCH_SIZE)) {
    const { error } = await client.from("evidence_document_relations").upsert(batch, {
      onConflict: "source_document_id,target_document_id,source_key,relation_type",
    });
    if (error) throw new Error(`Unable to store evidence document relations: ${error.message}`);
  }
  return missing;
}

async function syncLegacyPodcastEpisodes(
  client: SupabaseClient,
  documents: EvidenceDocumentInput[]
): Promise<void> {
  const rows = documents.flatMap((document) => {
    if (document.documentType !== "podcast_episode") return [];
    const episodeNumber = document.metadata?.episodeNumber;
    if (typeof episodeNumber !== "number" || episodeNumber <= 0) return [];
    const durationSeconds = document.metadata?.durationSeconds;
    return [
      {
        episode_number: episodeNumber,
        title: document.title,
        description: document.sourceExcerpt ?? null,
        publish_date: document.publishedAt?.slice(0, 10) ?? null,
        duration_seconds: typeof durationSeconds === "number" ? durationSeconds : 0,
        guests: document.guests ?? [],
        topics: document.topics ?? [],
        url: document.canonicalUrl,
      },
    ];
  });

  for (const batch of batches(rows, WRITE_BATCH_SIZE)) {
    const { error } = await client
      .from("podcast_episodes")
      .upsert(batch, { onConflict: "episode_number" });
    if (error) throw new Error(`Unable to sync podcast metadata: ${error.message}`);
  }
}

function mergePersonMentions(mentions: PersonMentionInput[]): Map<string, PersonMentionInput> {
  const merged = new Map<string, PersonMentionInput>();
  for (const mention of mentions) {
    const profileMention = isTrustedPersonProfileMention(mention)
      ? mention
      : {
          ...mention,
          credentials: [],
          affiliations: [],
          primaryUrl: undefined,
          metadata: undefined,
        };
    const existing = merged.get(mention.normalizedName);
    if (!existing) {
      merged.set(mention.normalizedName, { ...profileMention });
      continue;
    }
    if (!isTrustedPersonProfileMention(mention)) continue;
    merged.set(mention.normalizedName, {
      ...existing,
      credentials: unique([...existing.credentials, ...profileMention.credentials]),
      affiliations: unique([...existing.affiliations, ...profileMention.affiliations]),
      primaryUrl: existing.primaryUrl ?? profileMention.primaryUrl,
      metadata: { ...(existing.metadata ?? {}), ...(profileMention.metadata ?? {}) },
    });
  }
  return merged;
}

function isTrustedPersonProfileMention(mention: PersonMentionInput): boolean {
  return mention.matchStatus === "verified" || mention.matchStatus === "extracted";
}

function documentKey(document: EvidenceDocumentInput): string {
  return document.identityKey;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function batches<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function deduplicateBy<T>(items: T[], key: (item: T) => string): T[] {
  return Array.from(new Map(items.map((item) => [key(item), item])).values());
}
