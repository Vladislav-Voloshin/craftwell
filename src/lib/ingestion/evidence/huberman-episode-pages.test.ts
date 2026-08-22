import { describe, expect, it } from "vitest";
import { validateEvidenceDocument } from "./policy";
import {
  detectTranscriptStatus,
  extractShowNoteReferences,
  parseHubermanEpisodePage,
} from "./huberman-episode-pages";
import type { EvidenceDocumentInput } from "./types";

const episode: EvidenceDocumentInput = {
  identityKey: "huberman-episode:episode-300",
  sourceKey: "huberman-rss",
  externalId: "episode-300",
  documentType: "podcast_episode",
  canonicalUrl: "https://www.hubermanlab.com/episode/emotions",
  title: "Tools for Emotion Regulation | Dr. Ralph Adolphs",
  publishedAt: "2026-08-17T08:00:00.000Z",
  guests: ["Ralph Adolphs"],
  topics: ["stress"],
  rightsMode: "short_excerpt",
  metadata: { episodeNumber: 300 },
};

const html = `
  <html>
    <script type="application/ld+json">
      {"@graph":[{"@type":"PodcastEpisode","episodeNumber":"300","contributor":{"@type":"Person","name":"Dr. Ralph Adolphs","url":"https://www.hubermanlab.com/guests/dr-ralph-adolphs"},"associatedMedia":[{"@type":"MediaObject","contentUrl":"https://youtu.be/abc123","encodingFormat":"text/html"},{"@type":"MediaObject","contentUrl":"https://open.spotify.com/episode/spotify123?si=tracking","encodingFormat":"audio/mpeg"}]}]}
    </script>
    <div data-w-tab="Show Notes" class="w-tab-pane">
      <a href="https://www.pnas.org/doi/10.1073/pnas.0914054107?utm_source=test">Emotion study</a>
      <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6322839/pdf/paper.pdf">Open research paper</a>
      <a href="https://www.amazon.com/Some-Book/dp/123456789X?tag=huberman">Guest book</a>
      <a href="https://www.bbe.caltech.edu/people/ralph-adolphs">Caltech research profile</a>
      <a href="https://drinkag1.com/huberman">Sponsor</a>
    </div>
    <div data-w-tab="Timestamps" class="w-tab-pane"></div>
    <div data-w-tab="Transcript" class="w-tab-pane">
      <div class="rich-text-transcript w-dyn-bind-empty"></div>
      <p>Become a Huberman Lab Premium member to access full episode transcripts</p>
    </div>
  </html>`;

describe("Huberman episode page metadata parser", () => {
  it("captures transcript availability, media, research, books and lab links without page text", () => {
    const parsed = parseHubermanEpisodePage(html, episode);

    expect(parsed.metadata.transcriptStatus).toBe("premium_required");
    expect(parsed.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentType: "transcript_reference" }),
        expect.objectContaining({ identityKey: "youtube:abc123", documentType: "video" }),
        expect.objectContaining({ identityKey: "spotify:episode:spotify123" }),
        expect.objectContaining({
          identityKey: "doi:10.1073/pnas.0914054107",
          documentType: "publication",
        }),
        expect.objectContaining({ identityKey: "pmc:pmc6322839" }),
        expect.objectContaining({ identityKey: "book:amazon:123456789x", documentType: "book" }),
        expect.objectContaining({ documentType: "lab_update" }),
      ])
    );
    expect(parsed.documents.some((document) => document.title === "Sponsor")).toBe(false);
    expect(parsed.relations.some((relation) => relation.relationType === "transcript_for")).toBe(
      true
    );
    expect(parsed.people.every((person) => person.normalizedName === "ralph adolphs")).toBe(true);
    expect(parsed.personSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalizedName: "ralph adolphs",
          sourceKind: "other",
          url: "https://www.hubermanlab.com/guests/dr-ralph-adolphs",
          verified: true,
          metadata: expect.objectContaining({ relationshipStatus: "verified" }),
        }),
        expect.objectContaining({
          normalizedName: "ralph adolphs",
          sourceKind: "institution",
          url: "https://www.bbe.caltech.edu/people/ralph-adolphs",
          verified: false,
          metadata: expect.objectContaining({ relationshipStatus: "candidate" }),
        }),
      ])
    );
    for (const document of parsed.documents) {
      expect(() => validateEvidenceDocument(document)).not.toThrow();
      expect(document.sourceExcerpt).toBeUndefined();
      expect(JSON.stringify(document.metadata)).not.toContain("Emotion study");
    }
  });

  it("extracts only links from the Show Notes pane", () => {
    const links = extractShowNoteReferences(
      `${html}<a href="https://example.com/outside">Outside</a>`,
      episode.canonicalUrl
    );
    expect(links.some((link) => link.title === "Outside")).toBe(false);
    expect(links).toHaveLength(4);
  });

  it("does not infer transcript access when the tab is absent", () => {
    expect(detectTranscriptStatus("<html></html>")).toBe("not_listed");
  });

  it("does not assign an ambiguous profile link when an episode has multiple guests", () => {
    const parsed = parseHubermanEpisodePage(html, {
      ...episode,
      guests: ["Ralph Adolphs", "Jane Smith"],
    });

    expect(
      parsed.personSources.some(
        (source) => source.url === "https://www.bbe.caltech.edu/people/ralph-adolphs"
      )
    ).toBe(false);
  });

  it("does not trust deceptive source hostnames and tolerates malformed URL encoding", () => {
    const references = extractShowNoteReferences(
      `<div data-w-tab="Show Notes">
        <a href="https://evilnature.com/paper">Not Nature</a>
        <a href="https://notyoutube.com/watch?v=fake">Not YouTube</a>
        <a href="https://example.com/%E0%A4%A">Malformed encoding</a>
      </div><div data-w-tab="Timestamps"></div>`,
      episode.canonicalUrl
    );

    expect(references).toHaveLength(3);
    expect(references.every((reference) => reference.relationType === "mentions")).toBe(true);
    expect(references.every((reference) => reference.documentType === "media")).toBe(true);
  });

  it("reconciles a small schema spelling difference to the RSS guest identity", () => {
    const parsed = parseHubermanEpisodePage(
      `<script type="application/ld+json">
        {"@type":"PodcastEpisode","contributor":{"@type":"Person","name":"Dr. Abud Bakari","url":"https://www.hubermanlab.com/guests/dr-abud-bakari"}}
      </script>`,
      { ...episode, guests: ["Abud Bakri"] }
    );

    const guests = new Set(parsed.people.map((person) => person.normalizedName));
    expect(guests).toEqual(new Set(["abud bakri"]));
    expect(parsed.people[0].primaryUrl).toBe("https://www.hubermanlab.com/guests/dr-abud-bakari");
  });
});
