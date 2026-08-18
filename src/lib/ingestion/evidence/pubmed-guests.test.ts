import { describe, expect, it, vi } from "vitest";
import { buildGuestAuthorQuery, fetchGuestPubMedEvidence } from "./pubmed-guests";
import { buildHubermanLabPubMedQuery } from "./huberman-lab";

describe("guest and lab PubMed discovery", () => {
  it("builds constrained author queries and excludes low-signal publication types", () => {
    expect(buildGuestAuthorQuery("Dr. Test [Guest]")).toContain('"Dr. Test Guest"[Author]');
    expect(buildGuestAuthorQuery("Test Guest")).toContain("Preprint[Publication Type]");
    expect(buildHubermanLabPubMedQuery()).toContain("Stanford[Affiliation]");
  });

  it("labels guest-author results as candidates and stores no abstract", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("esearch.fcgi")) {
        return Response.json({ esearchresult: { idlist: ["99"] } });
      }
      return Response.json({
        result: {
          uids: ["99"],
          "99": {
            title: "A candidate guest publication",
            authors: [{ name: "Guest T" }],
            pubtype: ["Journal Article"],
          },
        },
      });
    }) as typeof fetch;

    const batch = await fetchGuestPubMedEvidence({
      guests: [
        {
          displayName: "Test Guest",
          normalizedName: "test guest",
          credentials: ["PhD"],
          affiliations: [],
        },
      ],
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-18T00:00:00.000Z"),
      requestDelayMs: 0,
      fetchImpl,
    });

    expect(batch.documents[0]).toMatchObject({
      identityKey: "pubmed:99",
      sourceKey: "pubmed-guests",
      rightsMode: "metadata_only",
    });
    expect(batch.documents[0].metadata).not.toHaveProperty("abstract");
    expect(batch.people[0]).toMatchObject({
      normalizedName: "test guest",
      role: "author",
      matchStatus: "candidate",
    });
  });
});
