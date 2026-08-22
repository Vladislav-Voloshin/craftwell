import { extractTopics } from "../shared";
import type {
  EvidenceBatch,
  EvidenceDocumentInput,
  GuestResearchCandidate,
  PersonMatchStatus,
} from "./types";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_DISCLAIMER_URL = "https://www.ncbi.nlm.nih.gov/home/about/policies/";

const HEALTH_TERMS = [
  "sleep",
  "circadian rhythm",
  "neuroplasticity",
  "exercise",
  "resistance training",
  "cardiorespiratory fitness",
  "stress",
  "anxiety",
  "depression",
  "meditation",
  "breathwork",
  "nutrition",
  "fasting",
  "creatine",
  "omega-3",
  "vitamin D",
  "magnesium",
  "caffeine",
  "cold exposure",
  "heat therapy",
  "sauna",
  "dopamine",
  "attention",
  "memory",
  "longevity",
] as const;

interface PubMedSearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface PubMedSummaryAuthor {
  name?: string;
}

interface PubMedArticleId {
  idtype?: string;
  value?: string;
}

interface PubMedSummaryRecord {
  uid?: string;
  title?: string;
  pubdate?: string;
  sortpubdate?: string;
  fulljournalname?: string;
  source?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  lang?: string[];
  authors?: PubMedSummaryAuthor[];
  articleids?: PubMedArticleId[];
  pubtype?: string[];
}

interface PubMedSummaryResponse {
  result?: {
    uids?: string[];
    [pmid: string]: PubMedSummaryRecord | string[] | undefined;
  };
}

export interface PubMedOptions {
  from: Date;
  to: Date;
  now?: Date;
  maxResults?: number;
  apiKey?: string;
  contactEmail?: string;
  fetchImpl?: typeof fetch;
  sourceKey?: string;
  term?: string;
  relatedPerson?: GuestResearchCandidate & {
    matchStatus?: PersonMatchStatus;
    confidence?: number;
    evidence?: string;
  };
  requestDelayMs?: number;
}

export async function fetchRecentPubMedEvidence(options: PubMedOptions): Promise<EvidenceBatch> {
  return fetchPubMedQueryEvidence({
    ...options,
    sourceKey: options.sourceKey ?? "pubmed-health",
    term: options.term ?? buildPeerReviewedHealthQuery(),
  });
}

export async function fetchPubMedQueryEvidence(options: PubMedOptions): Promise<EvidenceBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sourceKey = options.sourceKey ?? "pubmed-health";
  const maxResults = Math.min(Math.max(options.maxResults ?? 100, 1), 500);
  const searchUrl = buildPubMedSearchUrl({ ...options, maxResults });
  const searchResponse = await fetchJson<PubMedSearchResponse>(searchUrl, fetchImpl);
  await respectNcbiRateLimit(options, fetchImpl);
  const pmids = searchResponse.esearchresult?.idlist ?? [];

  if (pmids.length === 0) {
    return {
      sourceKey,
      cursor: (options.now ?? options.to).toISOString(),
      documents: [],
      people: [],
      metadata: buildBatchMetadata(options, 0),
    };
  }

  const parsed: Pick<EvidenceBatch, "documents" | "people"> = {
    documents: [],
    people: [],
  };
  for (const pmidBatch of batches(pmids, 100)) {
    const summaryUrl = buildPubMedSummaryUrl(pmidBatch, options);
    const summaryResponse = await fetchJson<PubMedSummaryResponse>(summaryUrl, fetchImpl);
    await respectNcbiRateLimit(options, fetchImpl);
    const page = parsePubMedSummaries(summaryResponse, {
      sourceKey,
      relatedPerson: options.relatedPerson,
    });
    parsed.documents.push(...page.documents);
    parsed.people.push(...page.people);
  }

  return {
    sourceKey,
    cursor: (options.now ?? options.to).toISOString(),
    documents: parsed.documents,
    people: parsed.people,
    metadata: buildBatchMetadata(options, pmids.length),
  };
}

export function buildPubMedSearchUrl(
  options: Pick<PubMedOptions, "from" | "to" | "maxResults" | "apiKey" | "contactEmail" | "term">
): string {
  const url = new URL(`${EUTILS_BASE}/esearch.fcgi`);
  url.search = buildCommonParams(options).toString();
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(options.maxResults ?? 100));
  url.searchParams.set("sort", "pub date");
  url.searchParams.set("datetype", "edat");
  url.searchParams.set("mindate", formatNcbiDate(options.from));
  url.searchParams.set("maxdate", formatNcbiDate(options.to));
  url.searchParams.set("term", options.term ?? buildPeerReviewedHealthQuery());
  return url.toString();
}

export function buildPeerReviewedHealthQuery(): string {
  const healthTerms = HEALTH_TERMS.map((term) => `"${term}"[Title/Abstract]`).join(" OR ");
  const includedTypes = [
    "Journal Article[Publication Type]",
    "Randomized Controlled Trial[Publication Type]",
    "Clinical Trial[Publication Type]",
    "Meta-Analysis[Publication Type]",
    "Systematic Review[Publication Type]",
  ].join(" OR ");
  const excludedTypes = [
    "Editorial[Publication Type]",
    "Letter[Publication Type]",
    "News[Publication Type]",
    "Preprint[Publication Type]",
  ].join(" OR ");
  return `((${healthTerms}) AND (${includedTypes})) NOT (${excludedTypes})`;
}

