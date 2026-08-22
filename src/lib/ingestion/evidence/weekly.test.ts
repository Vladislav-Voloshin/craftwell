import { describe, expect, it, vi } from "vitest";
import type { EvidenceBatch, EvidenceStore, PersistResult } from "./types";
import { runWeeklyEvidenceIngestion } from "./weekly";

function createStore(): EvidenceStore & {
  persisted: EvidenceBatch[];
  finished: string[];
} {
  const persisted: EvidenceBatch[] = [];
  const finished: string[] = [];
  return {
    persisted,
    finished,
    async startRun({ sourceKey }) {
      return `run-${sourceKey}`;
    },
    async persistBatch(batch) {
      persisted.push(batch);
      return {
        discovered: batch.documents.length,
        inserted: batch.documents.length,
        updated: 0,
        skipped: 0,
        errors: 0,
      };
    },
    async listGuestResearchCandidates() {
      return [];
    },
    async markGuestResearchChecked() {},
    async finishRun({ sourceKey, status }) {
      finished.push(`${sourceKey}:${status}`);
    },
  };
}

describe("weekly evidence orchestrator", () => {
  it("runs Huberman and PubMed incrementally and records both runs", async () => {
    const store = createStore();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("megaphone.fm")) {
        return new Response(
          `
          <rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
            <channel><item>
              <title>New Episode | Dr. Test Guest</title>
              <link>https://www.hubermanlab.com/episode/new-episode</link>
              <description>Tools for sleep and focus.</description>
              <pubDate>Mon, 17 Aug 2026 08:00:00 GMT</pubDate>
              <itunes:episode>300</itunes:episode>
              <guid>episode-300</guid>
            </item></channel>
          </rss>`,
          { status: 200 }
        );
      }
      if (url.includes("hubermanlab.com/sitemap.xml")) {
        return new Response(
          "<urlset><url><loc>https://www.hubermanlab.com/newsletter/new-tools</loc></url></urlset>",
          { status: 200 }
        );
      }
      if (url.includes("hubermanlab.com/episode/new-episode")) {
        return new Response(
          '<html><div data-w-tab="Transcript"></div><p>Become a Huberman Lab Premium member to access full episode transcripts</p></html>',
          { status: 200 }
        );
      }
      if (url.includes("googleapis.com/youtube/v3/channels")) {
        return Response.json({
          items: [
            {
              id: "UC2D2CMWXMOVWx7giW1n3LIg",
              snippet: { title: "Andrew Huberman" },
              contentDetails: { relatedPlaylists: { uploads: "official-uploads" } },
            },
          ],
        });
      }
      if (url.includes("googleapis.com/youtube/v3/playlistItems")) {
        return Response.json({
          items: [
            {
              id: "playlist-300",
              contentDetails: {
                videoId: "video-300",
                videoPublishedAt: "2026-08-17T08:00:00Z",
              },
              snippet: { title: "New Episode" },
              status: { privacyStatus: "public" },
            },
          ],
        });
      }
      if (url.includes("googleapis.com/youtube/v3/videos")) {
        return Response.json({
          items: [
            {
              id: "video-300",
              snippet: {
                channelId: "UC2D2CMWXMOVWx7giW1n3LIg",
                title: "New Episode",
                publishedAt: "2026-08-17T08:00:00Z",
              },
              contentDetails: { caption: "true" },
              status: { uploadStatus: "processed", privacyStatus: "public" },
            },
          ],
        });
      }
      if (url.includes("api.crossref.org")) {
        return Response.json({ message: { items: [], "total-results": 0 } });
      }
      if (url.includes("esearch.fcgi")) {
        return Response.json({ esearchresult: { idlist: ["42"] } });
      }
      return Response.json({
        result: {
          uids: ["42"],
          "42": {
            title: "Recent sleep study",
            sortpubdate: "2026/08/16 00:00",
            authors: [{ name: "Test Author" }],
            pubtype: ["Journal Article"],
            articleids: [{ idtype: "pubmed", value: "42" }],
          },
        },
      });
    }) as typeof fetch;

    const result = await runWeeklyEvidenceIngestion({
      trigger: "test",
      now: new Date("2026-08-18T10:00:00.000Z"),
      fetchImpl,
      store,
      youtubeApiKey: "youtube-test-key",
      crossrefRequestDelayMs: 0,
    });

    expect(result.status).toBe("succeeded");
    expect(store.persisted.map((batch) => batch.sourceKey).sort()).toEqual([
      "books-catalog",
      "crossref-guests",
      "huberman-episode-pages",
      "huberman-rss",
      "huberman-site",
      "huberman-stanford-lab",
      "huberman-youtube",
      "pubmed-guests",
      "pubmed-health",
    ]);
    expect(store.finished.sort()).toEqual([
      "books-catalog:succeeded",
      "crossref-guests:succeeded",
      "huberman-episode-pages:succeeded",
      "huberman-rss:succeeded",
      "huberman-site:succeeded",
      "huberman-stanford-lab:succeeded",
      "huberman-youtube:succeeded",
      "pubmed-guests:succeeded",
      "pubmed-health:succeeded",
    ]);
  });

  it("reports partial completion when one source fails", async () => {
    const store = createStore();
    const originalPersist = store.persistBatch;
    store.persistBatch = async (batch): Promise<PersistResult> => {
      if (batch.sourceKey === "pubmed-health") throw new Error("NCBI timeout");
      return originalPersist(batch);
    };
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("megaphone.fm")) {
        return new Response("<rss><channel></channel></rss>", { status: 200 });
      }
      if (String(input).includes("hubermanlab.com/sitemap.xml")) {
        return new Response("<urlset></urlset>", { status: 200 });
      }
      if (String(input).includes("esearch.fcgi")) {
        return Response.json({ esearchresult: { idlist: [] } });
      }
      throw new Error("Unexpected request");
    }) as typeof fetch;

    const result = await runWeeklyEvidenceIngestion({
      trigger: "test",
      now: new Date("2026-08-18T10:00:00.000Z"),
      fetchImpl,
      store,
      youtubeApiKey: null,
      crossrefRequestDelayMs: 0,
    });

    expect(result.status).toBe("partial");
    expect(result.sources.find((source) => source.sourceKey === "pubmed-health")).toMatchObject({
      status: "failed",
      error: "NCBI timeout",
    });
  });
});
