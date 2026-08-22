import { extractTopics } from "../shared";
import { fetchEvidenceUrl } from "./fetch";
import { fingerprintSourceVersion, normalizePersonName } from "./policy";
import type {
  EvidenceBatch,
  EvidenceDocumentInput,
  GuestResearchCandidate,
  PersonMentionInput,
  PersonSourceInput,
} from "./types";

const CROSSREF_WORKS_URL = "https://api.crossref.org/works";
const CROSSREF_POLICY_URL = "https://www.crossref.org/documentation/retrieve-metadata/rest-api/";
const SOURCE_KEY = "crossref-guests";
const CROSSREF_SELECT = [
  "DOI",
  "title",
  "author",
  "published-online",
  "published-print",
  "created",
  "type",
  "container-title",
  "URL",
  "subject",
  "license",
  "is-referenced-by-count",
  "ISBN",
  "publisher",
].join(",");

interface CrossrefDateParts {
  "date-parts"?: number[][];
  "date-time"?: string;
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
  ORCID?: string;
  "authenticated-orcid"?: boolean;
  affiliation?: Array<{ name?: string }>;
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  "published-online"?: CrossrefDateParts;
  "published-print"?: CrossrefDateParts;
  created?: CrossrefDateParts;
  type?: string;
  "container-title"?: string[];
  URL?: string;
  subject?: string[];
  license?: Array<{ URL?: string; "content-version"?: string }>;
  "is-referenced-by-count"?: number;
  ISBN?: string[];
  publisher?: string;
}

interface CrossrefResponse {
  message?: {
    items?: CrossrefWork[];
    "next-cursor"?: string;
    "total-results"?: number;
  };
}

export interface CrossrefGuestOptions {
  guests: GuestResearchCandidate[];
  from: Date;
  to: Date;
  now?: Date;
  maxResultsPerGuest?: number;
  maxPagesPerGuest?: number;
  contactEmail?: string;
  requestDelayMs?: number;
  fetchImpl?: typeof fetch;
}

interface ParsedCrossrefWork {
  document: EvidenceDocumentInput;
  person: PersonMentionInput;
  personSources: PersonSourceInput[];
}

export async function fetchGuestCrossrefEvidence(
  options: CrossrefGuestOptions
): Promise<EvidenceBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const rows = Math.min(Math.max(options.maxResultsPerGuest ?? 20, 1), 100);
  const maxPages = Math.min(Math.max(options.maxPagesPerGuest ?? 1, 1), 25);
  const requestDelayMs = Math.max(options.requestDelayMs ?? 1_100, 0);
  const documents: EvidenceDocumentInput[] = [];
  const people: PersonMentionInput[] = [];
  const personSources: PersonSourceInput[] = [];
  const errors: string[] = [];
  const guestStats: Array<Record<string, unknown>> = [];

  for (const guest of options.guests) {
    let cursor = "*";
    let pages = 0;
    let reported = 0;
    let exactMatches = 0;
    try {
      while (pages < maxPages && cursor) {
        const url = buildCrossrefGuestUrl({
          guest: guest.displayName,
          from: options.from,
          to: options.to,
          rows,
          cursor,
          contactEmail: options.contactEmail,
        });
        const response = await fetchEvidenceUrl(
          url,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
            },
          },
          fetchImpl,
          { timeoutMs: 25_000, retries: 2, baseDelayMs: 1_000, maxDelayMs: 10_000 }
        );
        if (!response.ok) throw new Error(`Crossref request failed with ${response.status}`);
        const payload = (await response.json()) as CrossrefResponse;
        const message = payload.message;
        reported = message?.["total-results"] ?? reported;
        const parsed = (message?.items ?? []).flatMap((work) => {
          const item = parseCrossrefWork(work, guest);
          return item ? [item] : [];
        });
        exactMatches += parsed.length;
        documents.push(...parsed.map((item) => item.document));
        people.push(...parsed.map((item) => item.person));
        personSources.push(...parsed.flatMap((item) => item.personSources));
        pages += 1;
        const nextCursor = message?.["next-cursor"];
        cursor = nextCursor && (message?.items?.length ?? 0) > 0 ? nextCursor : "";
        if (cursor && pages < maxPages && requestDelayMs > 0) await delay(requestDelayMs);
      }
      guestStats.push({
        guest: guest.displayName,
        pages,
        reported,
        exactMatches,
        truncated: Boolean(cursor && pages >= maxPages),
      });
    } catch (error) {
      errors.push(`${guest.displayName}: ${toErrorMessage(error)}`);
    }
    if (requestDelayMs > 0) await delay(requestDelayMs);
  }

  const dedupedDocuments = Array.from(
    new Map(documents.map((document) => [document.identityKey, document])).values()
  );
  return {
    sourceKey: SOURCE_KEY,
    cursor: (options.now ?? options.to).toISOString(),
    documents: dedupedDocuments,
    people,
    personSources,
    errors,
    metadata: {
      guests: guestStats,
      guestCount: options.guests.length,
      failedGuests: errors.length,
      sourcePolicyUrl: CROSSREF_POLICY_URL,
      matchPolicy: "exact_or_initial_author_name_candidate_until_identity_review",
      contentPolicy: "bibliographic_metadata_only_no_abstract_or_full_text",
    },
  };
}

