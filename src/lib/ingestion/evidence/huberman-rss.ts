import { extractTopics } from "../shared";
import { fetchEvidenceUrl } from "./fetch";
import {
  createSourceExcerpt,
  fingerprintClaim,
  fingerprintSourceVersion,
  parsePersonLabel,
} from "./policy";
import type {
  EvidenceBatch,
  EvidenceClaimInput,
  EvidenceDocumentInput,
  PersonMentionInput,
} from "./types";

export const HUBERMAN_RSS_URL = "https://feeds.megaphone.fm/hubermanlab";
const MAX_RSS_BYTES = 5_000_000;
const PROTOCOL_MARKER_POLICY = "action_cues_v3";
const PROMOTIONAL_MARKER_PATTERN =
  /\b(?:sponsors?|sponsored\s+by|advertisements?|ads?|newsletters?|protocols?\s+book|book\s+recommendations?|zero[-\s]*cost\s+support|supporting\s+the\s+hlp|see\s+caption(?:\s+on\s+youtube)?|live\s+events?)\b|^\s*(?:support|subscribe|disclaimer|title\s+card|announcement)\b/i;
const PROTOCOL_ACTION_CUE_PATTERN =
  /\b(?:tools?|protocols?|exercises?|meditat(?:e|es|ed|ing|ion|ions|ive)|breath(?:s|ing|work)?|supplements?|supplementation|doses?|dosage|practices?|training|exposures?|timing|how\s+to|steps?|recommend(?:ed|ation|ations|ing)?|routines?|methods?|techniques?|therap(?:y|ies)|interventions?|strateg(?:y|ies)|guidelines?|habits?|schedules?|optimi[sz](?:e|es|ed|ing|ation))\b/i;

interface TimestampMarker {
  timestamp: string;
  seconds: number;
  label: string;
}

interface ParsedEpisode {
  document: EvidenceDocumentInput;
  people: PersonMentionInput[];
  claims: EvidenceClaimInput[];
}

