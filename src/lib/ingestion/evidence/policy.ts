import { createHash } from "node:crypto";
import { cleanHtml } from "../shared";
import type { EvidenceDocumentInput, PersonMentionInput, PersonRole } from "./types";

export const MAX_SOURCE_EXCERPT_LENGTH = 500;

const FORBIDDEN_METADATA_KEYS = new Set([
  "abstract",
  "abstracttext",
  "articlebody",
  "audio",
  "booktext",
  "captions",
  "description",
  "fulltext",
  "html",
  "markdown",
  "pagebody",
  "rawcontent",
  "rawtext",
  "summary",
  "transcript",
]);

const CREDENTIAL_PATTERN = /\b(Ph\.?D\.?|M\.?D\.?|MD|DO|Psy\.?D\.?|MPH|MS|MSc|MA|RN|RD|RDN)\b/gi;

export function createSourceExcerpt(value: string): string | undefined {
  const clean = cleanHtml(value);
  if (!clean) return undefined;
  if (clean.length <= MAX_SOURCE_EXCERPT_LENGTH) return clean;

  const candidate = clean.slice(0, MAX_SOURCE_EXCERPT_LENGTH - 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const shortened = lastSpace >= 350 ? candidate.slice(0, lastSpace) : candidate;
  return `${shortened.trimEnd()}…`;
}

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(?:dr|prof|professor)\.?\s+/i, "")
    .replace(CREDENTIAL_PATTERN, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function parsePersonLabel(
  value: string,
  role: PersonRole,
  options: {
    matchStatus?: PersonMentionInput["matchStatus"];
    confidence?: number;
    evidence?: string;
  } = {}
): Omit<PersonMentionInput, "documentSourceKey" | "documentExternalId"> | null {
  const cleaned = cleanHtml(value)
    .replace(/^with\s+/i, "")
    .replace(/^(?:dr|prof|professor)\.?\s+/i, "")
    .trim();
  const credentials = Array.from(
    new Set(cleaned.match(CREDENTIAL_PATTERN)?.map(normalizeCredential) ?? [])
  );
  const displayName = cleaned
    .replace(/,?\s*\b(?:Ph\.?D\.?|M\.?D\.?|MD|DO|Psy\.?D\.?|MPH|MS|MSc|MA|RN|RD|RDN)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[|:;,\s]+$/g, "")
    .trim();
  const normalizedName = normalizePersonName(displayName);

  if (!displayName || normalizedName.split(" ").length < 2) return null;
  if (/^(huberman lab|solo episode|essentials)$/i.test(displayName)) return null;

  return {
    displayName,
    normalizedName,
    credentials,
    affiliations: [],
    role,
    matchStatus: options.matchStatus ?? "extracted",
    confidence: options.confidence ?? 0.8,
    evidence: options.evidence,
  };
}

export function fingerprintDocument(document: EvidenceDocumentInput): string {
  return createHash("sha256")
    .update(
      stableSerialize({
        identityKey: document.identityKey,
        documentType: document.documentType,
        canonicalUrl: document.canonicalUrl,
        title: document.title,
        publishedAt: document.publishedAt ?? null,
        sourceExcerpt: document.sourceExcerpt ?? null,
        derivedSummary: document.derivedSummary ?? null,
        authors: document.authors ?? [],
        guests: document.guests ?? [],
        topics: document.topics ?? [],
        pmid: document.pmid ?? null,
        doi: document.doi?.toLowerCase() ?? null,
        language: document.language ?? "en",
        rightsMode: document.rightsMode,
        sourceVersion: document.metadata?.sourceVersion ?? null,
      })
    )
    .digest("hex");
}

export function fingerprintClaim(input: {
  documentIdentityKey: string;
  claimType: string;
  claimText: string;
  structuredData?: Record<string, unknown>;
}): string {
  return createHash("sha256").update(stableSerialize(input)).digest("hex");
}

export function fingerprintSourceVersion(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function validateEvidenceDocument(document: EvidenceDocumentInput): EvidenceDocumentInput {
  if (!document.identityKey || !document.sourceKey || !document.externalId || !document.title) {
    throw new Error("Evidence documents require identityKey, sourceKey, externalId, and title");
  }
  if (!isHttpUrl(document.canonicalUrl)) {
    throw new Error(`Invalid evidence URL: ${document.canonicalUrl}`);
  }
  if (document.sourceExcerpt && document.sourceExcerpt.length > MAX_SOURCE_EXCERPT_LENGTH) {
    throw new Error(`Source excerpts must be ${MAX_SOURCE_EXCERPT_LENGTH} characters or fewer`);
  }
  assertMetadataDoesNotContainRawContent(document.metadata ?? {});

  return {
    ...document,
    authors: uniqueStrings(document.authors ?? []),
    guests: uniqueStrings(document.guests ?? []),
    topics: uniqueStrings(document.topics ?? []),
    doi: document.doi?.trim().toLowerCase() || undefined,
    language: document.language ?? "en",
    contentFingerprint: document.contentFingerprint ?? fingerprintDocument(document),
    metadata: document.metadata ?? {},
  };
}

export function assertMetadataDoesNotContainRawContent(value: unknown, path = "metadata"): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertMetadataDoesNotContainRawContent(item, `${path}[${index}]`)
    );
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) {
      throw new Error(`Raw third-party content is not allowed at ${path}.${key}`);
    }
    assertMetadataDoesNotContainRawContent(child, `${path}.${key}`);
  }
}

function normalizeCredential(value: string): string {
  const compact = value.replace(/\./g, "").toUpperCase();
  if (compact === "PHD") return "PhD";
  if (compact === "PSYD") return "PsyD";
  if (compact === "MSC") return "MSc";
  return compact;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
