/**
 * Backfill provenance-safe episode references and guest bibliographic metadata.
 *
 * Usage:
 *   npx tsx scripts/backfill-evidence-references.ts --source=all
 *   npx tsx scripts/backfill-evidence-references.ts --source=episodes --offset=0 --limit=50
 *   npx tsx scripts/backfill-evidence-references.ts --source=crossref --offset=0 --limit=25
 *   npx tsx scripts/backfill-evidence-references.ts --source=crossref --limit=1 --rows=5 --max-pages=1
 */
import { config } from "dotenv";

config({ path: ".env.local", override: true });

import { fetchGuestCrossrefEvidence } from "../src/lib/ingestion/evidence/crossref-guests";
import { fetchHubermanEpisodePageEvidence } from "../src/lib/ingestion/evidence/huberman-episode-pages";
import { fetchHubermanRssEvidence } from "../src/lib/ingestion/evidence/huberman-rss";
import { normalizePersonName } from "../src/lib/ingestion/evidence/policy";
import { createEvidenceStore } from "../src/lib/ingestion/evidence/store";
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
const episodeBatchSize = Math.min(Math.max(positiveInteger(args.get("batch-size"), 8), 1), 20);
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
  if (!["all", "episodes", "crossref"].includes(source)) {
    throw new Error("--source must be all, episodes, or crossref");
  }
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
      },
      {
        cursorStart: episodes.at(-1)?.publishedAt,
        cursorEnd: episodes[0]?.publishedAt,
      }
    );
  }

  for (let index = 0; index < episodes.length; index += episodeBatchSize) {
    const page = episodes.slice(index, index + episodeBatchSize);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
