import { extractTopics } from "../shared";
import { fetchEvidenceUrl } from "./fetch";
import { fingerprintSourceVersion, parsePersonLabel } from "./policy";
import type {
  EvidenceBatch,
  EvidenceDocumentInput,
  EvidenceRelationInput,
  PersonMentionInput,
} from "./types";

export const HUBERMAN_YOUTUBE_CHANNEL_ID = "UC2D2CMWXMOVWx7giW1n3LIg";
export const HUBERMAN_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@hubermanlab";

const SOURCE_KEY = "huberman-youtube";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_API_RESPONSE_BYTES = 2_000_000;
const MAX_PLAYLIST_PAGES = 25;

interface YouTubeChannel {
  id?: string;
  snippet?: {
    title?: string;
    customUrl?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

interface YouTubePlaylistItem {
  id?: string;
  snippet?: {
    publishedAt?: string;
    title?: string;
    resourceId?: { videoId?: string };
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
  status?: {
    privacyStatus?: string;
  };
}

interface YouTubeVideo {
  id?: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    tags?: string[];
    categoryId?: string;
    liveBroadcastContent?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  contentDetails?: {
    duration?: string;
    dimension?: string;
    definition?: string;
    caption?: string;
    licensedContent?: boolean;
    projection?: string;
  };
  status?: {
    uploadStatus?: string;
    privacyStatus?: string;
    embeddable?: boolean;
  };
}

interface YouTubeListResponse<T> {
  nextPageToken?: string;
  items?: T[];
}

interface SelectedVideo {
  videoId: string;
  playlistItemId?: string;
  publishedAt?: string;
  fallbackTitle?: string;
}

interface ParsedVideo {
  documents: EvidenceDocumentInput[];
  people: PersonMentionInput[];
  relations: EvidenceRelationInput[];
  captionAvailable: boolean;
}

export async function fetchHubermanYouTubeEvidence(options: {
  apiKey: string;
  now?: Date;
  publishedSince?: Date;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}): Promise<EvidenceBatch> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required for official YouTube metadata ingestion");
  }

  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestedMaxPages = options.maxPages ?? MAX_PLAYLIST_PAGES;
  const maxPages = Number.isFinite(requestedMaxPages)
    ? Math.min(Math.max(Math.floor(requestedMaxPages), 1), MAX_PLAYLIST_PAGES)
    : MAX_PLAYLIST_PAGES;
  const channel = await fetchOfficialChannel(apiKey, fetchImpl);
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error("Official Huberman YouTube channel did not expose an uploads playlist");
  }

  const selected = new Map<string, SelectedVideo>();
  let pageToken: string | undefined;
  let pagesFetched = 0;
  let unavailableItems = 0;
  let stoppedAtCutoff = false;

