import { describe, expect, it } from "vitest";
import { parseHubermanPageMetadata, parseHubermanSitemap } from "./huberman-site";

describe("Huberman public sitemap metadata", () => {
  it("keeps relevant public URL metadata and ignores episode duplicates", () => {
    const documents = parseHubermanSitemap(`
      <urlset>
        <url><loc>https://www.hubermanlab.com/newsletter/toolkit-for-sleep</loc></url>
        <url><loc>https://www.hubermanlab.com/topics/mental-health</loc></url>
        <url><loc>https://www.hubermanlab.com/episode/example</loc></url>
        <url><loc>https://example.com/newsletter/not-ours</loc></url>
      </urlset>
    `);

    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      identityKey: "huberman-site:/newsletter/toolkit-for-sleep",
      documentType: "newsletter",
      rightsMode: "metadata_only",
    });
    expect(documents[0].sourceExcerpt).toBeUndefined();
  });

  it("extracts only title, structured dates and a bounded public meta excerpt", () => {
    const page = parseHubermanPageMetadata(`
      <html><head>
        <title>Sleep Hygiene</title>
        <meta content="A concise public summary about sleep and circadian health." name="description" />
        <script type="application/ld+json">
          {"@type":"CollectionPage","datePublished":"2026-06-10T21:03:22.876Z","dateModified":"2026-08-01T12:00:00.000Z","articleBody":"must never be parsed"}
        </script>
      </head></html>
    `);

    expect(page).toMatchObject({
      title: "Sleep Hygiene",
      sourceExcerpt: "A concise public summary about sleep and circadian health.",
      publishedAt: "2026-06-10T21:03:22.876Z",
      rightsMode: "short_excerpt",
      metadata: {
        sourceUpdatedAt: "2026-08-01T12:00:00.000Z",
        schemaType: "CollectionPage",
      },
    });
    expect(JSON.stringify(page)).not.toContain("must never be parsed");
  });
});
