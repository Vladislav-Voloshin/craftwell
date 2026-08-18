import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanHtml, extractTopics, TOPIC_KEYWORDS } from "./shared";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/env", () => ({
  supabaseAdminEnv: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  })),
}));

describe("getSupabaseAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls createClient with URL and service role key from supabaseAdminEnv", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseAdmin } = await import("./shared");
    getSupabaseAdmin();
    expect(createClient).toHaveBeenCalledWith("https://test.supabase.co", "service-role-key");
  });

  it("returns a supabase client instance", async () => {
    const { getSupabaseAdmin } = await import("./shared");
    const client = getSupabaseAdmin();
    expect(client).toBeDefined();
    expect(client).toHaveProperty("from");
  });
});

describe("cleanHtml", () => {
  it("strips script tags and their content", () => {
    expect(cleanHtml('<p>Hello</p><script>alert("xss")</script>')).toBe("Hello");
  });

  it("strips style tags and their content", () => {
    expect(cleanHtml("<style>.red { color: red; }</style><p>Text</p>")).toBe("Text");
  });

  it("strips HTML tags", () => {
    expect(cleanHtml("<h1>Title</h1><p>Body</p>")).toBe("Title Body");
  });

  it("decodes HTML entities", () => {
    expect(cleanHtml("Tom &amp; Jerry &lt;3&gt; &quot;quoted&quot;")).toBe(
      'Tom & Jerry <3> "quoted"'
    );
  });

  it("decodes &nbsp; to space", () => {
    expect(cleanHtml("word&nbsp;word")).toBe("word word");
  });

  it("decodes &#39; to apostrophe", () => {
    expect(cleanHtml("it&#39;s")).toBe("it's");
  });

  it("collapses whitespace", () => {
    expect(cleanHtml("  hello   world  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(cleanHtml("")).toBe("");
  });

  it("handles nested tags", () => {
    expect(cleanHtml("<div><span><b>deep</b></span></div>")).toBe("deep");
  });

  it("handles multiline script tags", () => {
    const html = `<p>Before</p>
<script>
  const x = 1;
  console.log(x);
</script>
<p>After</p>`;
    expect(cleanHtml(html)).toBe("Before After");
  });
});

describe("TOPIC_KEYWORDS", () => {
  it("contains core science-based topics", () => {
    expect(TOPIC_KEYWORDS).toContain("sleep");
    expect(TOPIC_KEYWORDS).toContain("dopamine");
    expect(TOPIC_KEYWORDS).toContain("cold exposure");
    expect(TOPIC_KEYWORDS).toContain("supplements");
  });

  it("has no duplicate keywords", () => {
    expect(new Set(TOPIC_KEYWORDS).size).toBe(TOPIC_KEYWORDS.length);
  });
});

describe("extractTopics", () => {
  it("extracts matching topics from title and content", () => {
    const topics = extractTopics(
      "Better Sleep Protocol",
      "Use melatonin and control light exposure for circadian rhythm."
    );
    expect(topics).toContain("sleep");
    expect(topics).toContain("melatonin");
    expect(topics).toContain("light exposure");
    expect(topics).toContain("circadian");
  });

  it("is case-insensitive", () => {
    const topics = extractTopics("SLEEP Tips", "DOPAMINE regulation");
    expect(topics).toContain("sleep");
    expect(topics).toContain("dopamine");
  });

  it("returns empty array when no topics match", () => {
    const topics = extractTopics("Random Title", "Nothing relevant here.");
    expect(topics).toEqual([]);
  });

  it("extracts from title alone", () => {
    const topics = extractTopics("Cold Exposure Benefits", "");
    expect(topics).toContain("cold exposure");
  });

  it("extracts from content alone", () => {
    const topics = extractTopics("", "Creatine is one of the popular supplements.");
    expect(topics).toContain("creatine");
    expect(topics).toContain("supplements");
  });

  it("handles multi-word keywords", () => {
    const topics = extractTopics("", "resistance training and ice bath recovery");
    expect(topics).toContain("resistance training");
    expect(topics).toContain("ice bath");
  });
});
