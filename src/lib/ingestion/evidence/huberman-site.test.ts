import { describe, expect, it } from "vitest";
import { parseHubermanSitemap } from "./huberman-site";

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
});