export function buildCrossrefGuestUrl(input: {
  guest: string;
  from: Date;
  to: Date;
  rows: number;
  cursor?: string;
  contactEmail?: string;
}): string {
  const url = new URL(CROSSREF_WORKS_URL);
  url.searchParams.set("query.author", input.guest);
  url.searchParams.set(
    "filter",
    `from-pub-date:${formatDate(input.from)},until-pub-date:${formatDate(input.to)}`
  );
  url.searchParams.set("rows", String(Math.min(Math.max(input.rows, 1), 100)));
  url.searchParams.set("cursor", input.cursor ?? "*");
  url.searchParams.set("select", CROSSREF_SELECT);
  if (input.contactEmail) url.searchParams.set("mailto", input.contactEmail);
  return url.toString();
}

export function parseCrossrefWork(
  work: CrossrefWork,
  guest: GuestResearchCandidate
): ParsedCrossrefWork | null {
  const doi = work.DOI?.trim().toLowerCase();
  const title = cleanCitationText(work.title?.[0] ?? "");
  if (!doi || !title) return null;
  const matchingAuthor = findGuestAuthor(work.author ?? [], guest.normalizedName);
  if (!matchingAuthor) return null;
  const authors = (work.author ?? [])
    .map((author) => cleanCitationText(`${author.given ?? ""} ${author.family ?? ""}`))
    .filter(Boolean);
  const affiliations = (matchingAuthor.author.affiliation ?? [])
    .map((affiliation) => cleanCitationText(affiliation.name ?? ""))
    .filter(Boolean);
  const orcid = normalizeOrcid(matchingAuthor.author.ORCID);
  const crossrefType = work.type ?? "unknown";
  const documentType = classifyDocumentType(crossrefType);
  const publishedAt = parseCrossrefDate(
    work["published-online"] ?? work["published-print"] ?? work.created
  );
  const sourceExternalId = `doi:${doi}`;
  const metadata: Record<string, unknown> = {
    crossrefType,
    publisher: cleanCitationText(work.publisher ?? ""),
    containerTitle: cleanCitationText(work["container-title"]?.[0] ?? ""),
    isbn: work.ISBN ?? [],
    licenseUrls: (work.license ?? []).flatMap((license) =>
      license.URL ? [{ url: license.URL, contentVersion: license["content-version"] ?? null }] : []
    ),
    citationCount: work["is-referenced-by-count"] ?? 0,
    relatedPersonCandidate: guest.displayName,
    authorMatchMethod: matchingAuthor.method,
    peerReviewStatus: "not_asserted_by_crossref",
    sourceVersion: fingerprintSourceVersion({
      title,
      publishedAt,
      authors,
      crossrefType,
      publisher: work.publisher ?? null,
      containerTitle: work["container-title"]?.[0] ?? null,
      licenseUrls: (work.license ?? []).map((license) => license.URL ?? null),
      citationCount: work["is-referenced-by-count"] ?? 0,
    }),
    sourcePolicyUrl: CROSSREF_POLICY_URL,
    contentPolicy: "bibliographic_metadata_only_no_abstract_or_full_text",
  };
  const document: EvidenceDocumentInput = {
    identityKey: `doi:${doi}`,
    sourceKey: SOURCE_KEY,
    externalId: sourceExternalId,
    documentType,
    canonicalUrl: `https://doi.org/${doi}`,
    title,
    publishedAt,
    authors,
    topics: Array.from(
      new Set([
        ...(work.subject ?? []).map(cleanCitationText).filter(Boolean),
        ...extractTopics(title, (work.subject ?? []).join(" ")),
      ])
    ),
    doi,
    rightsMode: "metadata_only",
    metadata,
  };
  const person: PersonMentionInput = {
    documentSourceKey: SOURCE_KEY,
    documentExternalId: sourceExternalId,
    displayName: guest.displayName,
    normalizedName: guest.normalizedName,
    credentials: guest.credentials,
    affiliations: guest.affiliations,
    primaryUrl: guest.primaryUrl,
    role: "author",
    matchStatus: "candidate",
    confidence: matchingAuthor.method === "exact_full_name" ? 0.72 : 0.48,
    evidence: `Candidate Crossref author match using ${matchingAuthor.method}; identity requires review`,
    metadata: {
      crossrefMatchedName: matchingAuthor.displayName,
      crossrefAffiliations: affiliations,
      orcid: orcid ?? null,
      authenticatedOrcid: matchingAuthor.author["authenticated-orcid"] ?? false,
    },
  };
  const sources: PersonSourceInput[] = [];
  if (orcid) {
    sources.push({
      normalizedName: guest.normalizedName,
      sourceKind: "publication_profile",
      url: orcid,
      title: `${guest.displayName} ORCID candidate`,
      verified: false,
      metadata: {
        discoveredVia: SOURCE_KEY,
        authenticatedByDepositor: matchingAuthor.author["authenticated-orcid"] ?? false,
        relationshipStatus: "candidate",
      },
    });
  }
  if (documentType === "book") {
    sources.push({
      normalizedName: guest.normalizedName,
      sourceKind: "book",
      url: document.canonicalUrl,
      title,
      verified: false,
      metadata: { discoveredVia: SOURCE_KEY, relationshipStatus: "candidate" },
    });
  }
  return { document, person, personSources: sources };
}

