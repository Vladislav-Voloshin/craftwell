import { createHash } from "node:crypto";
import { cleanHtml, extractTopics } from "../shared";
import { fetchEvidenceUrl } from "./fetch";
import { fingerprintSourceVersion, parsePersonLabel } from "./policy";
import type {
  EvidenceBatch,
  EvidenceDocumentInput,
  EvidenceRelationInput,
  PersonMentionInput,
  PersonSourceInput,
} from "./types";

const SOURCE_KEY = "huberman-episode-pages";
const MAX_PAGE_BYTES = 2_000_000;
const DEFAULT_CONCURRENCY = 3;

const SCHOLARLY_HOSTS = [
  "apa.org",
  "cell.com",
  "elifesciences.org",
  "frontiersin.org",
  "jamanetwork.com",
  "nature.com",
  "ncbi.nlm.nih.gov",
  "onlinelibrary.wiley.com",
  "oup.com",
  "pnas.org",
  "sagepub.com",
  "sciencedirect.com",
  "science.org",
  "springer.com",
] as const;

const IGNORED_HOSTS = [
  "cdn.prod.website-files.com",
  "drinkag1.com",
  "facebook.com",
  "functionhealth.com",
  "helixsleep.com",
  "instagram.com",
  "linkedin.com",
  "lmnt.com",
  "rorra.com",
  "scicommedia.com",
  "threads.net",
  "tiktok.com",
  "twitter.com",
] as const;

export interface HubermanEpisodePageOptions {
  episodes: EvidenceDocumentInput[];
  now?: Date;
  fetchImpl?: typeof fetch;
  concurrency?: number;
}

interface ParsedEpisodePage {
  documents: EvidenceDocumentInput[];
  people: PersonMentionInput[];
  personSources: PersonSourceInput[];
  relations: EvidenceRelationInput[];
  metadata: Record<string, unknown>;
}

interface PageReference {
  identityKey: string;
  externalId: string;
  canonicalUrl: string;
  title: string;
  documentType: EvidenceDocumentInput["documentType"];
  relationType: EvidenceRelationInput["relationType"];
  doi?: string;
  pmid?: string;
  referenceKind: string;
}

interface PodcastEpisodeSchema {
  name?: string;
  datePublished?: string;
  episodeNumber?: string | number;
  contributor?: unknown;
  associatedMedia?: unknown;
}

export async function fetchHubermanEpisodePageEvidence(
  options: HubermanEpisodePageOptions
): Promise<EvidenceBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const episodes = deduplicateEpisodes(
    options.episodes.filter(
      (episode) =>
        episode.documentType === "podcast_episode" && isHubermanEpisodeUrl(episode.canonicalUrl)
    )
  );
  const parsed: ParsedEpisodePage[] = [];
  const errors: string[] = [];

  await mapWithConcurrency(
    episodes,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async (episode) => {
      try {
        const response = await fetchEvidenceUrl(
          episode.canonicalUrl,
          {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
            },
          },
          fetchImpl,
          { timeoutMs: 25_000, retries: 2 }
        );
        if (!response.ok) {
          throw new Error(`request returned ${response.status}`);
        }
        const declaredLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_PAGE_BYTES) {
          throw new Error("page exceeded the metadata parser size limit");
        }
        const html = await response.text();
        if (html.length > MAX_PAGE_BYTES) {
          throw new Error("page exceeded the metadata parser size limit");
        }
        parsed.push(parseHubermanEpisodePage(html, episode));
      } catch (error) {
        errors.push(`${episode.canonicalUrl}: ${toErrorMessage(error)}`);
      }
    }
  );

  return {
    sourceKey: SOURCE_KEY,
    cursor: now.toISOString(),
    documents: parsed.flatMap((page) => page.documents),
    people: parsed.flatMap((page) => page.people),
    personSources: parsed.flatMap((page) => page.personSources),
    relations: parsed.flatMap((page) => page.relations),
    errors,
    metadata: {
      episodePagesRequested: episodes.length,
      episodePagesParsed: parsed.length,
      failedPages: errors.length,
      referenceDocuments: parsed.reduce((sum, page) => sum + page.documents.length, 0),
      contentPolicy: "structured_metadata_and_public_link_labels_only_no_page_or_transcript_text",
    },
  };
}

