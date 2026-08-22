/**
 * Backfill provenance-safe episode references and guest bibliographic metadata.
 *
 * Usage:
 *   npx tsx scripts/backfill-evidence-references.ts --source=all
 *   npx tsx scripts/backfill-evidence-references.ts --source=episodes --offset=0 --limit=50
 *   npx tsx scripts/backfill-evidence-references.ts --source=crossref --offset=0 --limit=25
 *   npx tsx scripts/backfill-evidence-references.ts --source=pubmed --offset=0 --limit=25
 *   npx tsx scripts/backfill-evidence-references.ts --source=books --offset=0 --limit=500
 *   npx tsx scripts/backfill-evidence-references.ts --source=crossref --limit=1 --rows=5 --max-pages=1
 */
import { config } from "dotenv";

config({ path: ".env.local", override: true });

import { fetchGuestCrossrefEvidence } from "../src/lib/ingestion/evidence/crossref-guests";
import { fetchGuestPubMedEvidence } from "../src/lib/ingestion/evidence/pubmed-guests";
import { fetchHubermanEpisodePageEvidence } from "../src/lib/ingestion/evidence/huberman-episode-pages";
import { fetchHubermanRssEvidence } from "../src/lib/ingestion/evidence/huberman-rss";
import { fetchOpenLibraryBookEvidence } from "../src/lib/ingestion/evidence/open-library-books";
import { normalizePersonName } from "../src/lib/ingestion/evidence/policy";
import { createEvidenceStore } from "../src/lib/ingestion/evidence/store";
import { getSupabaseAdmin } from "../src/lib/ingestion/shared";
import type {
  EvidenceBatch,
  EvidenceStore,
  PersistResult,
} from "../src/lib/ingestion/evidence/types";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, value = "true"] = argument.replace(/^--/, "").split("=", 2);
    return [key, value];
  })
);
const source = args.get("source") ?? "all";
const offset = positiveInteger(args.get("offset"), 0);
const limit = positiveInteger(args.get("limit"), Number.MAX_SAFE_INTEGER);
const backfillBatchSize = Math.min(Math.max(positiveInteger(args.get("batch-size"), 8), 1), 20);
const crossrefRows = Math.min(Math.max(positiveInteger(args.get("rows"), 100), 1), 100);
const crossrefMaxPages = Math.min(Math.max(positiveInteger(args.get("max-pages"), 10), 1), 25);
const guestFilter = args.get("guest")?.trim();

async function main() {
  const store = createEvidenceStore();
  if (source === "all" || source === "episodes") {
    await backfillEpisodeReferences(store);
  }
  if (source === "all" || source === "crossref") {
    await backfillCrossrefGuests(store);
  }
  if (source === "all" || source === "pubmed") {
    await backfillPubMedGuests(store);
  }
  if (source === "all" || source === "books") {
    await backfillBookCatalog(store);
  }
  if (!["all", "episodes", "crossref", "pubmed", "books"].includes(source)) {
    throw new Error("--source must be all, episodes, crossref, pubmed, or books");
  }
}