function findGuestAuthor(
  authors: CrossrefAuthor[],
  normalizedGuestName: string
): { author: CrossrefAuthor; displayName: string; method: string } | undefined {
  const guestParts = normalizedGuestName.split(" ").filter(Boolean);
  const guestFamily = guestParts.at(-1);
  const guestInitial = guestParts[0]?.[0];
  for (const author of authors) {
    const displayName = cleanCitationText(`${author.given ?? ""} ${author.family ?? ""}`);
    const normalized = normalizePersonName(displayName);
    if (normalized === normalizedGuestName) {
      return { author, displayName, method: "exact_full_name" };
    }
    const parts = normalized.split(" ").filter(Boolean);
    if (
      guestFamily &&
      guestInitial &&
      parts.at(-1) === guestFamily &&
      parts[0]?.[0] === guestInitial &&
      parts.length >= 2
    ) {
      return { author, displayName, method: "initial_and_family_name" };
    }
  }
  return undefined;
}

function classifyDocumentType(type: string): EvidenceDocumentInput["documentType"] {
  if (
    /^(?:book|book-chapter|book-part|book-section|edited-book|monograph|reference-book)$/i.test(
      type
    )
  ) {
    return "book";
  }
  return "publication";
}

function parseCrossrefDate(value: CrossrefDateParts | undefined): string | undefined {
  const parts = value?.["date-parts"]?.[0];
  if (parts?.[0]) {
    const date = new Date(Date.UTC(parts[0], Math.max((parts[1] ?? 1) - 1, 0), parts[2] ?? 1));
    return date.toISOString();
  }
  if (value?.["date-time"]) {
    const date = new Date(value["date-time"]);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function normalizeOrcid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\d{4}-\d{4}-\d{4}-[\dX]{4}/i)?.[0]?.toUpperCase();
  return match ? `https://orcid.org/${match}` : undefined;
}

function cleanCitationText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}