  do {
    const response = await requestYouTubeApi<YouTubeListResponse<YouTubePlaylistItem>>(
      "playlistItems",
      {
        part: "snippet,contentDetails,status",
        fields:
          "nextPageToken,items(id,snippet(publishedAt,title,resourceId/videoId),contentDetails(videoId,videoPublishedAt),status/privacyStatus)",
        playlistId: uploadsPlaylistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
      fetchImpl
    );
    pagesFetched += 1;

    const datedItems: Date[] = [];
    for (const item of response.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      const publishedAt = normalizeDate(
        item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt
      );
      if (publishedAt) datedItems.push(new Date(publishedAt));
      if (
        !videoId ||
        item.status?.privacyStatus === "private" ||
        /^(?:deleted|private) video$/i.test(item.snippet?.title?.trim() ?? "")
      ) {
        unavailableItems += 1;
        continue;
      }
      if (options.publishedSince && publishedAt && new Date(publishedAt) < options.publishedSince) {
        continue;
      }
      selected.set(videoId, {
        videoId,
        playlistItemId: item.id,
        publishedAt,
        fallbackTitle: cleanTitle(item.snippet?.title),
      });
    }

    pageToken = response.nextPageToken;
    stoppedAtCutoff = Boolean(
      options.publishedSince &&
      datedItems.length > 0 &&
      datedItems.every((publishedAt) => publishedAt < options.publishedSince!)
    );
  } while (pageToken && pagesFetched < maxPages && !stoppedAtCutoff);

  const videoDetails = await fetchVideoDetails(Array.from(selected.keys()), apiKey, fetchImpl);
  const parsed = Array.from(selected.values()).flatMap((selectedVideo) => {
    const details = videoDetails.get(selectedVideo.videoId);
    const video = parseYouTubeVideo(selectedVideo, details, channel);
    return video ? [video] : [];
  });
  const documents = parsed.flatMap((video) => video.documents);
  const latestPublishedAt = documents.reduce<string | undefined>((latest, document) => {
    if (!document.publishedAt) return latest;
    return !latest || document.publishedAt > latest ? document.publishedAt : latest;
  }, undefined);

  return {
    sourceKey: SOURCE_KEY,
    cursor: latestPublishedAt ?? now.toISOString(),
    documents,
    people: parsed.flatMap((video) => video.people),
    relations: parsed.flatMap((video) => video.relations),
    metadata: {
      channelId: HUBERMAN_YOUTUBE_CHANNEL_ID,
      channelTitle: channel.snippet?.title ?? "Andrew Huberman",
      channelUrl: HUBERMAN_YOUTUBE_CHANNEL_URL,
      uploadsPlaylistId,
      requestedSince: options.publishedSince?.toISOString() ?? null,
      pagesFetched,
      selectedVideos: selected.size,
      storedVideos: parsed.length,
      captionReferencesAvailable: parsed.filter((video) => video.captionAvailable).length,
      unavailableItems,
      paginationTruncated: Boolean(pageToken && !stoppedAtCutoff),
      contentPolicy:
        "official_youtube_api_metadata_and_caption_availability_only_no_descriptions_audio_captions_or_transcripts",
    },
  };
}

function parseYouTubeVideo(
  selected: SelectedVideo,
  video: YouTubeVideo | undefined,
  channel: YouTubeChannel
): ParsedVideo | null {
  if (video?.status?.privacyStatus && video.status.privacyStatus !== "public") return null;
  if (video?.status?.uploadStatus && video.status.uploadStatus !== "processed") return null;
  if (video?.snippet?.channelId && video.snippet.channelId !== HUBERMAN_YOUTUBE_CHANNEL_ID) {
    return null;
  }

  const title = cleanTitle(video?.snippet?.title) ?? selected.fallbackTitle;
  if (!title) return null;
  const publishedAt = normalizeDate(video?.snippet?.publishedAt) ?? selected.publishedAt;
  const canonicalUrl = `https://www.youtube.com/watch?v=${selected.videoId}`;
  const videoIdentityKey = `youtube:${selected.videoId}`;
  const transcriptIdentityKey = `youtube-transcript-reference:${selected.videoId}`;
  const captionAvailable = video?.contentDetails?.caption === "true";
  const topics = extractTopics(title, "");
  const tags = (video?.snippet?.tags ?? [])
    .map((tag) => tag.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 50);
  const sourceVersion = fingerprintSourceVersion({
    title,
    publishedAt,
    tags,
    duration: video?.contentDetails?.duration ?? null,
    captionAvailable,
    liveBroadcastContent: video?.snippet?.liveBroadcastContent ?? null,
    privacyStatus: video?.status?.privacyStatus ?? null,
  });
  const storedVideo: EvidenceDocumentInput = {
    identityKey: videoIdentityKey,
    sourceKey: SOURCE_KEY,
    externalId: selected.videoId,
    documentType: "video",
    canonicalUrl,
    title,
    publishedAt,
    authors: ["Andrew Huberman"],
    topics,
    language: video?.snippet?.defaultLanguage ?? video?.snippet?.defaultAudioLanguage ?? "en",
    rightsMode: "metadata_only",
    metadata: {
      channelId: HUBERMAN_YOUTUBE_CHANNEL_ID,
      channelTitle: channel.snippet?.title ?? "Andrew Huberman",
      playlistItemId: selected.playlistItemId ?? null,
      duration: video?.contentDetails?.duration ?? null,
      dimension: video?.contentDetails?.dimension ?? null,
      definition: video?.contentDetails?.definition ?? null,
      captionAvailability: captionAvailable
        ? "available_on_official_platform"
        : "not_reported_by_api",
      licensedContent: video?.contentDetails?.licensedContent ?? null,
      projection: video?.contentDetails?.projection ?? null,
      categoryId: video?.snippet?.categoryId ?? null,
      liveBroadcastContent: video?.snippet?.liveBroadcastContent ?? null,
      embeddable: video?.status?.embeddable ?? null,
      tags,
      sourceVersion,
      contentPolicy:
        "official_api_metadata_only_no_video_description_audio_captions_or_transcript_text",
    },
  };
  const transcriptReference: EvidenceDocumentInput = {
    identityKey: transcriptIdentityKey,
    sourceKey: SOURCE_KEY,
    externalId: `${selected.videoId}:transcript-reference`,
    documentType: "transcript_reference",
    canonicalUrl,
    title: `Transcript availability: ${title}`,
    publishedAt,
    authors: ["Andrew Huberman"],
    topics,
    language: storedVideo.language,
    rightsMode: "metadata_only",
    metadata: {
      videoIdentityKey,
      availability: captionAvailable
        ? "official_platform_caption_available"
        : "not_reported_by_api",
      accessModel: "official_provider_only",
      sourceVersion: fingerprintSourceVersion({ captionAvailable }),
      contentPolicy: "availability_reference_only_no_caption_or_transcript_text",
    },
  };
  const host = parsePersonLabel("Andrew Huberman, PhD", "host", {
    matchStatus: "verified",
    confidence: 1,
    evidence: "Official Huberman YouTube channel metadata",
  });
  const people: PersonMentionInput[] = host
    ? [
        {
          ...host,
          documentSourceKey: SOURCE_KEY,
          documentExternalId: selected.videoId,
          primaryUrl: HUBERMAN_YOUTUBE_CHANNEL_URL,
          metadata: { officialChannelId: HUBERMAN_YOUTUBE_CHANNEL_ID },
        },
      ]
    : [];

  return {
    documents: [storedVideo, transcriptReference],
    people,
    relations: [
      {
        sourceDocumentIdentityKey: videoIdentityKey,
        targetDocumentIdentityKey: transcriptIdentityKey,
        sourceKey: SOURCE_KEY,
        relationType: "transcript_for",
        metadata: {
          availability: transcriptReference.metadata?.availability,
        },
      },
    ],
    captionAvailable,
  };
}

async function fetchOfficialChannel(
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<YouTubeChannel> {
  const response = await requestYouTubeApi<YouTubeListResponse<YouTubeChannel>>(
    "channels",
    {
      part: "snippet,contentDetails",
      fields: "items(id,snippet(title,customUrl),contentDetails/relatedPlaylists/uploads)",
      id: HUBERMAN_YOUTUBE_CHANNEL_ID,
    },
    apiKey,
    fetchImpl
  );
  const channel = response.items?.find((item) => item.id === HUBERMAN_YOUTUBE_CHANNEL_ID);
  if (!channel) throw new Error("Official Huberman YouTube channel was not found");
  return channel;
}

async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<Map<string, YouTubeVideo>> {
  const videos = new Map<string, YouTubeVideo>();
  for (let index = 0; index < videoIds.length; index += 50) {
    const ids = videoIds.slice(index, index + 50);
    if (ids.length === 0) continue;
    const response = await requestYouTubeApi<YouTubeListResponse<YouTubeVideo>>(
      "videos",
      {
        part: "snippet,contentDetails,status",
        fields:
          "items(id,snippet(publishedAt,channelId,title,tags,categoryId,liveBroadcastContent,defaultLanguage,defaultAudioLanguage),contentDetails(duration,dimension,definition,caption,licensedContent,projection),status(uploadStatus,privacyStatus,embeddable))",
        id: ids.join(","),
      },
      apiKey,
      fetchImpl
    );
    for (const video of response.items ?? []) {
      if (video.id) videos.set(video.id, video);
    }
  }
  return videos;
}

async function requestYouTubeApi<T>(
  resource: "channels" | "playlistItems" | "videos",
  params: Record<string, string>,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<T> {
  const url = new URL(`${YOUTUBE_API_BASE}/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetchEvidenceUrl(
      url.toString(),
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "CraftwellEvidenceBot/1.0 (+https://craftwell.vercel.app)",
        },
      },
      fetchImpl,
      { timeoutMs: 20_000, retries: 2 }
    );
  } catch {
    // Never propagate the request URL because it contains the server-side API key.
    throw new Error(`YouTube ${resource} request failed`);
  }
  if (!response.ok) {
    throw new Error(`YouTube ${resource} request failed with ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_API_RESPONSE_BYTES) {
    throw new Error(`YouTube ${resource} response exceeded the parser size limit`);
  }
  const body = await response.text();
  if (body.length > MAX_API_RESPONSE_BYTES) {
    throw new Error(`YouTube ${resource} response exceeded the parser size limit`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`YouTube ${resource} returned invalid JSON`);
  }
}

function cleanTitle(value: string | undefined): string | undefined {
  const title = value?.replace(/\s+/g, " ").trim().slice(0, 400);
  return title || undefined;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
