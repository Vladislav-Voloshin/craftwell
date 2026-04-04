/**
 * YouTube Podcast Scraper
 *
 * Fetches all video metadata from a YouTube channel using the YouTube Data API v3.
 * Extracts descriptions (which contain timestamped topics) and stores them as
 * content chunks for the RAG pipeline.
 */

import { getSupabaseAdmin as getSupabase } from "./shared";
import logger from "@/lib/logger";
import { serverEnv } from "@/lib/env";
const HUBERMAN_CHANNEL_ID = "UC2D2CMWXMOVWx7giW1n3LIg"; // Huberman Lab
const API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
}

/**
 * Fetch all video IDs from a channel using search endpoint (paginated)
 */
async function fetchChannelVideoIds(maxResults = 500): Promise<string[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  while (videoIds.length < maxResults) {
    const params = new URLSearchParams({
      key: serverEnv().YOUTUBE_API_KEY,
      channelId: HUBERMAN_CHANNEL_ID,
      part: "id",
      type: "video",
      order: "date",
      maxResults: "50",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${API_BASE}/search?${params}`);
    if (!res.ok) {
      const err = await res.text();
      logger.error({ err }, "YouTube search API error");
      break;
    }

    const data = await res.json();
    for (const item of data.items || []) {
      if (item.id?.videoId) {
        videoIds.push(item.id.videoId);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;

    // Rate limit: YouTube API allows 10,000 units/day; search costs 100 units
    await new Promise((r) => setTimeout(r, 200));
  }

  return videoIds;
}

/**
 * Fetch full video details (title, description) in batches of 50
 */
async function fetchVideoDetails(videoIds: string[]): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      key: serverEnv().YOUTUBE_API_KEY,
      id: batch.join(","),
      part: "snippet",
      maxResults: "50",
    });

    const res = await fetch(`${API_BASE}/videos?${params}`);
    if (!res.ok) {
      logger.error("YouTube videos API error");
      continue;
    }

    const data = await res.json();
    for (const item of data.items || []) {
      videos.push({
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
      });
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return videos;
}

/**
 * Store YouTube video data as content chunks in Supabase
 */
async function storeYouTubeChunks(videos: YouTubeVideo[]): Promise<number> {
  const supabase = getSupabase();
  let stored = 0;

  for (const video of videos) {
    // Skip shorts and non-episode content
    if (video.description.length < 100) continue;
    if (video.title.includes("#shorts")) continue;

    // Build a rich content string from the description
    const content = `Title: ${video.title}\n\nDescription:\n${video.description}`;

    // Check if already stored
    const { data: existing } = await supabase
      .from("content_chunks")
      .select("id")
      .eq("source_title", video.title)
      .eq("source_type", "podcast")
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from("content_chunks").insert({
      source_type: "podcast",
      source_title: video.title,
      source_id: null,
      content: content.slice(0, 5000),
      metadata: {
        youtube_video_id: video.videoId,
        youtube_url: `https://www.youtube.com/watch?v=${video.videoId}`,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        source: "youtube",
      },
    });

    if (error) {
      logger.error({ err: error.message, title: video.title }, "Error storing YouTube video");
    } else {
      stored++;
    }
  }

  return stored;
}

/**
 * Main YouTube scraping pipeline
 */
export async function runYouTubeScraper() {
  logger.info("Starting YouTube podcast scraper");
  logger.info("Fetching video IDs from Huberman Lab channel");

  const videoIds = await fetchChannelVideoIds(500);
  logger.info({ count: videoIds.length }, "Found videos");

  logger.info("Fetching video details");
  const videos = await fetchVideoDetails(videoIds);
  logger.info({ count: videos.length }, "Got video details");

  logger.info("Storing as content chunks");
  const stored = await storeYouTubeChunks(videos);
  logger.info({ stored }, "Stored content chunks from YouTube");

  return { total: videos.length, stored };
}