export function parsePubMedSummaries(
  response: PubMedSummaryResponse,
  options: Pick<PubMedOptions, "sourceKey" | "relatedPerson"> = {}
): Pick<EvidenceBatch, "documents" | "people"> {
  const result = response.result;
  if (!result) return { documents: [], people: [] };

  const documents: EvidenceDocumentInput[] = [];
  const people: EvidenceBatch["people"] = [];
  const sourceKey = options.sourceKey ?? "pubmed-health";
  for (const pmid of result.uids ?? []) {
    const raw = result[pmid];
    if (!raw || Array.isArray(raw)) continue;

    const title = normalizeCitationText(raw.title ?? "");
    if (!title) continue;

    const authors = (raw.authors ?? [])
      .map((author) => normalizeCitationText(author.name ?? ""))
      .filter(Boolean);
    const doi = findArticleId(raw.articleids, "doi");
    const publicationTypes = (raw.pubtype ?? []).map(normalizeCitationText);
    const evidenceLevel = classifyEvidenceLevel(publicationTypes);
    const publishedAt = parsePubMedDate(raw.sortpubdate ?? raw.pubdate);
    const journal = normalizeCitationText(raw.fulljournalname ?? raw.source ?? "");

    documents.push({
      identityKey: `pubmed:${pmid}`,
      sourceKey,
      externalId: pmid,
      documentType: "study",
      canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      title,
      publishedAt,
      authors,
      topics: extractTopics(title, publicationTypes.join(" ")),
      pmid,
      doi,
      language: raw.lang?.[0] ?? "eng",
      rightsMode: "metadata_only",
      metadata: {
        journal,
        publicationTypes,
        evidenceLevel,
        citation: {
          volume: raw.volume || null,
          issue: raw.issue || null,
          pages: raw.pages || null,
        },
        sourceDisclaimerUrl: NCBI_DISCLAIMER_URL,
        contentPolicy: "citation_metadata_only_no_abstract_or_article_text",
        relatedPersonCandidate: options.relatedPerson?.displayName ?? null,
      },
    });

    if (options.relatedPerson) {
      people.push({
        documentSourceKey: sourceKey,
        documentExternalId: pmid,
        displayName: options.relatedPerson.displayName,
        normalizedName: options.relatedPerson.normalizedName,
        credentials: options.relatedPerson.credentials,
        affiliations: options.relatedPerson.affiliations,
        primaryUrl: options.relatedPerson.primaryUrl,
        role: "author",
        matchStatus: options.relatedPerson.matchStatus ?? "candidate",
        confidence: options.relatedPerson.confidence ?? 0.55,
        evidence:
          options.relatedPerson.evidence ??
          "Candidate result from an exact-name PubMed author query; identity requires review",
        metadata: {
          authorQueryCandidate: true,
          candidateAffiliations: options.relatedPerson.affiliations,
          candidatePrimaryUrl: options.relatedPerson.primaryUrl ?? null,
        },
      });
    }
  }

  return { documents, people };
}

function buildPubMedSummaryUrl(
  pmids: string[],
  options: Pick<PubMedOptions, "apiKey" | "contactEmail">
): string {
  const url = new URL(`${EUTILS_BASE}/esummary.fcgi`);
  url.search = buildCommonParams(options).toString();
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("id", pmids.join(","));
  return url.toString();
}

function buildCommonParams(
  options: Pick<PubMedOptions, "apiKey" | "contactEmail">
): URLSearchParams {
  const params = new URLSearchParams({ tool: "craftwell" });
  if (options.contactEmail) params.set("email", options.contactEmail);
  if (options.apiKey) params.set("api_key", options.apiKey);
  return params;
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`PubMed request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function buildBatchMetadata(
  options: Pick<PubMedOptions, "from" | "to" | "term" | "relatedPerson">,
  matched: number
): Record<string, unknown> {
  return {
    from: options.from.toISOString(),
    to: options.to.toISOString(),
    matched,
    sourceDisclaimerUrl: NCBI_DISCLAIMER_URL,
    contentPolicy: "citation_metadata_only_no_abstract_or_article_text",
    query: options.term ?? buildPeerReviewedHealthQuery(),
    relatedPersonCandidate: options.relatedPerson?.displayName ?? null,
  };
}

function findArticleId(
  articleIds: PubMedArticleId[] | undefined,
  type: string
): string | undefined {
  return articleIds?.find((articleId) => articleId.idtype?.toLowerCase() === type)?.value?.trim();
}

function classifyEvidenceLevel(publicationTypes: string[]): string {
  const combined = publicationTypes.join(" ").toLowerCase();
  if (combined.includes("meta-analysis")) return "meta_analysis";
  if (combined.includes("systematic review")) return "systematic_review";
  if (combined.includes("randomized controlled trial")) {
    return "randomized_trial";
  }
  if (combined.includes("clinical trial")) return "controlled_trial";
  return "unknown";
}

function parsePubMedDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\//g, "-").replace(/^([A-Za-z]{3})\s+(\d{4})$/, "$2-$1-01");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeCitationText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNcbiDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function batches<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function respectNcbiRateLimit(
  options: Pick<PubMedOptions, "apiKey" | "requestDelayMs">,
  fetchImpl: typeof fetch
): Promise<void> {
  const delayMs =
    options.requestDelayMs ?? (fetchImpl === fetch ? (options.apiKey ? 110 : 350) : 0);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
