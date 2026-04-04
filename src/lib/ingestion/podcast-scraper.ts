/**
 * Podcast Episode Scraper
 *
 * Scrapes episode data from podcast RSS feeds.
 * Stores metadata in Supabase, transcripts are processed separately.
 */

import { getSupabaseAdmin as getSupabase, extractTopics } from "./shared";
import logger from "@/lib/logger";

interface EpisodeData {
  episode_number: number;
  title: string;
  description: string;
  publish_date: string;
  duration_seconds: number;
  guests: string[];
  topics: string[];
  url: string;
}

/**
 * Fetches episode list from podcast RSS feed
 */
export async function fetchEpisodesFromRSS(): Promise<EpisodeData[]> {
  const RSS_URL = "https://feeds.megaphone.fm/hubermanlab";

  const response = await fetch(RSS_URL);
  const xml = await response.text();

  const episodes: EpisodeData[] = [];
  // Parse RSS XML items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let episodeNumber = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractXmlTag(itemXml, "title");
    const description = extractXmlTag(itemXml, "description")
      .replace(/<[^>]*>/g, "")
      .trim();
    const pubDate = extractXmlTag(itemXml, "pubDate");
    const link = extractXmlTag(itemXml, "link");

    // Extract duration from itunes:duration tag
    const durationStr = extractXmlTag(itemXml, "itunes:duration");
    const durationSeconds = parseDuration(durationStr);

    // Try to extract episode number from title
    const epNumMatch = title.match(/#(\d+)/);
    if (epNumMatch) {
      episodeNumber = parseInt(epNumMatch[1]);
    } else {
      episodeNumber++;
    }

    // Extract guest names (often in title after "with" or "|")
    const guests = extractGuests(title);

    // Extract topics from title and description
    const topics = extractTopics(title, description);

    episodes.push({
      episode_number: episodeNumber,
      title: cleanTitle(title),
      description: description.slice(0, 2000),
      publish_date: pubDate ? new Date(pubDate).toISOString().split("T")[0] : "",
      duration_seconds: durationSeconds,
      guests,
      topics,
      url: link || `https://hubermanlab.com/episode-${episodeNumber}`,
    });
  }

  // Deduplicate by episode_number (keep first occurrence)
  const seen = new Set<number>();
  const deduped = episodes.filter((ep) => {
    if (seen.has(ep.episode_number)) return false;
    seen.add(ep.episode_number);
    return true;
  });

  return deduped;
}

/**
 * Store episodes in Supabase
 */
export async function storeEpisodes(episodes: EpisodeData[]) {
  const supabase = getSupabase();
  const batchSize = 50;
  let stored = 0;

  for (let i = 0; i < episodes.length; i += batchSize) {
    const batch = episodes.slice(i, i + batchSize);

    const { error } = await supabase
      .from("podcast_episodes")
      .upsert(
        batch.map((ep) => ({
          episode_number: ep.episode_number,
          title: ep.title,
          description: ep.description,
          publish_date: ep.publish_date || null,
          duration_seconds: ep.duration_seconds,
          guests: ep.guests,
          topics: ep.topics,
          url: ep.url,
          ingested: false,
        })),
        { onConflict: "episode_number" }
      );

    if (error) {
      logger.error({ err: error, batch: i }, "Error storing episode batch");
    } else {
      stored += batch.length;
      logger.info({ stored, total: episodes.length }, "Stored episodes batch");
    }
  }

  return stored;
}

/**
 * Main scraping pipeline
 */
export async function runPodcastScraper() {
  logger.info("Starting podcast episode scraper");

  const episodes = await fetchEpisodesFromRSS();
  logger.info({ count: episodes.length }, "Found episodes from RSS feed");

  const stored = await storeEpisodes(episodes);
  logger.info({ stored }, "Successfully stored episodes");

  return { total: episodes.length, stored };
}

// ---- Utility functions ----

function extractXmlTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

function parseDuration(duration: string): number {
  if (!duration) return 0;
  // Format: HH:MM:SS or MM:SS or seconds
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseInt(duration) || 0;
}

function cleanTitle(title: string): string {
  return title
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function extractGuests(title: string): string[] {
  const guests: string[] = [];
  // Pattern: "Topic | Guest Name" or "Topic with Guest Name"
  const pipeMatch = title.match(/\|\s*(.+?)(?:\s*#\d+)?$/);
  if (pipeMatch) {
    const guestPart = pipeMatch[1].trim();
    if (
      guestPart.length < 60 &&
      !guestPart.includes("Protocol") &&
      !guestPart.includes("Toolkit")
    ) {
      guests.push(guestPart);
    }
  }

  const withMatch = title.match(/with\s+(Dr\.\s+)?(\w+\s+\w+)/i);
  if (withMatch && !guests.length) {
    guests.push((withMatch[1] || "") + withMatch[2]);
  }

  return guests;
}

