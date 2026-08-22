import { cleanHtml } from "../shared";
import { fetchEvidenceUrl } from "./fetch";
import { fingerprintSourceVersion } from "./policy";
import type { EvidenceBatch, EvidenceDocumentInput } from "./types";

export const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
export const OPEN_LIBRARY_API_POLICY_URL = "https://openlibrary.org/developers/api";

const SOURCE_KEY = "books-catalog";
const MAX_BATCH_SIZE = 50;
const MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_REQUEST_DELAY_MS = 1_100;

export interface BookCatalogReference {
  identityKey: string;
  canonicalUrl: string;
  title: string;
  metadata?: Record<string, unknown>;
}

export interface OpenLibraryBookOptions {
  references: BookCatalogReference[];
  now?: Date;
  contactEmail?: string;
  requestDelayMs?: number;
  fetchImpl?: typeof fetch;
}

interface OpenLibrarySearchResponse {
  docs?: OpenLibrarySearchDocument[];
}

interface OpenLibrarySearchDocument {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  publisher?: string[];
  edition_key?: string[];
  language?: string[];
}

interface EligibleBookReference {
  reference: BookCatalogReference;
  isbns: string[];
}

export async function fetchOpenLibraryBookEvidence(
  options: OpenLibraryBookOptions
): Promise<EvidenceBatch> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestDelayMs = Math.max(options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS, 0);
  const candidates = deduplicateReferences(options.references)
    .map(
      (reference): EligibleBookReference => ({
        reference,
        isbns: extractCandidateIsbns(reference),
      })
    )
    .filter((candidate) => candidate.isbns.length > 0);
  const requestedIsbns = unique(candidates.flatMap((candidate) => candidate.isbns));
  const documents = new Map<string, EvidenceDocumentInput>();
  const errors: string[] = [];
  let requestCount = 0;

  for (const isbnBatch of chunks(requestedIsbns, MAX_BATCH_SIZE)) {
    if (requestCount > 0) await delay(requestDelayMs);
    requestCount += 1;

    try {
      const response = await fetchEvidenceUrl(
        buildOpenLibrarySearchUrl(isbnBatch),
        {
          headers: {
            Accept: "application/json",
            "User-Agent": openLibraryUserAgent(options.contactEmail),
          },
        },
        fetchImpl,
        { timeoutMs: 20_000, retries: 2, baseDelayMs: 1_000 }
      );
      if (!response.ok) {
        throw new Error(`Open Library request failed with ${response.status}`);
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new Error("Open Library response exceeded the parser size limit");
      }
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) {
        throw new Error("Open Library response exceeded the parser size limit");
      }
      const payload = parseSearchResponse(body);

      for (const candidate of candidates) {
        if (!candidate.isbns.some((isbn) => isbnBatch.includes(isbn))) continue;
        const match = findMatchingDocument(payload.docs ?? [], candidate.isbns);
        if (!match) continue;
        const parsed = parseOpenLibraryDocument(match.document, candidate.reference, match.isbn);
        if (parsed) documents.set(candidate.reference.identityKey, parsed);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Open Library request failed");
    }
  }

  return {
    sourceKey: SOURCE_KEY,
    cursor: now.toISOString(),
    documents: Array.from(documents.values()),
    people: [],
    errors,
    metadata: {
      endpoint: OPEN_LIBRARY_SEARCH_URL,
      requestedReferences: candidates.length,
      requestedIsbns: requestedIsbns.length,
      matchedBooks: documents.size,
      requestCount,
      sourcePolicyUrl: OPEN_LIBRARY_API_POLICY_URL,
      contentPolicy: "bibliographic_metadata_only_no_description_or_book_text",
    },
  };
}

export function extractCandidateIsbns(reference: BookCatalogReference): string[] {
  const values: unknown[] = [];
  const amazonIdentifier = reference.identityKey.match(/^book:amazon:([^:]+)$/i)?.[1];
  if (amazonIdentifier) values.push(amazonIdentifier);

  for (const key of ["isbn", "isbns"]) {
    const value = reference.metadata?.[key];
    if (Array.isArray(value)) values.push(...value);
    else if (typeof value === "string") values.push(value);
  }

  return unique(
    values.flatMap((value) => {
      if (typeof value !== "string") return [];
      const isbn = normalizeIsbn(value);
      return isbn ? [isbn] : [];
    })
  );
}

export function normalizeIsbn(value: string): string | null {
  const compact = value.replace(/[-\s]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(compact) && isValidIsbn10(compact)) return compact;
  if (/^\d{13}$/.test(compact) && isValidIsbn13(compact)) return compact;
  return null;
}

