import { extractTopics } from "../shared";
import { fetchEvidenceUrl } from "./fetch";
import { createSourceExcerpt, fingerprintSourceVersion } from "./policy";
import type { EvidenceBatch, EvidenceDocumentInput } from "./types";

export const HUBERMAN_SITEMAP_URL = "https://www.hubermanlab.com/sitemap.xml";
const MAX_PAGE_METADATA_REQUESTS = 500;
const MAX_SITEMAP_BYTES = 2_000_000;
const MAX_PAGE_BYTES = 1_000_000;

const INCLUDED_SECTIONS = new Set([
  "newsletter",
  "topics",
  "subtopics",
  "annual-letter",
  "daily-blueprint",
  "nsdr",
  "protocols-book",
]);

export async function fetchHubermanSiteEvidence(
  options: {
    now?: Date;
    fetchImpl?: typeof fetch;
    enrichPageMetadata?: boolean;
    concurrency?: number;
  } = {}
): Promise<EvidenceBatch> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchEvidenceUrl(
    HUBERMAN_SITEMAP_URL,
    {
      headers: {
        Accept: "application/xml, text/xml;q=0.9",
        "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
      },
    },
    fetchImpl,
    { timeoutMs: 20_000, retries: 2 }
  );
  if (!response.ok) {
    throw new Error(`Huberman sitemap request failed with ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SITEMAP_BYTES) {
    throw new Error("Huberman sitemap exceeded the parser size limit");
  }
  const sitemap = await response.text();
  if (sitemap.length > MAX_SITEMAP_BYTES) {
    throw new Error("Huberman sitemap exceeded the parser size limit");
  }
  const sitemapDocuments = parseHubermanSitemap(sitemap);
  const errors: string[] = [];
  const enrichPageMetadata = options.enrichPageMetadata !== false;
  const documents = !enrichPageMetadata
    ? sitemapDocuments
    : await enrichHubermanPages(sitemapDocuments, fetchImpl, options.concurrency ?? 4, errors);
  const pageMetadataRequested = enrichPageMetadata
    ? Math.min(sitemapDocuments.length, MAX_PAGE_METADATA_REQUESTS)
    : 0;

  return {
    sourceKey: "huberman-site",
    cursor: now.toISOString(),
    documents,
    people: [],
    errors,
    metadata: {
      sitemapUrl: HUBERMAN_SITEMAP_URL,
      pageMetadataRequested,
      pageMetadataParsed: Math.max(pageMetadataRequested - errors.length, 0),
      deferredPages: enrichPageMetadata
        ? Math.max(sitemapDocuments.length - MAX_PAGE_METADATA_REQUESTS, 0)
        : sitemapDocuments.length,
      failedPages: errors.length,
      contentPolicy: "public_url_title_date_and_short_meta_excerpt_only_no_page_copying",
    },
  };
}

export function parseHubermanPageMetadata(
  html: string
): Pick<
  EvidenceDocumentInput,
  "title" | "sourceExcerpt" | "publishedAt" | "rightsMode" | "metadata"
> {
  const title = decodeXml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const description = decodeXml(extractMetaContent(html, "description"));
  const publishedAt = extractStructuredDate(html, "datePublished");
  const modifiedAt = extractStructuredDate(html, "dateModified");
  const schemaType = decodeXml(html.match(/["']@type["']\s*:\s*["']([^"']+)["']/i)?.[1] ?? "");
  const sourceExcerpt = createSourceExcerpt(description);

  return {
    title,
    sourceExcerpt,
    publishedAt,
    rightsMode: sourceExcerpt ? "short_excerpt" : "metadata_only",
    metadata: {
      sourcePublishedAt: publishedAt ?? null,
      sourceUpdatedAt: modifiedAt ?? null,
      schemaType: schemaType || null,
      sourceVersion: fingerprintSourceVersion({
        title,
        description,
        publishedAt,
        modifiedAt,
        schemaType,
      }),
      contentPolicy: "title_date_and_short_meta_excerpt_only_no_page_copying",
    },
  };
}

export function parseHubermanSitemap(xml: string): EvidenceDocumentInput[] {
  const documents: EvidenceDocumentInput[] = [];
  const seen = new Set<string>();
  const locationRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = locationRegex.exec(xml)) !== null) {
    const canonicalUrl = normalizeHubermanSiteUrl(decodeXml(match[1]));
    if (!canonicalUrl) continue;
    const url = new URL(canonicalUrl);
    const [section, slug] = url.pathname.split("/").filter(Boolean);
    if (!section || !INCLUDED_SECTIONS.has(section) || !slug) continue;

    const identityKey = `huberman-site:${url.pathname.toLowerCase()}`;
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    const title = titleFromPath(section, slug);

    documents.push({
      identityKey,
      sourceKey: "huberman-site",
      externalId: url.pathname,
      documentType:
        section === "newsletter"
          ? "newsletter"
          : section === "annual-letter" || section === "protocols-book"
            ? "publication"
            : "show_notes",
      canonicalUrl,
      title,
      topics: extractTopics(title, ""),
      language: "en",
      rightsMode: "metadata_only",
      metadata: {
        section,
        contentPolicy: "public_url_metadata_only_no_page_copying",
      },
    });
  }

  return documents;
}

function normalizeHubermanSiteUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!/(^|\.)hubermanlab\.com$/i.test(url.hostname)) return undefined;
    url.protocol = "https:";
    url.hostname = "www.hubermanlab.com";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function titleFromPath(section: string, slug: string): string {
  const label = decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  const sectionLabel = section
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return `${sectionLabel}: ${label}`;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

async function enrichHubermanPages(
  documents: EvidenceDocumentInput[],
  fetchImpl: typeof fetch,
  concurrency: number,
  errors: string[]
): Promise<EvidenceDocumentInput[]> {
  const enriched = new Map<string, EvidenceDocumentInput>();
  const queue = documents.slice(0, MAX_PAGE_METADATA_REQUESTS);
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), 6, queue.length) },
    async () => {
      while (queue.length > 0) {
        const document = queue.shift();
        if (!document) continue;
        try {
          const response = await fetchEvidenceUrl(
            document.canonicalUrl,
            {
              headers: {
                Accept: "text/html,application/xhtml+xml",
                "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
              },
            },
            fetchImpl,
            { timeoutMs: 20_000, retries: 2 }
          );
          if (!response.ok) throw new Error(`request returned ${response.status}`);
          const declaredLength = Number(response.headers.get("content-length"));
          if (Number.isFinite(declaredLength) && declaredLength > MAX_PAGE_BYTES) {
            throw new Error("page exceeded metadata parser size limit");
          }
          const html = await response.text();
          if (html.length > MAX_PAGE_BYTES) {
            throw new Error("page exceeded metadata parser size limit");
          }
          const page = parseHubermanPageMetadata(html);
          enriched.set(document.identityKey, {
            ...document,
            title: page.title || document.title,
            sourceExcerpt: page.sourceExcerpt,
            publishedAt: page.publishedAt ?? document.publishedAt,
            rightsMode: page.rightsMode,
            metadata: { ...(document.metadata ?? {}), ...(page.metadata ?? {}) },
          });
        } catch (error) {
          enriched.set(document.identityKey, document);
          errors.push(`${document.canonicalUrl}: ${toErrorMessage(error)}`);
        }
      }
    }
  );
  await Promise.all(workers);
  return documents.map((document) => enriched.get(document.identityKey) ?? document);
}

function extractMetaContent(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameFirst = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
    "i"
  );
  return html.match(nameFirst)?.[1] ?? html.match(contentFirst)?.[1] ?? "";
}

function extractStructuredDate(html: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = html.match(new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']+)["']`, "i"))?.[1];
  if (!value) return undefined;
  const date = new Date(decodeXml(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}
