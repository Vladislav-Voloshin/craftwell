import { describe, expect, it } from "vitest";
import { extractTimestampMarkers, parseHubermanRss } from "./huberman-rss";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title>Neuroscience of Emotions &amp; Tools | Dr. Ralph Adolphs</title>
      <description><![CDATA[Dr. Ralph Adolphs, PhD, is a Professor at Caltech. We discuss emotional regulation and practical tools.

Thank you to our sponsors

Timestamps
(00:00:00) Ralph Adolphs
(00:31:22) Emotional Regulation, Tool: Situational Avoidance
(01:53:46) Tool: Meditation &amp; Breathing Techniques
Disclaimer &amp; Disclosures]]></description>
      <pubDate>Mon, 17 Aug 2026 08:00:00 -0000</pubDate>
      <itunes:episode>294</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:duration>02:09:45</itunes:duration>
      <guid isPermaLink="false"><![CDATA[episode-guid-294]]></guid>
      <content:encoded><![CDATA[<a href="https://www.hubermanlab.com/episode/neuroscience-of-emotions-and-tools"></a>]]></content:encoded>
    </item>
  </channel>
</rss>`;

describe("Huberman RSS evidence parser", () => {
  it("extracts episode metadata, guest identity, and timestamped protocol markers", () => {
    const [episode] = parseHubermanRss(SAMPLE_FEED);
    expect(episode.document).toMatchObject({
      identityKey: "huberman-episode:episode-guid-294",
      sourceKey: "huberman-rss",
      externalId: "episode-guid-294",
      documentType: "podcast_episode",
      canonicalUrl: "https://www.hubermanlab.com/episode/neuroscience-of-emotions-and-tools",
      guests: ["Ralph Adolphs"],
      rightsMode: "short_excerpt",
    });
    expect(episode.document.sourceExcerpt!.length).toBeLessThanOrEqual(500);
    expect(episode.document.metadata).not.toHaveProperty("transcript");
    expect(episode.document.metadata?.protocolMarkers).toHaveLength(2);
    expect(episode.claims).toHaveLength(2);
    expect(episode.claims[0]).toMatchObject({
      documentIdentityKey: "huberman-episode:episode-guid-294",
      claimType: "protocol",
      evidenceLevel: "unknown",
      extractionMethod: "deterministic_timestamp_marker",
      structuredData: { reviewRequired: true },
    });
    expect(episode.people.map((person) => person.normalizedName)).toEqual([
      "andrew huberman",
      "ralph adolphs",
    ]);
  });

  it("filters episodes before the incremental cursor", () => {
    expect(parseHubermanRss(SAMPLE_FEED, new Date("2026-08-18"))).toEqual([]);
  });

  it("converts timestamps to seconds without storing the transcript", () => {
    expect(extractTimestampMarkers("\n(01:02:03) Tool: Example\n")).toEqual([
      { timestamp: "01:02:03", seconds: 3723, label: "Tool: Example" },
    ]);
  });
});
