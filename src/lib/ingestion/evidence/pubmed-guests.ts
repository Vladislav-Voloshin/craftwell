import { fetchPubMedQueryEvidence } from "./pubmed";
import type { EvidenceBatch, GuestResearchCandidate } from "./types";

export interface GuestPubMedOptions {
  guests: GuestResearchCandidate[];
  from: Date;
  to: Date;
  now?: Date;
  maxResultsPerGuest?: number;
  apiKey?: string;
  contactEmail?: string;
  fetchImpl?: typeof fetch;
  requestDelayMs?: number;
}

export async function fetchGuestPubMedEvidence(
  options: GuestPubMedOptions
): Promise<EvidenceBatch> {
  const documents: EvidenceBatch["documents"] = [];
  const people: EvidenceBatch["people"] = [];
  const queriedGuests: string[] = [];

  for (const guest of options.guests) {
    const batch = await fetchPubMedQueryEvidence({
      sourceKey: "pubmed-guests",
      term: buildGuestAuthorQuery(guest.displayName),
      relatedPerson: guest,
      from: options.from,
      to: options.to,
      now: options.now,
      maxResults: options.maxResultsPerGuest ?? 5,
      apiKey: options.apiKey,
      contactEmail: options.contactEmail,
      fetchImpl: options.fetchImpl,
      requestDelayMs: options.requestDelayMs,
    });
    queriedGuests.push(guest.normalizedName);
    documents.push(...batch.documents);
    people.push(...batch.people);
  }

  return {
    sourceKey: "pubmed-guests",
    cursor: (options.now ?? options.to).toISOString(),
    documents,
    people,
    metadata: {
      queriedGuests,
      queryCount: queriedGuests.length,
      matchPolicy: "candidate_until_author_identity_is_reviewed",
      contentPolicy: "citation_metadata_only_no_abstract_or_article_text",
    },
  };
}

export function buildGuestAuthorQuery(displayName: string): string {
  const name = displayName
    .replace(/["\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const articleTypes = [
    "Journal Article[Publication Type]",
    "Clinical Trial[Publication Type]",
    "Randomized Controlled Trial[Publication Type]",
    "Meta-Analysis[Publication Type]",
    "Systematic Review[Publication Type]",
  ].join(" OR ");
  const excluded = [
    "Editorial[Publication Type]",
    "Letter[Publication Type]",
    "News[Publication Type]",
    "Preprint[Publication Type]",
  ].join(" OR ");
  return `("${name}"[Author] AND (${articleTypes})) NOT (${excluded})`;
}