export function parseHubermanEpisodePage(
  html: string,
  episode: EvidenceDocumentInput
): ParsedEpisodePage {
  const schema = findPodcastEpisodeSchema(html);
  const guests = extractGuests(schema, episode.guests ?? []);
  const transcriptStatus = detectTranscriptStatus(html);
  const transcriptIdentityKey = `huberman-transcript-reference:${episode.externalId}`;
  const transcriptExternalId = `${episode.externalId}:transcript-reference`;
  const transcriptDocument: EvidenceDocumentInput = {
    identityKey: transcriptIdentityKey,
    sourceKey: SOURCE_KEY,
    externalId: transcriptExternalId,
    documentType: "transcript_reference",
    canonicalUrl: `${episode.canonicalUrl}#transcript`,
    title: `Transcript reference: ${episode.title}`,
    publishedAt: episode.publishedAt,
    guests: guests.map((guest) => guest.displayName),
    topics: episode.topics ?? [],
    rightsMode: "metadata_only",
    metadata: {
      episodeIdentityKey: episode.identityKey,
      availability: transcriptStatus,
      accessModel: "official_provider_only",
      sourceVersion: fingerprintSourceVersion({ transcriptStatus }),
      contentPolicy: "availability_reference_only_no_transcript_text",
    },
  };

  const references = deduplicateReferences([
    ...extractAssociatedMedia(schema, episode),
    ...extractShowNoteReferences(html, episode.canonicalUrl),
  ]);
  const referenceDocuments = references.map(
    (reference): EvidenceDocumentInput => ({
      identityKey: reference.identityKey,
      sourceKey: SOURCE_KEY,
      externalId: reference.externalId,
      documentType: reference.documentType,
      canonicalUrl: reference.canonicalUrl,
      title: reference.title,
      publishedAt: episode.publishedAt,
      guests: guests.map((guest) => guest.displayName),
      topics: extractTopics(reference.title, episode.title),
      doi: reference.doi,
      pmid: reference.pmid,
      rightsMode: "metadata_only",
      metadata: {
        episodeIdentityKey: episode.identityKey,
        referenceKind: reference.referenceKind,
        contentPolicy: "public_link_metadata_only",
      },
    })
  );

  const relations: EvidenceRelationInput[] = [
    {
      sourceDocumentIdentityKey: episode.identityKey,
      targetDocumentIdentityKey: transcriptIdentityKey,
      sourceKey: SOURCE_KEY,
      relationType: "transcript_for",
      metadata: { availability: transcriptStatus },
    },
    ...references.map(
      (reference): EvidenceRelationInput => ({
        sourceDocumentIdentityKey: episode.identityKey,
        targetDocumentIdentityKey: reference.identityKey,
        sourceKey: SOURCE_KEY,
        relationType: reference.relationType,
        metadata: { referenceKind: reference.referenceKind },
      })
    ),
  ];

  const allDocuments = [transcriptDocument, ...referenceDocuments];
  const guestDocuments = [
    transcriptDocument,
    ...referenceDocuments.filter((_, index) => references[index]?.relationType === "media_of"),
  ];
  const people = guests.flatMap((guest) =>
    guestDocuments.map(
      (document): PersonMentionInput => ({
        ...guest,
        documentSourceKey: SOURCE_KEY,
        documentExternalId: document.externalId,
      })
    )
  );
  const personSources = guests.flatMap((guest) =>
    references
      .filter(
        (reference) =>
          reference.relationType === "media_of" ||
          (guests.length === 1 && reference.referenceKind === "guest_or_lab_profile")
      )
      .map(
        (reference): PersonSourceInput => ({
          normalizedName: guest.normalizedName,
          sourceKind: reference.referenceKind === "guest_or_lab_profile" ? "institution" : "media",
          url: reference.canonicalUrl,
          title: reference.title,
          verified: false,
          metadata: {
            discoveredOnEpisode: episode.identityKey,
            relationshipStatus: "candidate",
          },
        })
      )
  );

  return {
    documents: allDocuments,
    people,
    personSources,
    relations,
    metadata: {
      transcriptStatus,
      referenceCount: references.length,
      episodeNumber: schema?.episodeNumber ?? episode.metadata?.episodeNumber ?? null,
    },
  };
}

