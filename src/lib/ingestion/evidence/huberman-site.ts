import { extractTopics } from "../shared";
import type { EvidenceBatch, EvidenceDocumentInput } from "./types";

export const HUBERMAN_SITEMAP_URL = "https://www.hubermanlab.com/sitemap.xml";

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
  } = {}
): Promise<EvidenceBatch> {
  const now = options.now ?? new Date();
  const response = await (options.fetchImpl ?? fetch)(HUBERMAN_SITEMAP_URL, {
    headers: {
      Accept: "application/xml, text/xml;q=0.9",
      "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Huberman sitemap request failed with ${response.status}`);
  }

  return {
    sourceKey: "huberman-site",
    cursor: now.toISOString(),
    documents: parseHubermanSitemap(await response.text()),
    people: [],
    metadata: {
      sitemapUrl: HUBERMAN_SITEMAP_URL,
      contentPolicy: "public_url_metadata_only_no_page_copying",
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
