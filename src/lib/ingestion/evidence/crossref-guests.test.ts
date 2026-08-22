import { describe, expect, it, vi } from "vitest";
import {
  buildCrossrefGuestUrl,
  fetchGuestCrossrefEvidence,
  parseCrossrefWork,
} from "./crossref-guests";
import type { GuestResearchCandidate } from "./types";

const guest: GuestResearchCandidate = {
  displayName: "Ralph Adolphs",
  normalizedName: "ralph adolphs",
  credentials: ["PhD"],
  affiliations: ["Caltech"],
};

const work = {
  DOI: "10.1000/Example",
  title: ["A study of emotion"],
  author: [
    {
      given: "Ralph",
      family: "Adolphs",
      ORCID: "https://orcid.org/0000-0002-1234-567X",
      "authenticated-orcid": true,
      affiliation: [{ name: "California Institute of Technology" }],
    },
  ],
  "published-online": { "date-parts": [[2026, 4, 22]] },
  type: "journal-article",
  "container-title": ["Nature Mental Health"],
  publisher: "Example Publisher",
  URL: "https://doi.org/10.1000/Example",
  subject: ["Neuroscience"],
  "is-referenced-by-count": 4,
};

describe("Crossref guest metadata adapter", () => {
  it("builds a bounded author and date query", () => {
    const url = new URL(
      buildCrossrefGuestUrl({
        guest: guest.displayName,
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-08-18T00:00:00.000Z"),
        rows: 20,
        cursor: "*",
        contactEmail: "operator@example.com",
      })
    );
    expect(url.searchParams.get("query.author")).toBe("Ralph Adolphs");
    expect(url.searchParams.get("filter")).toBe(
      "from-pub-date:2026-01-01,until-pub-date:2026-08-18"
    );
    expect(url.searchParams.get("rows")).toBe("20");
    expect(url.searchParams.get("mailto")).toBe("operator@example.com");
    expect(url.searchParams.has("sort")).toBe(false);
    expect(url.searchParams.has("order")).toBe(false);
  });

  it("stores only bibliographic metadata and keeps the author link as a candidate", () => {
    const parsed = parseCrossrefWork(work, guest);
    expect(parsed).toMatchObject({
      document: {
        identityKey: "doi:10.1000/example",
        documentType: "publication",
        doi: "10.1000/example",
        rightsMode: "metadata_only",
      },
      person: {
        normalizedName: "ralph adolphs",
        matchStatus: "candidate",
      },
    });
    expect(parsed?.document.sourceExcerpt).toBeUndefined();
    expect(Object.keys(parsed?.document.metadata ?? {})).not.toContain("abstract");
    expect(parsed?.personSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "publication_profile",
          url: "https://orcid.org/0000-0002-1234-567X",
          verified: false,
        }),
      ])
    );
  });

  it("rejects records whose returned author list does not match the guest", () => {
    expect(
      parseCrossrefWork({ ...work, author: [{ given: "Different", family: "Researcher" }] }, guest)
    ).toBeNull();
  });

  it("collects exact matches and reports source provenance", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: { items: [work], "total-results": 1 } })
    ) as typeof fetch;
    const batch = await fetchGuestCrossrefEvidence({
      guests: [guest],
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-08-18T00:00:00.000Z"),
      fetchImpl,
      requestDelayMs: 0,
    });
    expect(batch.documents).toHaveLength(1);
    expect(batch.people).toHaveLength(1);
    expect(batch.errors).toEqual([]);
    expect(batch.metadata).toMatchObject({ guestCount: 1, failedGuests: 0 });
  });
});
