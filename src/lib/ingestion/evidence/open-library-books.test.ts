import { describe, expect, it, vi } from "vitest";
import {
  buildOpenLibrarySearchUrl,
  extractCandidateIsbns,
  fetchOpenLibraryBookEvidence,
  normalizeIsbn,
} from "./open-library-books";

describe("Open Library book metadata adapter", () => {
  it("matches a cited ISBN and stores bibliographic metadata only", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe("https://openlibrary.org/search.json");
      expect(url.searchParams.get("q")).toBe("isbn:(0596156715)");
      expect(url.searchParams.get("fields")).not.toContain("description");
      expect(url.searchParams.get("sort")).toBe("key");
      expect(String((init?.headers as Record<string, string>)["User-Agent"])).toContain(
        "operator@example.com"
      );
      return Response.json({
        docs: [
          {
            key: "/works/OL123W",
            title: "Example Book",
            author_name: ["Example Author"],
            first_publish_year: 2009,
            isbn: ["0596156715", "9780596156718"],
            publisher: ["Example Publisher"],
            edition_key: ["OL456M"],
            language: ["eng"],
            description: "This must never be retained.",
          },
        ],
      });
    }) as typeof fetch;

    const batch = await fetchOpenLibraryBookEvidence({
      references: [
        {
          identityKey: "book:amazon:0596156715",
          canonicalUrl: "https://www.amazon.com/dp/0596156715",
          title: "Episode link label",
        },
      ],
      now: new Date("2026-08-22T12:00:00.000Z"),
      contactEmail: "operator@example.com",
      requestDelayMs: 0,
      fetchImpl,
    });

    expect(batch).toMatchObject({
      sourceKey: "books-catalog",
      cursor: "2026-08-22T12:00:00.000Z",
      errors: [],
      metadata: { requestedReferences: 1, requestedIsbns: 1, matchedBooks: 1, requestCount: 1 },
    });
    expect(batch.documents[0]).toMatchObject({
      identityKey: "book:amazon:0596156715",
      sourceKey: "books-catalog",
      documentType: "book",
      canonicalUrl: "https://openlibrary.org/works/OL123W",
      title: "Example Book",
      publishedAt: "2009-01-01T00:00:00.000Z",
      authors: ["Example Author"],
      rightsMode: "metadata_only",
      metadata: {
        matchedIsbn: "0596156715",
        isbn: ["0596156715", "9780596156718"],
        publishers: ["Example Publisher"],
        editionKeys: ["OL456M"],
        languages: ["eng"],
      },
    });
    expect(batch.documents[0].metadata).not.toHaveProperty("description");
    expect(JSON.stringify(batch)).not.toContain("This must never be retained");
  });

  it("does not call the API for Kindle ASINs or invalid ISBNs", async () => {
    const fetchImpl = vi.fn();
    const batch = await fetchOpenLibraryBookEvidence({
      references: [
        {
          identityKey: "book:amazon:b012345678",
          canonicalUrl: "https://www.amazon.com/dp/B012345678",
          title: "Kindle title",
        },
        {
          identityKey: "book:amazon:1234567890",
          canonicalUrl: "https://www.amazon.com/dp/1234567890",
          title: "Invalid ISBN",
        },
      ],
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(batch.documents).toEqual([]);
    expect(batch.metadata).toMatchObject({ requestedReferences: 0, requestCount: 0 });
  });

  it("normalizes and validates ISBN-10 and ISBN-13 values", () => {
    expect(normalizeIsbn("0-596-15671-5")).toBe("0596156715");
    expect(normalizeIsbn("978-0-596-15671-8")).toBe("9780596156718");
    expect(normalizeIsbn("1234567890")).toBeNull();
    expect(
      extractCandidateIsbns({
        identityKey: "doi:10.1000/book",
        canonicalUrl: "https://doi.org/10.1000/book",
        title: "Book",
        metadata: { isbn: ["0-596-15671-5", "invalid"] },
      })
    ).toEqual(["0596156715"]);
  });

  it("builds a bounded ISBN batch query", () => {
    const url = new URL(buildOpenLibrarySearchUrl(["0596156715", "9780596156718"]));
    expect(url.searchParams.get("q")).toBe("isbn:(0596156715 OR 9780596156718)");
    expect(url.searchParams.get("sort")).toBe("key");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("selects and fingerprints matches deterministically", async () => {
    const responseDocuments = [
      {
        key: "/works/OL200W",
        title: "Later Work",
        author_name: ["Zed Author", "Ada Author"],
        first_publish_year: 2010,
        isbn: ["9780596156718", "0596156715"],
        publisher: ["Zed Publisher", "Alpha Publisher"],
        edition_key: ["OL900M", "OL800M"],
        language: ["spa", "eng"],
      },
      {
        key: "/works/OL100W",
        title: "Canonical Work",
        author_name: ["Zed Author", "Ada Author"],
        first_publish_year: 2009,
        isbn: ["9780596156718", "0596156715"],
        publisher: ["Zed Publisher", "Alpha Publisher"],
        edition_key: ["OL900M", "OL800M"],
        language: ["spa", "eng"],
      },
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ docs: responseDocuments }))
      .mockResolvedValueOnce(
        Response.json({
          docs: responseDocuments
            .toReversed()
            .map((document) =>
              Object.fromEntries(
                Object.entries(document).map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.toReversed() : value,
                ])
              )
            ),
        })
      ) as typeof fetch;
    const options = {
      references: [
        {
          identityKey: "book:amazon:0596156715",
          canonicalUrl: "https://www.amazon.com/dp/0596156715",
          title: "Episode link label",
        },
      ],
      now: new Date("2026-08-22T12:00:00.000Z"),
      requestDelayMs: 0,
      fetchImpl,
    };

    const first = await fetchOpenLibraryBookEvidence(options);
    const second = await fetchOpenLibraryBookEvidence(options);

    expect(second.documents).toEqual(first.documents);
    expect(first.documents[0]).toMatchObject({
      canonicalUrl: "https://openlibrary.org/works/OL100W",
      title: "Canonical Work",
      authors: ["Ada Author", "Zed Author"],
      metadata: {
        isbn: ["0596156715", "9780596156718"],
        publishers: ["Alpha Publisher", "Zed Publisher"],
        editionKeys: ["OL800M", "OL900M"],
        languages: ["eng", "spa"],
      },
    });
  });
});