async function backfillBookCatalog(store: EvidenceStore): Promise<void> {
  const client = getSupabaseAdmin();
  const requestedLimit = Math.min(limit, 500);
  if (requestedLimit === 0) {
    console.log("Open Library book backfill: 0 candidates requested");
    return;
  }
  const end = offset + requestedLimit - 1;
  const { data, error } = await client
    .from("evidence_documents")
    .select("identity_key, canonical_url, title, metadata")
    .eq("document_type", "book")
    .order("first_seen_at", { ascending: true })
    .range(offset, end);
  if (error) throw new Error(`Unable to load book catalog candidates: ${error.message}`);

  const references = (data ?? []).map((document) => ({
    identityKey: document.identity_key as string,
    canonicalUrl: document.canonical_url as string,
    title: document.title as string,
    metadata:
      document.metadata && typeof document.metadata === "object"
        ? (document.metadata as Record<string, unknown>)
        : undefined,
  }));
  const batch = await fetchOpenLibraryBookEvidence({
    references,
    contactEmail: process.env.OPEN_LIBRARY_CONTACT_EMAIL ?? process.env.NCBI_CONTACT_EMAIL,
  });
  const documentChunks = chunkValues(batch.documents, backfillBatchSize);
  const batches = documentChunks.length > 0 ? documentChunks : [[]];
  const result: PersistResult = {
    discovered: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (let index = 0; index < batches.length; index += 1) {
    const chunkResult = await persistBackfillBatch(
      store,
      {
        ...batch,
        documents: batches[index],
        errors: index === 0 ? batch.errors : [],
        metadata: {
          ...batch.metadata,
          backfillChunk: index + 1,
          backfillChunks: batches.length,
        },
      },
      {}
    );
    addPersistResult(result, chunkResult);
  }
  console.log(
    `Open Library book backfill: ${references.length} candidates, ${batch.documents.length} matches, ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`
  );
}

async function backfillEpisodeReferences(store: EvidenceStore): Promise<void> {
  const rss = await fetchHubermanRssEvidence({
    publishedSince: new Date("2020-12-01T00:00:00.000Z"),
  });
  const episodes = rss.documents.slice(offset, offset + limit);
  console.log(`Episode reference backfill: ${episodes.length} of ${rss.documents.length} episodes`);

  // Ensure every relation source exists before inserting episode -> reference
  // graph edges. This also makes offset/limit canaries safe when the newest RSS
  // item has not yet been collected by the scheduled job.
  const episodeIdentityKeys = new Set(episodes.map((episode) => episode.identityKey));
  const episodeExternalIds = new Set(episodes.map((episode) => episode.externalId));
  if (episodes.length > 0) {
    await persistBackfillBatch(
      store,
      {
        ...rss,
        documents: episodes,
        people: rss.people.filter((person) => episodeExternalIds.has(person.documentExternalId)),
        claims: rss.claims?.filter((claim) => episodeIdentityKeys.has(claim.documentIdentityKey)),
        synchronizePersonRoles: {
          host: episodes.map((episode) => episode.identityKey),
          guest: episodes.map((episode) => episode.identityKey),
        },
      },
      {
        cursorStart: episodes.at(-1)?.publishedAt,
        cursorEnd: episodes[0]?.publishedAt,
      }
    );
  }

  for (let index = 0; index < episodes.length; index += backfillBatchSize) {
    const page = episodes.slice(index, index + backfillBatchSize);
    const batch = await fetchHubermanEpisodePageEvidence({ episodes: page, concurrency: 3 });
    await persistBackfillBatch(store, batch, {
      cursorStart: page[0]?.publishedAt,
      cursorEnd: page.at(-1)?.publishedAt,
    });
    console.log(
      `Episode pages ${offset + index + 1}-${offset + index + page.length}: ${batch.documents.length} references, ${batch.errors?.length ?? 0} page errors`
    );
  }
}

async function backfillCrossrefGuests(store: EvidenceStore): Promise<void> {
  const candidates = await store.listGuestResearchCandidates(500);
  const filteredCandidates = guestFilter
    ? candidates.filter((guest) => guest.normalizedName === normalizePersonName(guestFilter))
    : candidates;
  const guests = filteredCandidates.slice(offset, offset + limit);
  if (guestFilter && guests.length === 0) {
    throw new Error(`No guest candidate matched --guest=${guestFilter}`);
  }
  console.log(`Crossref guest backfill: ${guests.length} guests`);

  for (let index = 0; index < guests.length; index += 1) {
    const guest = guests[index];
    const batch = await fetchGuestCrossrefEvidence({
      guests: [guest],
      from: new Date("1900-01-01T00:00:00.000Z"),
      to: new Date(),
      maxResultsPerGuest: crossrefRows,
      maxPagesPerGuest: crossrefMaxPages,
      contactEmail: process.env.CROSSREF_CONTACT_EMAIL ?? process.env.NCBI_CONTACT_EMAIL,
    });
    await persistBackfillBatch(store, batch, {});
    if ((batch.errors?.length ?? 0) === 0) {
      await store.markGuestResearchChecked([guest.normalizedName], new Date().toISOString());
    }
    console.log(
      `Crossref guest ${offset + index + 1}/${offset + guests.length}: ${guest.displayName}, ${batch.documents.length} records, ${batch.errors?.length ?? 0} errors`
    );
  }
}

async function backfillPubMedGuests(store: EvidenceStore): Promise<void> {
  const candidates = await store.listGuestResearchCandidates(500);
  const filteredCandidates = guestFilter
    ? candidates.filter((guest) => guest.normalizedName === normalizePersonName(guestFilter))
    : candidates;
  const guests = filteredCandidates.slice(offset, offset + limit);
  if (guestFilter && guests.length === 0) {
    throw new Error(`No guest candidate matched --guest=${guestFilter}`);
  }
  console.log(`PubMed guest backfill: ${guests.length} guests`);

  for (let index = 0; index < guests.length; index += 1) {
    const guest = guests[index];
    const batch = await fetchGuestPubMedEvidence({
      guests: [guest],
      from: new Date("1900-01-01T00:00:00.000Z"),
      to: new Date(),
      maxResultsPerGuest: crossrefRows,
      apiKey: process.env.NCBI_API_KEY,
      contactEmail: process.env.NCBI_CONTACT_EMAIL,
    });
    await persistBackfillBatch(store, batch, {});
    if ((batch.errors?.length ?? 0) === 0) {
      await store.markGuestResearchChecked([guest.normalizedName], new Date().toISOString());
    }
    console.log(
      `PubMed guest ${offset + index + 1}/${offset + guests.length}: ${guest.displayName}, ${batch.documents.length} records, ${batch.errors?.length ?? 0} errors`
    );
  }
}

async function persistBackfillBatch(
  store: EvidenceStore,
  batch: EvidenceBatch,
  cursor: { cursorStart?: string; cursorEnd?: string }
): Promise<PersistResult> {
  const runId = await store.startRun({
    sourceKey: batch.sourceKey,
    trigger: "backfill",
    cursorStart: cursor.cursorStart,
  });
  try {
    const result = await store.persistBatch(batch);
    const issues = batch.errors ?? [];
    const status = result.errors > 0 || issues.length > 0 ? "partial" : "succeeded";
    await store.finishRun({
      runId,
      sourceKey: batch.sourceKey,
      status,
      cursorEnd: cursor.cursorEnd ?? batch.cursor,
      result,
      error: issues.slice(0, 10).join("; ") || undefined,
      metadata: batch.metadata,
    });
    return result;
  } catch (error) {
    const result: PersistResult = {
      discovered: batch.documents.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
    };
    await store.finishRun({
      runId,
      sourceKey: batch.sourceKey,
      status: "failed",
      result,
      error: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error",
      metadata: batch.metadata,
    });
    throw error;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function addPersistResult(target: PersistResult, value: PersistResult): void {
  target.discovered += value.discovered;
  target.inserted += value.inserted;
  target.updated += value.updated;
  target.skipped += value.skipped;
  target.errors += value.errors;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