export interface HubermanRssOptions {
  publishedSince?: Date;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export async function fetchHubermanRssEvidence(
  options: HubermanRssOptions = {}
): Promise<EvidenceBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const response = await fetchEvidenceUrl(
    HUBERMAN_RSS_URL,
    {
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
      },
    },
    fetchImpl,
    { timeoutMs: 30_000, retries: 2 }
  );

  if (!response.ok) {
    throw new Error(`Huberman RSS request failed with ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RSS_BYTES) {
    throw new Error("Huberman RSS response exceeded the parser size limit");
  }
  const xml = await response.text();
  if (xml.length > MAX_RSS_BYTES) {
    throw new Error("Huberman RSS response exceeded the parser size limit");
  }
  const parsed = parseHubermanRss(xml, options.publishedSince);

  return {
    sourceKey: "huberman-rss",
    cursor: now.toISOString(),
    documents: parsed.map((episode) => episode.document),
    people: parsed.flatMap((episode) => episode.people),
    claims: parsed.flatMap((episode) => episode.claims),
    metadata: {
      feedUrl: HUBERMAN_RSS_URL,
      publishedSince: options.publishedSince?.toISOString() ?? null,
      contentPolicy: "metadata_timestamps_and_short_excerpt_only",
    },
  };
}

export function parseHubermanRss(xml: string, publishedSince?: Date): ParsedEpisode[] {
  const episodes: ParsedEpisode[] = [];
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const parsed = parseEpisodeItem(itemMatch[1]);
    if (!parsed) continue;

    if (publishedSince && parsed.document.publishedAt) {
      const publishedAt = new Date(parsed.document.publishedAt);
      if (publishedAt < publishedSince) continue;
    }
    episodes.push(parsed);
  }

  return episodes.sort((a, b) =>
    (b.document.publishedAt ?? "").localeCompare(a.document.publishedAt ?? "")
  );
}

function parseEpisodeItem(itemXml: string): ParsedEpisode | null {
  const rawTitle = extractXmlTag(itemXml, "title");
  const title = decodeRssText(rawTitle).replace(/\s+/g, " ").trim();
  if (!title) return null;

  const rawDescription =
    extractXmlTag(itemXml, "description") || extractXmlTag(itemXml, "itunes:summary");
  const description = decodeRssText(rawDescription);
  const summary = extractEditorialSummary(description);
  const timestamps = extractTimestampMarkers(description);
  const episodeNumber = parseOptionalInteger(
    decodeRssText(extractXmlTag(itemXml, "itunes:episode"))
  );
  const feedGuid = decodeRssText(extractXmlTag(itemXml, "guid"));
  const publishedAt = parseDate(extractXmlTag(itemXml, "pubDate"));
  const durationSeconds = parseDuration(decodeRssText(extractXmlTag(itemXml, "itunes:duration")));
  const episodeType = decodeRssText(extractXmlTag(itemXml, "itunes:episodeType")) || "full";
  const contentEncoded = extractXmlTag(itemXml, "content:encoded");
  const canonicalUrl =
    normalizeHubermanUrl(decodeRssText(extractXmlTag(itemXml, "link"))) ||
    extractHubermanEpisodeUrl(contentEncoded) ||
    "https://www.hubermanlab.com/podcast";
  const externalId =
    feedGuid || (episodeNumber ? `episode-${episodeNumber}` : canonicalUrl.toLowerCase());

  const guest = extractGuest(title, summary);
  const guests = guest ? [guest.displayName] : [];
  const topics = extractTopics(
    title,
    `${summary} ${timestamps.map((marker) => marker.label).join(" ")}`
  );
  const sourceExcerpt = createSourceExcerpt(summary);
  const protocolMarkers = timestamps
    .filter((marker) => isProtocolTimestampLabel(marker.label))
    .slice(0, 40);

  const document: EvidenceDocumentInput = {
    identityKey: `huberman-episode:${externalId}`,
    sourceKey: "huberman-rss",
    externalId,
    documentType: "podcast_episode",
    canonicalUrl,
    title,
    sourceExcerpt,
    publishedAt,
    authors: ["Scicomm Media"],
    guests,
    topics,
    rightsMode: "short_excerpt",
    metadata: {
      feedGuid: feedGuid || null,
      episodeNumber,
      episodeType,
      durationSeconds,
      timestamps: timestamps.slice(0, 120),
      protocolMarkers,
      protocolMarkerPolicy: PROTOCOL_MARKER_POLICY,
      sourceVersion: fingerprintSourceVersion({
        timestamps: timestamps.slice(0, 120),
        protocolMarkers,
        protocolMarkerPolicy: PROTOCOL_MARKER_POLICY,
      }),
      sourceDisclaimerUrl: "https://www.hubermanlab.com/disclaimer",
      contentPolicy: "no_audio_or_full_transcript_stored",
    },
  };

  const host = parsePersonLabel("Andrew Huberman, PhD", "host", {
    matchStatus: "verified",
    confidence: 1,
    evidence: "Huberman Lab feed owner and host",
  });
  const people: PersonMentionInput[] = [];
  if (host) {
    people.push({
      ...host,
      documentSourceKey: document.sourceKey,
      documentExternalId: document.externalId,
      primaryUrl: "https://www.hubermanlab.com/about",
    });
  }
  if (guest) {
    people.push({
      ...guest,
      documentSourceKey: document.sourceKey,
      documentExternalId: document.externalId,
    });
  }

  const claims = protocolMarkers.map((marker): EvidenceClaimInput => {
    const claim = {
      documentIdentityKey: document.identityKey,
      claimType: "protocol" as const,
      claimText: marker.label,
      structuredData: {
        timestamp: marker.timestamp,
        seconds: marker.seconds,
        source: "huberman_rss_timestamp_label",
        reviewRequired: true,
      },
    };
    return {
      ...claim,
      claimHash: fingerprintClaim(claim),
      evidenceLevel: "unknown",
      extractionMethod: "deterministic_timestamp_marker",
    };
  });

  return { document, people, claims };
}

function extractGuest(
  title: string,
  summary: string
): Omit<PersonMentionInput, "documentSourceKey" | "documentExternalId"> | null {
  const pipeCandidate = title.match(/\|\s*([^|]+)$/)?.[1];
  if (pipeCandidate) {
    const parsed = parsePersonLabel(pipeCandidate, "guest", {
      confidence: 0.95,
      evidence: "Guest named after the final separator in the episode title",
    });
    if (parsed) return parsed;
  }

  const withCandidate = title.match(
    /\bwith\s+((?:Dr\.?\s+)?[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3})/u
  )?.[1];
  if (withCandidate) {
    const parsed = parsePersonLabel(withCandidate, "guest", {
      confidence: 0.85,
      evidence: "Guest named in the episode title",
    });
    if (parsed) return parsed;
  }

  const introCandidate = summary.match(
    /^(?:in this [^.]+,\s*)?(?:my guest is\s+)?((?:Dr\.?\s+)?[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3}(?:,\s*(?:Ph\.?D\.?|M\.?D\.?|MD|DO|Psy\.?D\.?|MPH))?)(?:,|\s+is\b)/u
  )?.[1];
  return introCandidate
    ? parsePersonLabel(introCandidate, "guest", {
        confidence: 0.72,
        evidence: "Guest extracted from the opening episode summary",
      })
    : null;
}

function extractEditorialSummary(description: string): string {
  return description
    .split(
      /\n\s*(?:Get tickets|Pre-order|Read the episode|Read the full|Use Ask Huberman|Thank you to our sponsors|Timestamps|Disclaimer)/i
    )[0]
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTimestampMarkers(value: string): TimestampMarker[] {
  const markers: TimestampMarker[] = [];
  const timestampRegex = /(?:^|\n)\s*\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s+([^\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = timestampRegex.exec(value)) !== null) {
    const label = match[2].replace(/\s+/g, " ").trim();
    if (!label) continue;
    markers.push({
      timestamp: match[1],
      seconds: timestampToSeconds(match[1]),
      label,
    });
  }

  return markers;
}

export function isProtocolTimestampLabel(label: string): boolean {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized || PROMOTIONAL_MARKER_PATTERN.test(normalized)) return false;
  return PROTOCOL_ACTION_CUE_PATTERN.test(normalized);
}

function extractXmlTag(xml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cdataRegex = new RegExp(
    `<${escapedTag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${escapedTag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`, "i");
  return xml.match(regex)?.[1]?.trim() ?? "";
}

function decodeRssText(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<(?:br|\/p|\/h[1-6])\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function extractHubermanEpisodeUrl(value: string): string | undefined {
  const decoded = decodeXmlEntities(value);
  const match = decoded.match(/https:\/\/(?:www\.)?hubermanlab\.com\/episode\/[a-z0-9-]+/i);
  return match ? normalizeHubermanUrl(match[0]) : undefined;
}

function normalizeHubermanUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!/(^|\.)hubermanlab\.com$/i.test(url.hostname)) return undefined;
    url.protocol = "https:";
    url.hostname = "www.hubermanlab.com";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function parseDate(value: string): string | undefined {
  const date = new Date(decodeRssText(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseOptionalInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDuration(value: string): number {
  if (!value) return 0;
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function timestampToSeconds(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}
