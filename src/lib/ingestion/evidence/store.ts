import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../shared";
import { validateEvidenceDocument } from "./policy";
import type {
  EvidenceDocumentInput,
  EvidenceStore,
  GuestResearchCandidate,
  PersonMentionInput,
} from "./types";

const WRITE_BATCH_SIZE = 50;

interface StoredDocument {
  id: string;
  identity_key: string;
  content_fingerprint?: string | null;
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
      const deduped = deduplicateDocuments(batch.documents);
      const documents = deduped.documents.map(validateEvidenceDocument);
      const existingDocuments = await loadExistingDocuments(client, documents);
      const changedDocuments = documents.filter((document) => {
        const existing = existingDocuments.get(document.identityKey);
        return existing?.content_fingerprint !== document.contentFingerprint;
      });
      const changedKeys = new Set(changedDocuments.map((document) => document.identityKey));
      const storedDocuments = [
        ...Array.from(existingDocuments.values()).filter(
          (document) => !changedKeys.has(document.identity_key)
        ),
        ...(await upsertDocuments(client, changedDocuments)),
      ];
      await upsertDocumentSources(client, storedDocuments, documents);
      await upsertPeopleAndRelationships(client, storedDocuments, documents, batch.people);
      await syncLegacyPodcastEpisodes(client, documents);

      const inserted = changedDocuments.filter(
        (document) => !existingDocuments.has(documentKey(document))
      ).length;
      const unchanged = documents.length - changedDocuments.length;
      return {
        discovered: batch.documents.length,
        inserted,
        updated: changedDocuments.length - inserted,
        skipped: deduped.duplicates + unchanged,
        errors: 0,
      };
    },

    async listGuestResearchCandidates(limit) {
      const { data, error } = await client
        .from("people")
        .select("display_name, normalized_name, credentials, affiliations, primary_url")
        .contains("metadata", { roles: ["guest"] })
        .order("last_research_check_at", { ascending: true, nullsFirst: true })
        .limit(Math.min(Math.max(limit, 1), 50));
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
} {
  const byKey = new Map<string, EvidenceDocumentInput>();
  for (const document of documents) byKey.set(documentKey(document), document);
  return {
    documents: Array.from(byKey.values()),
    duplicates: documents.length - byKey.size,
  };
}

async function loadExistingDocuments(
  client: SupabaseClient,
  documents: EvidenceDocumentInput[]
): Promise<Map<string, StoredDocument>> {
  const existing = new Map<string, StoredDocument>();
  for (const batch of batches(documents, 100)) {
    const { data, error } = await client
      .from("evidence_documents")
      .select("id, identity_key, content_fingerprint")
      .in(
        "identity_key",
        batch.map((document) => document.identityKey)
      );
    if (error) {
      throw new Error(`Unable to check evidence duplicates: ${error.message}`);
    }
    for (const row of data ?? []) {
      const stored = row as StoredDocument;
      existing.set(stored.identity_key, stored);
    }
  }
  return existing;
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
  storedDocuments: StoredDocument[],
  documents: EvidenceDocumentInput[]
): Promise<void> {
  const documentIds = new Map(
    storedDocuments.map((document) => [document.identity_key, document.id])
  );
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
  documents: StoredDocument[],
  sourceDocuments: EvidenceDocumentInput[],
  mentions: PersonMentionInput[]
): Promise<void> {
  if (mentions.length === 0 || documents.length === 0) return;

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
      .filter((mention) => mention.normalizedName === name)
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

  const identityDocumentIds = new Map(
    documents.map((document) => [document.identity_key, document.id])
  );
  const documentIds = new Map(
    sourceDocuments.flatMap((document) => {
      const documentId = identityDocumentIds.get(document.identityKey);
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
    return [
      {
        document_id: documentId,
        person_id: personId,
        role: mention.role,
        match_status: mention.matchStatus,
        confidence: mention.confidence,
        evidence: mention.evidence ?? null,
      },
    ];
  });

  for (const batch of batches(relationshipRows, WRITE_BATCH_SIZE)) {
    const { error } = await client
      .from("document_people")
      .upsert(batch, { onConflict: "document_id,person_id,role" });
    if (error) throw new Error(`Unable to link people to evidence: ${error.message}`);
  }
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
    const existing = merged.get(mention.normalizedName);
    if (!existing) {
      merged.set(mention.normalizedName, { ...mention });
      continue;
    }
    merged.set(mention.normalizedName, {
      ...existing,
      credentials: unique([...existing.credentials, ...mention.credentials]),
      affiliations: unique([...existing.affiliations, ...mention.affiliations]),
      primaryUrl: existing.primaryUrl ?? mention.primaryUrl,
      metadata: { ...(existing.metadata ?? {}), ...(mention.metadata ?? {}) },
    });
  }
  return merged;
}

function documentKey(document: EvidenceDocumentInput): string {
  return document.identityKey;
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
