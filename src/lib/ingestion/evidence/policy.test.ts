import { describe, expect, it } from "vitest";
import {
  createSourceExcerpt,
  normalizePersonName,
  parsePersonLabel,
  validateEvidenceDocument,
} from "./policy";

describe("evidence content policy", () => {
  it("limits attributed source excerpts to 500 characters", () => {
    const excerpt = createSourceExcerpt(`<p>${"evidence ".repeat(100)}</p>`);
    expect(excerpt).toBeDefined();
    expect(excerpt!.length).toBeLessThanOrEqual(500);
    expect(excerpt!.endsWith("…")).toBe(true);
  });

  it("rejects raw transcripts or article bodies hidden in metadata", () => {
    expect(() =>
      validateEvidenceDocument({
        identityKey: "huberman-episode:episode-1",
        sourceKey: "huberman-rss",
        externalId: "episode-1",
        documentType: "podcast_episode",
        canonicalUrl: "https://www.hubermanlab.com/episode/example",
        title: "Example",
        rightsMode: "metadata_only",
        metadata: { transcript: "copied third-party text" },
      })
    ).toThrow("Raw third-party content is not allowed");

    expect(() =>
      validateEvidenceDocument({
        identityKey: "pubmed:123",
        sourceKey: "pubmed-health",
        externalId: "123",
        documentType: "study",
        canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/123/",
        title: "Example study",
        rightsMode: "metadata_only",
        metadata: { payload: { abstract: "copied abstract" } },
      })
    ).toThrow("Raw third-party content is not allowed");

    expect(() =>
      validateEvidenceDocument({
        identityKey: "pubmed:456",
        sourceKey: "pubmed-health",
        externalId: "456",
        documentType: "study",
        canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/456/",
        title: "Another study",
        rightsMode: "metadata_only",
        metadata: { payload: { abstractText: "copied abstract" } },
      })
    ).toThrow("Raw third-party content is not allowed");
  });

  it("normalizes names and extracts credentials", () => {
    const person = parsePersonLabel("Dr. Ralph Adolphs, Ph.D.", "guest");
    expect(person).toMatchObject({
      displayName: "Ralph Adolphs",
      normalizedName: "ralph adolphs",
      credentials: ["PhD"],
    });
    expect(normalizePersonName("Professor Andrew D. Huberman, PhD")).toBe("andrew d huberman");
  });
});
