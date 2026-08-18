import logger from "@/lib/logger";
import { fetchHubermanRssEvidence } from "./huberman-rss";
import { fetchRecentPubMedEvidence } from "./pubmed";
import { fetchGuestPubMedEvidence } from "./pubmed-guests";
import { fetchHubermanLabEvidence } from "./huberman-lab";
import { fetchHubermanSiteEvidence } from "./huberman-site";
import { createEvidenceStore } from "./store";
import type {
  EvidenceBatch,
  EvidenceStore,
  GuestResearchCandidate,
  IngestionTrigger,
  PersistResult,
  SourceRunResult,
  WeeklyIngestionResult,
} from "./types";

export type WeeklySourceKey =
  | "huberman-rss"
  | "huberman-site"
  | "pubmed-health"
  | "pubmed-guests"
  | "huberman-stanford-lab";

export interface WeeklyIngestionOptions {
  trigger?: IngestionTrigger;
  requestId?: string;
  now?: Date;
  lookbackDays?: number;
  hubermanPublishedSince?: Date;
  pubmedFrom?: Date;
  pubmedMaxResults?: number;
  guestCandidateLimit?: number;
  guestResultsPerCandidate?: number;
  includeRecentGuests?: boolean;
  sourceKeys?: WeeklySourceKey[];
  fetchImpl?: typeof fetch;
  store?: EvidenceStore;
}

export async function runWeeklyEvidenceIngestion(
  options: WeeklyIngestionOptions = {}
): Promise<WeeklyIngestionResult> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const lookbackDays = options.lookbackDays ?? 14;
  const defaultFrom = subtractUtcDays(now, lookbackDays);
  const store = options.store ?? createEvidenceStore();
  const fetchImpl = options.fetchImpl ?? fetch;
  const trigger = options.trigger ?? "cron";
  const sourceKeys = options.sourceKeys ?? [
    "huberman-rss",
    "huberman-site",
    "pubmed-health",
    "huberman-stanford-lab",
    "pubmed-guests",
  ];
  let hubermanBatchPromise: Promise<EvidenceBatch> | undefined;
  let selectedGuestCandidates: GuestResearchCandidate[] = [];

  const getHubermanBatch = () => {
    hubermanBatchPromise ??= fetchHubermanRssEvidence({
      publishedSince: options.hubermanPublishedSince ?? defaultFrom,
      now,
      fetchImpl,
    });
    return hubermanBatchPromise;
  };

  const getGuestCandidates = async (): Promise<GuestResearchCandidate[]> => {
    const recentGuests =
      options.includeRecentGuests === false
        ? []
        : await getHubermanBatch()
            .then((batch) =>
              batch.people
                .filter((person) => person.role === "guest")
                .map((person) => ({
                  displayName: person.displayName,
                  normalizedName: person.normalizedName,
                  credentials: person.credentials,
                  affiliations: person.affiliations,
                  primaryUrl: person.primaryUrl,
                }))
            )
            .catch((error) => {
              logger.warn(
                { err: error },
                "Using the stored guest queue because the current RSS feed was unavailable"
              );
              return [];
            });
    const queuedGuests = await store.listGuestResearchCandidates(options.guestCandidateLimit ?? 5);
    selectedGuestCandidates = deduplicateGuests([...recentGuests, ...queuedGuests]).slice(
      0,
      options.guestCandidateLimit ?? 5
    );
    return selectedGuestCandidates;
  };

  const collectors: Record<WeeklySourceKey, () => Promise<EvidenceBatch>> = {
    "huberman-rss": getHubermanBatch,
    "huberman-site": () => fetchHubermanSiteEvidence({ now, fetchImpl }),
    "pubmed-health": () =>
      fetchRecentPubMedEvidence({
        from: options.pubmedFrom ?? defaultFrom,
        to: now,
        now,
        maxResults: options.pubmedMaxResults ?? 100,
        apiKey: process.env.NCBI_API_KEY,
        contactEmail: process.env.NCBI_CONTACT_EMAIL,
        fetchImpl,
      }),
    "huberman-stanford-lab": () =>
      fetchHubermanLabEvidence({
        from: options.pubmedFrom ?? defaultFrom,
        to: now,
        now,
        maxResults: options.pubmedMaxResults ?? 25,
        apiKey: process.env.NCBI_API_KEY,
        contactEmail: process.env.NCBI_CONTACT_EMAIL,
        fetchImpl,
      }),
    "pubmed-guests": async () =>
      fetchGuestPubMedEvidence({
        guests: await getGuestCandidates(),
        from: options.pubmedFrom ?? defaultFrom,
        to: now,
        now,
        maxResultsPerGuest: options.guestResultsPerCandidate ?? 5,
        apiKey: process.env.NCBI_API_KEY,
        contactEmail: process.env.NCBI_CONTACT_EMAIL,
        fetchImpl,
      }),
  };

  const sources: SourceRunResult[] = [];
  // PubMed asks unkeyed clients to stay under three requests per second.
  // Serial source execution plus adapter-level pacing keeps the entire job,
  // including guest queries, inside that shared budget.
  for (const sourceKey of sourceKeys) {
    sources.push(
      await runSource({
        sourceKey,
        trigger,
        requestId: options.requestId,
        cursorStart: defaultFrom.toISOString(),
        collect: collectors[sourceKey],
        store,
      })
    );
  }

  const succeeded = sources.filter((source) => source.status === "succeeded");
  const guestResult = sources.find((source) => source.sourceKey === "pubmed-guests");
  if (guestResult?.status === "succeeded" && selectedGuestCandidates.length > 0) {
    try {
      await store.markGuestResearchChecked(
        selectedGuestCandidates.map((guest) => guest.normalizedName),
        now.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, "Unable to checkpoint the guest research queue");
    }
  }
  const status =
    succeeded.length === sources.length ? "succeeded" : succeeded.length > 0 ? "partial" : "failed";

  return {
    ok: status === "succeeded",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    sources,
  };
}

