import { describe, expect, it } from "vitest";
import {
  extractTimestampMarkers,
  isProtocolTimestampLabel,
  parseHubermanRss,
} from "./huberman-rss";

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

  it("repairs a retired official episode slug that otherwise returns 404", () => {
    const feed = `<rss><channel><item>
      <title>Essentials: Control Your Brain Chemistry for Focus, Motivation &amp; Well-Being</title>
      <description>A solo Essentials episode.</description>
      <guid>essentials-brain-chemistry</guid>
      <link>https://www.hubermanlab.com/episode/essentials-optimize-and-control-your-brain-chemistry-to-improve-health-and-performance</link>
    </item></channel></rss>`;

    expect(parseHubermanRss(feed)[0].document.canonicalUrl).toBe(
      "https://www.hubermanlab.com/episode/essentials-control-brain-chemistry-for-focus-motivation-and-well-being"
    );
  });

  it.each([
    [
      "GUEST SERIES | Dr. Andy Galpin: How to Assess & Improve All Aspects of Your Fitness",
      "Andy Galpin, PhD, is a professor of kinesiology.",
      ["Andy Galpin"],
    ],
    [
      "Journal Club with Dr. Peter Attia | Effects of Light & Dark on Mental Health & Treatments for Cancer",
      "In this journal club episode, my guest is Dr. Peter Attia, MD, a physician.",
      ["Peter Attia"],
    ],
    [
      "Curing Disease | Mark Zuckerberg & Dr. Priscilla Chan",
      "Mark Zuckerberg and Dr. Priscilla Chan join the podcast.",
      ["Mark Zuckerberg", "Priscilla Chan"],
    ],
    [
      "Health Policy | U.S. Surgeon General Dr. Vivek Murthy",
      "Dr. Vivek Murthy, MD, is the U.S. Surgeon General.",
      ["Vivek Murthy"],
    ],
    [
      "Maximizing Productivity, Physical & Mental Health with Daily Tools",
      "In this episode, I discuss science-supported tools.",
      [],
    ],
    [
      "Science-Supported Tools to Accelerate Your Fitness Goals",
      "I explain tools gleaned from the guest series on fitness with Dr. Andy Galpin. First, I explain the program.",
      [],
    ],
  ])("extracts only real guests from %s", (title, description, expectedGuests) => {
    const feed = `<rss><channel><item>
      <title><![CDATA[${title}]]></title>
      <description><![CDATA[${description}]]></description>
      <guid>${title}</guid>
      <link>https://www.hubermanlab.com/episode/test</link>
    </item></channel></rss>`;

    expect(parseHubermanRss(feed)[0].document.guests).toEqual(expectedGuests);
  });

  it("converts timestamps to seconds without storing the transcript", () => {
    expect(extractTimestampMarkers("\n(01:02:03) Tool: Example\n")).toEqual([
      { timestamp: "01:02:03", seconds: 3723, label: "Tool: Example" },
    ]);
  });

  it.each([
    "Tool: Meditation & Breathing Techniques",
    "Morning Light Exposure Timing",
    "How to Improve Sleep",
    "Supplement Dosage & Timing",
    "Exercise Protocol: Three Training Steps",
  ])("accepts action-oriented protocol marker %s", (label) => {
    expect(isProtocolTimestampLabel(label)).toBe(true);
  });

  it.each([
    "Sponsor: Eight Sleep",
    "Sponsors: Joovv & Eight Sleep",
    "Neural Network, Supplement Sources, Sponsors",
    "Thank you to our sponsors: Eight Sleep",
    "Sleep & Illness Susceptibility",
    "Nutrition & Metabolism",
    "Recovery",
    "Title Card: Sleep",
    "Announcement: Protocols Live Events",
    "Book Recommendation: How Emotions Are Made",
    "An Excellent Review on Training (See Caption On YouTube)",
    "Zero-Cost Support, YouTube Reviews, Protocols Book, Neural Network Newsletter",
  ])("rejects promotional or topic-only marker %s", (label) => {
    expect(isProtocolTimestampLabel(label)).toBe(false);
  });
});