export function buildOpenLibrarySearchUrl(isbns: string[]): string {
  const normalized = unique(
    isbns.map(normalizeIsbn).filter((isbn): isbn is string => Boolean(isbn))
  ).slice(0, MAX_BATCH_SIZE);
  const url = new URL(OPEN_LIBRARY_SEARCH_URL);
  url.searchParams.set("q", `isbn:(${normalized.join(" OR ")})`);
  url.searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,isbn,publisher,edition_key,language"
  );
  url.searchParams.set("limit", String(MAX_BATCH_SIZE));
  return url.toString();
}

function parseSearchResponse(body: string): OpenLibrarySearchResponse {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Open Library returned invalid JSON");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { docs?: unknown }).docs)
  ) {
    throw new Error("Open Library returned an invalid search response");
  }
  return payload as OpenLibrarySearchResponse;
}

function findMatchingDocument(
  documents: OpenLibrarySearchDocument[],
  candidateIsbns: string[]
): { document: OpenLibrarySearchDocument; isbn: string } | null {
  const candidateSet = new Set(candidateIsbns);
  for (const document of documents) {
    for (const value of document.isbn ?? []) {
      const isbn = normalizeIsbn(value);
      if (isbn && candidateSet.has(isbn)) return { document, isbn };
    }
  }
  return null;
}

function parseOpenLibraryDocument(
  document: OpenLibrarySearchDocument,
  reference: BookCatalogReference,
  matchedIsbn: string
): EvidenceDocumentInput | null {
  const workKey = normalizeWorkKey(document.key);
  if (!workKey) return null;
  const title = cleanHtml(document.title ?? "") || reference.title;
  if (!title) return null;
  const authors = unique((document.author_name ?? []).map(cleanHtml).filter(Boolean));
  const isbns = unique(
    (document.isbn ?? []).flatMap((value) => {
      const isbn = normalizeIsbn(value);
      return isbn ? [isbn] : [];
    })
  );
  const publishers = unique((document.publisher ?? []).map(cleanHtml).filter(Boolean)).slice(0, 20);
  const editionKeys = unique((document.edition_key ?? []).filter(isOpenLibraryEditionKey)).slice(
    0,
    20
  );
  const languages = unique((document.language ?? []).filter(isShortMetadataValue)).slice(0, 20);
  const firstPublishYear = validPublishYear(document.first_publish_year);
  const metadata = {
    openLibraryWorkKey: workKey,
    matchedIsbn,
    isbn: isbns,
    publishers,
    editionKeys,
    languages,
    catalogMatchMethod: "isbn",
    referencedTitle: reference.title,
    referencedUrl: reference.canonicalUrl,
    sourcePolicyUrl: OPEN_LIBRARY_API_POLICY_URL,
    contentPolicy: "bibliographic_metadata_only_no_description_or_book_text",
    sourceVersion: fingerprintSourceVersion({
      workKey,
      title,
      authors,
      firstPublishYear,
      isbns,
      publishers,
      editionKeys,
      languages,
    }),
  };

  return {
    identityKey: reference.identityKey,
    sourceKey: SOURCE_KEY,
    externalId: `openlibrary:${workKey.slice(1)}:${fingerprintSourceVersion(reference.identityKey).slice(0, 16)}`,
    documentType: "book",
    canonicalUrl: `https://openlibrary.org${workKey}`,
    title,
    publishedAt: firstPublishYear ? `${firstPublishYear}-01-01T00:00:00.000Z` : undefined,
    authors,
    rightsMode: "metadata_only",
    metadata,
  };
}

function normalizeWorkKey(value: string | undefined): string | null {
  if (!value) return null;
  const key = value.startsWith("/") ? value : `/works/${value}`;
  return /^\/works\/OL\d+W$/i.test(key) ? key : null;
}

function isOpenLibraryEditionKey(value: unknown): value is string {
  return typeof value === "string" && /^OL\d+M$/i.test(value);
}

function isShortMetadataValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 32;
}

function validPublishYear(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 1000 && Number(value) <= 3000
    ? Number(value)
    : null;
}

function isValidIsbn10(isbn: string): boolean {
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = isbn[index];
    const digit = character === "X" ? 10 : Number(character);
    if (!Number.isInteger(digit) || (character === "X" && index !== 9)) return false;
    sum += digit * (10 - index);
  }
  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string): boolean {
  let sum = 0;
  for (let index = 0; index < 13; index += 1) {
    const digit = Number(isbn[index]);
    if (!Number.isInteger(digit)) return false;
    sum += digit * (index % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

function openLibraryUserAgent(contactEmail: string | undefined): string {
  const contact = contactEmail?.trim();
  return contact
    ? `CraftwellBookMetadata/1.0 (${contact})`
    : "CraftwellBookMetadata/1.0 (+https://craftwell.vercel.app)";
}

function deduplicateReferences(references: BookCatalogReference[]): BookCatalogReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (!reference.identityKey || seen.has(reference.identityKey)) return false;
    seen.add(reference.identityKey);
    return true;
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