async function runSource(input: {
  sourceKey: WeeklySourceKey;
  trigger: IngestionTrigger;
  requestId?: string;
  cursorStart: string;
  collect: () => Promise<EvidenceBatch>;
  store: EvidenceStore;
}): Promise<SourceRunResult> {
  const emptyResult: PersistResult = {
    discovered: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  let runId: string | undefined;

  try {
    runId = await input.store.startRun({
      sourceKey: input.sourceKey,
      trigger: input.trigger,
      requestId: input.requestId,
      cursorStart: input.cursorStart,
    });
    const batch = await input.collect();
    const result = await input.store.persistBatch(batch);
    await input.store.finishRun({
      runId,
      sourceKey: input.sourceKey,
      status: "succeeded",
      cursorEnd: batch.cursor,
      result,
      metadata: batch.metadata,
    });
    logger.info(
      { sourceKey: input.sourceKey, runId, ...result },
      "Evidence ingestion source completed"
    );
    return {
      sourceKey: input.sourceKey,
      status: "succeeded",
      runId,
      cursor: batch.cursor,
      ...result,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    const failedResult = { ...emptyResult, errors: 1 };
    logger.error(
      { err: error, sourceKey: input.sourceKey, runId },
      "Evidence ingestion source failed"
    );

    if (runId) {
      try {
        await input.store.finishRun({
          runId,
          sourceKey: input.sourceKey,
          status: "failed",
          result: failedResult,
          error: message,
        });
      } catch (finishError) {
        logger.error(
          { err: finishError, sourceKey: input.sourceKey, runId },
          "Unable to record failed evidence ingestion run"
        );
      }
    }

    return {
      sourceKey: input.sourceKey,
      status: "failed",
      runId,
      error: message,
      ...failedResult,
    };
  }
}

function subtractUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error";
}

function deduplicateGuests(guests: GuestResearchCandidate[]): GuestResearchCandidate[] {
  const byName = new Map<string, GuestResearchCandidate>();
  for (const guest of guests) {
    if (!byName.has(guest.normalizedName)) {
      byName.set(guest.normalizedName, guest);
    }
  }
  return Array.from(byName.values());
}
