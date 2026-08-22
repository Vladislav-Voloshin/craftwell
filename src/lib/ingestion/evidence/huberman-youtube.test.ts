import { describe, expect, it, vi } from "vitest";
import { fetchHubermanYouTubeEvidence, HUBERMAN_YOUTUBE_CHANNEL_ID } from "./huberman-youtube";

function channelResponse() {
  return {
    items: [
      {
        id: HUBERMAN_YOUTUBE_CHANNEL_ID,
        snippet: { title: "Andrew Huberman", customUrl: "@hubermanlab" },
        contentDetails: { relatedPlaylists: { uploads: "official-uploads" } },
      },
    ],
  };
}

describe("Huberman YouTube evidence adapter", () => {
  it("stores official video and transcript-availability metadata without copied content", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("key")).toBe("test-key");
      if (url.pathname.endsWith("/channels")) return Response.json(channelResponse());
      if (url.pathname.endsWith("/playlistItems")) {
        if (url.searchParams.get("pageToken") === "next") {
          return Response.json({
            nextPageToken: "not-needed",
            items: [
              {
                id: "playlist-old-2",
                contentDetails: {
                  videoId: "old-2",
                  videoPublishedAt: "2026-08-01T08:00:00Z",
                },
                snippet: { title: "Older episode" },
                status: { privacyStatus: "public" },
              },
            ],
          });
        }
        return Response.json({
          nextPageToken: "next",
          items: [
            {
              id: "playlist-new",
              contentDetails: {
                videoId: "new-video",
                videoPublishedAt: "2026-08-20T08:00:00Z",
              },
              snippet: { title: "New sleep protocol" },
              status: { privacyStatus: "public" },
            },
            {
              id: "playlist-old",
              contentDetails: {
                videoId: "old-video",
                videoPublishedAt: "2026-08-01T08:00:00Z",
              },
              snippet: { title: "Old episode" },
              status: { privacyStatus: "public" },
            },
          ],
        });
      }
      if (url.pathname.endsWith("/videos")) {
        expect(url.searchParams.get("id")).toBe("new-video");
        return Response.json({
          items: [
            {
              id: "new-video",
              snippet: {
                channelId: HUBERMAN_YOUTUBE_CHANNEL_ID,
                publishedAt: "2026-08-20T08:00:00Z",
                title: "New Sleep Protocol | Huberman Lab",
                description: "This full description must never be retained.",
                tags: ["sleep", "health"],
                categoryId: "28",
                defaultAudioLanguage: "en",
              },
              contentDetails: {
                duration: "PT1H2M3S",
                caption: "true",
                definition: "hd",
                licensedContent: true,
              },
              status: {
                uploadStatus: "processed",
                privacyStatus: "public",
                embeddable: true,
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected test request: ${url.pathname}`);
    }) as typeof fetch;

    const batch = await fetchHubermanYouTubeEvidence({
      apiKey: "test-key",
      now: new Date("2026-08-22T10:00:00Z"),
      publishedSince: new Date("2026-08-15T00:00:00Z"),
      fetchImpl,
    });

    expect(batch.sourceKey).toBe("huberman-youtube");
    expect(batch.documents).toHaveLength(2);
    expect(batch.documents[0]).toMatchObject({
      identityKey: "youtube:new-video",
      externalId: "new-video",
      documentType: "video",
      canonicalUrl: "https://www.youtube.com/watch?v=new-video",
      title: "New Sleep Protocol | Huberman Lab",
      rightsMode: "metadata_only",
      metadata: {
        captionAvailability: "available_on_official_platform",
        duration: "PT1H2M3S",
        tags: ["sleep", "health"],
      },
    });
    expect(batch.documents[1]).toMatchObject({
      identityKey: "youtube-transcript-reference:new-video",
      documentType: "transcript_reference",
      metadata: {
        availability: "official_platform_caption_available",
        accessModel: "official_provider_only",
      },
    });
    expect(batch.relations).toEqual([
      expect.objectContaining({
        sourceDocumentIdentityKey: "youtube:new-video",
        targetDocumentIdentityKey: "youtube-transcript-reference:new-video",
        relationType: "transcript_for",
      }),
    ]);
    expect(batch.people).toEqual([
      expect.objectContaining({
        displayName: "Andrew Huberman",
        role: "host",
        matchStatus: "verified",
      }),
    ]);
    expect(batch.metadata).toMatchObject({
      pagesFetched: 2,
      selectedVideos: 1,
      storedVideos: 1,
      captionReferencesAvailable: 1,
      paginationTruncated: false,
    });
    const serialized = JSON.stringify(batch).toLowerCase();
    expect(serialized).not.toContain("full description");
    expect(serialized).not.toContain('"description"');
    expect(serialized).not.toContain('"transcript":');
    expect(serialized).not.toContain('"captions":');
  });

  it("requires a configured key and never includes it in upstream errors", async () => {
    await expect(fetchHubermanYouTubeEvidence({ apiKey: "" })).rejects.toThrow(
      "YOUTUBE_API_KEY is required"
    );

    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 403 })) as typeof fetch;
    await expect(
      fetchHubermanYouTubeEvidence({ apiKey: "super-secret-key", fetchImpl })
    ).rejects.toThrow("YouTube channels request failed with 403");
    await expect(
      fetchHubermanYouTubeEvidence({ apiKey: "super-secret-key", fetchImpl })
    ).rejects.not.toThrow("super-secret-key");
  });
});
