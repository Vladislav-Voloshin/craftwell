import { describe, expect, it } from "vitest";
import {
  buildPeerReviewedHealthQuery,
  buildPubMedSearchUrl,
  fetchRecentPubMedEvidence,
  parsePubMedSummaries,
} from "./pubmed";

describe("PubMed metadata ingestion", () => {
  it("builds a date-bounded E-utilities query with provenance parameters", () => {
    const url = new URL(
      buildPubMedSearchUrl({
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-18T00:00:00.000Z"),
        maxResults: 100,
        apiKey: "ncbi-key",
        contactEmail: "research@example.com",
      })
    );
    expect(url.searchParams.get("tool")).toBe("craftwell");
    expect(url.searchParams.get("email")).toBe("research@example.com");
    expect(url.searchParams.get("api_key")).toBe("ncbi-key");
    expect(url.searchParams.get("mindate")).toBe("2026/08/01");
    expect(url.searchParams.get("maxdate")).toBe("2026/08/18");
    expect(url.searchParams.get("term")).toContain("Randomized Controlled Trial[Publication Type]");
    expect(buildPeerReviewedHealthQuery()).toContain("Preprint[Publication Type]");
  });

  it("stores citation metadata but no abstract or article text", () => {
    const {
      documents: [document],
    } = parsePubMedSummaries({
      result: {
        uids: ["12345"],
        "12345": {
          uid: "12345",
          title: "Sleep &amp; circadian rhythm trial.",
          sortpubdate: "2026/08/12 00:00",
          fulljournalname: "Journal of Sleep",
          authors: [{ name: "A Researcher" }, { name: "B Scientist" }],
          articleids: [
            { idtype: "pubmed", value: "12345" },
            { idtype: "doi", value: "10.1000/example" },
          ],
          pubtype: ["Journal Article", "Randomized Controlled Trial"],
          lang: ["eng"],
        },
      },
    });

    expect(document).toMatchObject({
      identityKey: "pubmed:12345",
      sourceKey: "pubmed-health",
      externalId: "12345",
      canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345/",
      authors: ["A Researcher", "B Scientist"],
      pmid: "12345",
      doi: "10.1000/example",
      rightsMode: "metadata_only",
    });
    expect(document.sourceExcerpt).toBeUndefined();
    expect(document.metadata).not.toHaveProperty("abstract");
    expect(document.metadata).not.toHaveProperty("fullText");
    expect(document.metadata?.evidenceLevel).toBe("randomized_trial");
  });

  it("does not overstate a generic journal article as observational evidence", () => {
    const {
      documents: [document],
    } = parsePubMedSummaries({
      result: {
        uids: ["7"],
        "7": {
          title: "A journal article without a specific study design",
          pubtype: ["Journal Article"],
        },
      },
    });
    expect(document.metadata?.evidenceLevel).toBe("unknown");
  });

  it("batches large summary lookups to avoid oversized request URLs", async () => {
    const pmids = Array.from({ length: 205 }, (_, index) => String(index + 1));
    const summaryRequestSizes: number[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("esearch.fcgi")) {
        return Response.json({ esearchresult: { idlist: pmids } });
      }
      const ids = url.searchParams.get("id")?.split(",") ?? [];
      summaryRequestSizes.push(ids.length);
      return Response.json({ result: { uids: [] } });
    }) as typeof fetch;

    await fetchRecentPubMedEvidence({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-18T00:00:00.000Z"),
      maxResults: 500,
      requestDelayMs: 0,
      fetchImpl,
    });

    expect(summaryRequestSizes).toEqual([100, 100, 5]);
  });
});
