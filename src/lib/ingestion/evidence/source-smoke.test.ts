import { describe, expect, it } from "vitest";
import { fetchHubermanRssEvidence } from "./huberman-rss";
import { fetchHubermanSiteEvidence } from "./huberman-site";
import { fetchRecentPubMedEvidence } from "./pubmed";

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

    expect(huberman.documents.length).toBeGreaterThan(0);
    expect(huberman.documents[0].canonicalUrl).toMatch(/^https:\/\/www\.hubermanlab\.com\//);
    expect(
      huberman.documents.every((document) => (document.sourceExcerpt?.length ?? 0) <= 500)
    ).toBe(true);
    expect(pubmed.documents.length).toBeGreaterThan(0);
    expect(site.documents.length).toBeGreaterThan(0);
    expect(site.documents.every((document) => !document.sourceExcerpt)).toBe(true);
    expect(pubmed.documents.every((document) => !document.sourceExcerpt)).toBe(true);
    expect(JSON.stringify([huberman, site, pubmed]).toLowerCase()).not.toContain('"transcript":');
    expect(JSON.stringify([huberman, site, pubmed]).toLowerCase()).not.toContain('"abstract":');
  }, 45_000);
});