export function detectTranscriptStatus(html: string): string {
  if (!/data-w-tab=["']Transcript["']/i.test(html)) return "not_listed";
  const transcriptBlock = html.match(
    /class=["'][^"']*rich-text-transcript[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  )?.[1];
  if (transcriptBlock && cleanHtml(transcriptBlock).length >= 80) {
    return "official_member_transcript_available";
  }
  if (/premium member to access full episode transcripts/i.test(html)) return "premium_required";
  return "not_yet_available";
}

export function extractShowNoteReferences(html: string, pageUrl: string): PageReference[] {
  const showNotes = extractTabPane(html, "Show Notes");
  if (!showNotes) return [];
  const references: PageReference[] = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(showNotes)) !== null) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const label = cleanHtml(match[2]).slice(0, 400);
    const reference = classifyReference(href, label, pageUrl);
    if (reference) references.push(reference);
  }
  return deduplicateReferences(references);
}

function extractAssociatedMedia(
  schema: PodcastEpisodeSchema | undefined,
  episode: EvidenceDocumentInput
): PageReference[] {
  const media = asArray(schema?.associatedMedia);
  return media.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const contentUrl = typeof value.contentUrl === "string" ? decodeHtml(value.contentUrl) : "";
    const reference = classifyReference(contentUrl, episode.title, episode.canonicalUrl);
    if (!reference) return [];
    return [{ ...reference, relationType: "media_of" as const }];
  });
}

function classifyReference(href: string, label: string, pageUrl: string): PageReference | null {
  const canonicalUrl = normalizeReferenceUrl(href, pageUrl);
  if (!canonicalUrl) return null;
  const url = new URL(canonicalUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    host === "hubermanlab.com" ||
    IGNORED_HOSTS.some((ignored) => hostMatchesDomain(host, ignored))
  ) {
    return null;
  }

  const doi = extractDoi(canonicalUrl);
  const pmid = extractPmid(canonicalUrl);
  const pmcid = canonicalUrl.match(/\/articles\/(PMC\d+)/i)?.[1]?.toUpperCase();
  const youtubeId = extractYouTubeId(url);
  const spotifyId = url.pathname.match(/\/episode\/([a-zA-Z0-9]+)/)?.[1];
  const appleId = url.searchParams.get("i");
  const asin = extractAmazonAsin(url);
  const title = referenceTitle(label, url);

  if (pmid) {
    return {
      identityKey: `pubmed:${pmid}`,
      externalId: `pubmed:${pmid}`,
      canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      title,
      documentType: "study",
      relationType: "cites",
      pmid,
      referenceKind: "pubmed",
    };
  }
  if (doi) {
    return {
      identityKey: `doi:${doi}`,
      externalId: `doi:${doi}`,
      canonicalUrl: `https://doi.org/${doi}`,
      title,
      documentType: "publication",
      relationType: "cites",
      doi,
      referenceKind: "doi_publication",
    };
  }
  if (pmcid) {
    return {
      identityKey: `pmc:${pmcid.toLowerCase()}`,
      externalId: `pmc:${pmcid.toLowerCase()}`,
      canonicalUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
      title,
      documentType: "publication",
      relationType: "cites",
      referenceKind: "pubmed_central",
    };
  }
  if (asin) {
    return {
      identityKey: `book:amazon:${asin.toLowerCase()}`,
      externalId: `amazon:${asin.toLowerCase()}`,
      canonicalUrl,
      title,
      documentType: "book",
      relationType: "cites",
      referenceKind: "book_catalog_link",
    };
  }
  if (youtubeId) {
    return {
      identityKey: `youtube:${youtubeId}`,
      externalId: `youtube:${youtubeId}`,
      canonicalUrl,
      title: `Video: ${title}`,
      documentType: "video",
      relationType: "media_of",
      referenceKind: "youtube_video",
    };
  }
  if (spotifyId) {
    return {
      identityKey: `spotify:episode:${spotifyId}`,
      externalId: `spotify:episode:${spotifyId}`,
      canonicalUrl,
      title: `Spotify: ${title}`,
      documentType: "media",
      relationType: "media_of",
      referenceKind: "spotify_episode",
    };
  }
  if (appleId) {
    return {
      identityKey: `apple-podcast:${appleId}`,
      externalId: `apple-podcast:${appleId}`,
      canonicalUrl,
      title: `Apple Podcasts: ${title}`,
      documentType: "media",
      relationType: "media_of",
      referenceKind: "apple_podcast_episode",
    };
  }

  const isScholarly = SCHOLARLY_HOSTS.some((scholarlyHost) =>
    hostMatchesDomain(host, scholarlyHost)
  );
  const isInstitution =
    host.endsWith(".edu") ||
    /(?:^|[/.\-_])(lab|laboratory|faculty|profile|research)(?:[/.\-_]|$)/i.test(canonicalUrl);
  const identity = hashUrl(canonicalUrl);
  return {
    identityKey: `reference:${identity}`,
    externalId: `reference:${identity}`,
    canonicalUrl,
    title,
    documentType: isScholarly ? "publication" : isInstitution ? "lab_update" : "media",
    relationType: isScholarly ? "cites" : "mentions",
    referenceKind: isScholarly
      ? "scholarly_publication"
      : isInstitution
        ? "guest_or_lab_profile"
        : "public_resource",
  };
}

