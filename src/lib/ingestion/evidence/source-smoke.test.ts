import { describe, expect, it } from "vitest";
import { fetchHubermanRssEvidence } from "./huberman-rss";
import { fetchHubermanSiteEvidence } from "./huberman-site";
import { fetchRecentPubMedEvidence } from "./pubmed";
import { fetchHubermanEpisodePageEvidence } from "./huberman-episode-pages";
import { fetchGuestCrossrefEvidence } from "./crossref-guests";

const live = process.env.LIVE_INGESTION_SMOKE === "1";

describe.skipIf(!live)("live evidence source smoke", () => {
  it("reads current official metadata without collecting raw copyrighted text", async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const [huberman, site, pubmed] = await Promise.all([
      fetchHubermanRssEvidence({ publishedSince: from, now }),
      fetchHubermanSiteEvidence({ now }),
      fetchRecentPubMedEvidence({ from, to: now, now, maxResults: 5 }),
    ]);
    const recentEpisode = huberman.documents[0];
    const guest = huberman.people.find((person) => person.role === "guest");
    const [episodePage, crossref] = await Promise.all([
      fetchHubermanEpisodePageEvidence({ episodes: recentEpisode ? [recentEpisode] : [], now }),
      fetchGuestCrossrefEvidence({
        guests: guest
          ? [
              {
                displayName: guest.displayName,
                normalizedName: guest.normalizedName,
                credentials: guest.credentials,
                affiliations: guest.affiliations,
              },
            ]
          : [],
        from,
        to: now,
        now,
        maxResultsPerGuest: 3,
        requestDelayMs: 0,
      }),
    ]);

    expect(huberman.documents.length).toBeGreaterThan(0);
    expect(huberman.documents[0].canonicalUrl).toMatch(/^https:\/\/www\.hubermanlab\.com\//);
    expect(
      huberman.documents.every((document) => (document.sourceExcerpt?.length ?? 0) <= 500)
    ).toBe(true);
    expect(pubmed.documents.length).toBeGreaterThan(0);
    expect(site.documents.length).toBeGreaterThan(0);
    expect(site.errors).toEqual([]);
    expect(site.documents.some((document) => Boolean(document.sourceExcerpt))).toBe(true);
    expect(site.documents.some((document) => Boolean(document.metadata?.sourceUpdatedAt))).toBe(
      true
    );
    expect(site.documents.every((document) => (document.sourceExcerpt?.length ?? 0) <= 500)).toBe(
      true
    );
    expect(pubmed.documents.every((document) => !document.sourceExcerpt)).toBe(true);
    expect(episodePage.errors).toEqual([]);
    expect(episodePage.documents.length).toBeGreaterThan(1);
    expect(episodePage.relations?.length ?? 0).toBeGreaterThan(1);
    expect(crossref.errors).toEqual([]);
    expect(
      JSON.stringify([huberman, site, pubmed, episodePage, crossref]).toLowerCase()
    ).not.toContain('"transcript":');
    expect(
      JSON.stringify([huberman, site, pubmed, episodePage, crossref]).toLowerCase()
    ).not.toContain('"abstract":');
  }, 180_000);
});
