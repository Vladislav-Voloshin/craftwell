import { fetchPubMedQueryEvidence } from "./pubmed";
import type { EvidenceBatch } from "./types";

export interface HubermanLabOptions {
  from: Date;
  to: Date;
  now?: Date;
  maxResults?: number;
  apiKey?: string;
  contactEmail?: string;
  fetchImpl?: typeof fetch;
}

export function buildHubermanLabPubMedQuery(): string {
  return '(Huberman AD[Author] AND (Stanford[Affiliation] OR "Huberman Laboratory"[Affiliation])) NOT (Editorial[Publication Type] OR Letter[Publication Type] OR News[Publication Type] OR Preprint[Publication Type])';
}

export async function fetchHubermanLabEvidence(
  options: HubermanLabOptions
): Promise<EvidenceBatch> {
  return fetchPubMedQueryEvidence({
    ...options,
    sourceKey: "huberman-stanford-lab",
    term: buildHubermanLabPubMedQuery(),
    relatedPerson: {
      displayName: "Andrew Huberman",
      normalizedName: "andrew huberman",
      credentials: ["PhD"],
      affiliations: ["Stanford University"],
      primaryUrl: "https://hubermanlab.stanford.edu",
      matchStatus: "candidate",
      confidence: 0.9,
      evidence:
        "Candidate result from a PubMed author and Stanford-affiliation query; review before approval",
    },
  });
}