function findPodcastEpisodeSchema(html: string): PodcastEpisodeSchema | undefined {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      const found = findSchemaType(parsed, "PodcastEpisode");
      if (found) return found as PodcastEpisodeSchema;
    } catch {
      // Ignore malformed structured-data blocks and continue with other blocks.
    }
  }
  return undefined;
}

function findSchemaType(value: unknown, type: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSchemaType(item, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record["@type"] === type) return record;
  for (const child of Object.values(record)) {
    const found = findSchemaType(child, type);
    if (found) return found;
  }
  return undefined;
}

function extractGuests(
  schema: PodcastEpisodeSchema | undefined,
  fallbackNames: string[]
): Array<Omit<PersonMentionInput, "documentSourceKey" | "documentExternalId">> {
  const contributorNames = asArray(schema?.contributor).flatMap((contributor) => {
    if (typeof contributor === "string") return [contributor];
    if (!contributor || typeof contributor !== "object") return [];
    const name = (contributor as Record<string, unknown>).name;
    return typeof name === "string" ? [decodeHtml(name)] : [];
  });
  const names = Array.from(new Set([...contributorNames, ...fallbackNames]));
  const parsedGuests = names.flatMap((name) => {
    const parsed = parsePersonLabel(name, "guest", {
      matchStatus: "extracted",
      confidence: contributorNames.includes(name) ? 0.98 : 0.9,
      evidence: contributorNames.includes(name)
        ? "Guest named in official PodcastEpisode structured metadata"
        : "Guest named in the official podcast RSS feed",
    });
    return parsed ? [parsed] : [];
  });
  return Array.from(
    parsedGuests
      .reduce((byName, guest) => {
        const current = byName.get(guest.normalizedName);
        if (!current || guest.confidence > current.confidence) {
          byName.set(guest.normalizedName, guest);
        }
        return byName;
      }, new Map<string, (typeof parsedGuests)[number]>())
      .values()
  );
}

function extractTabPane(html: string, tabName: string): string {
  const startPattern = new RegExp(`<div\\s+data-w-tab=["']${escapeRegex(tabName)}["'][^>]*>`, "i");
  const startMatch = startPattern.exec(html);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const nextTab = /<div\s+data-w-tab=["'][^"']+["'][^>]*>/gi;
  nextTab.lastIndex = start;
  const endMatch = nextTab.exec(html);
  return html.slice(start, endMatch?.index ?? html.length);
}

function normalizeReferenceUrl(value: string, pageUrl: string): string | undefined {
  try {
    const url = new URL(decodeHtml(value), pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.protocol = "https:";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|si$|ref$|tag$|linkCode$|camp$|creative$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function extractDoi(value: string): string | undefined {
  const decoded = safeDecodeURIComponent(value);
  const match = decoded.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i)?.[0];
  return match?.replace(/[).,;]+$/, "").toLowerCase();
}

function extractPmid(value: string): string | undefined {
  return value.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1];
}

function extractYouTubeId(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0];
  }
  if (hostMatchesDomain(host, "youtube.com")) return url.searchParams.get("v") ?? undefined;
  return undefined;
}

function extractAmazonAsin(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !/^amazon\.(?:com|ca|de|es|fr|it|nl|pl|se|in|sg|ae|sa|com\.au|com\.br|co\.jp|co\.uk|com\.mx|com\.tr)$/.test(
      host
    )
  ) {
    return undefined;
  }
  return url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase();
}

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function referenceTitle(label: string, url: URL): string {
  const cleaned = label.replace(/\s+/g, " ").trim();
  if (cleaned && !/^(?:here|link|learn more|read more)$/i.test(cleaned)) return cleaned;
  return `${url.hostname.replace(/^www\./, "")}${url.pathname}`.slice(0, 400);
}

function deduplicateEpisodes(episodes: EvidenceDocumentInput[]): EvidenceDocumentInput[] {
  return Array.from(new Map(episodes.map((episode) => [episode.identityKey, episode])).values());
}

function deduplicateReferences(references: PageReference[]): PageReference[] {
  return Array.from(
    new Map(references.map((reference) => [reference.identityKey, reference])).values()
  );
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), 6, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) await worker(item);
      }
    }
  );
  await Promise.all(workers);
}

function isHubermanEpisodeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)hubermanlab\.com$/i.test(url.hostname) && url.pathname.startsWith("/episode/");
  } catch {
    return false;
  }
}

function hashUrl(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}
