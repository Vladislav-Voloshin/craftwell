import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runWeeklyEvidenceIngestion, checkIpRateLimit, ingestionEnv } = vi.hoisted(() => ({
  runWeeklyEvidenceIngestion: vi.fn(),
  checkIpRateLimit: vi.fn(() => null),
  ingestionEnv: vi.fn(() => ({ ADMIN_API_KEY: "0123456789abcdef" })),
}));

vi.mock("@/lib/env", () => ({
  ingestionEnv,
}));
vi.mock("@/lib/api/rate-limit", () => ({ checkIpRateLimit }));
vi.mock("@/lib/ingestion/evidence/weekly", () => ({
  runWeeklyEvidenceIngestion,
}));
vi.mock("@/lib/ingestion/podcast-scraper", () => ({
  runPodcastScraper: vi.fn(),
}));
vi.mock("@/lib/ingestion/embed-pipeline", () => ({
  runFullEmbeddingPipeline: vi.fn(),
}));
vi.mock("@/lib/ingestion/protocol-extractor", () => ({
  runProtocolExtraction: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: {
    child: () => ({ info: vi.fn(), error: vi.fn() }),
  },
}));

import { POST } from "./route";

function request(body: unknown, authorized = true): NextRequest {
  return new NextRequest("https://craftwell.vercel.app/api/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? { authorization: "Bearer 0123456789abcdef" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("admin ingestion route", () => {
  beforeEach(() => {
    runWeeklyEvidenceIngestion.mockReset();
    checkIpRateLimit.mockReset();
    checkIpRateLimit.mockReturnValue(null);
    ingestionEnv.mockReset();
    ingestionEnv.mockReturnValue({ ADMIN_API_KEY: "0123456789abcdef" });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await POST(request({ step: "weekly-evidence" }, false));
    expect(response.status).toBe(401);
    expect(runWeeklyEvidenceIngestion).not.toHaveBeenCalled();
  });

  it("fails closed when admin authentication is not configured", async () => {
    ingestionEnv.mockImplementation(() => {
      throw new Error("missing ADMIN_API_KEY");
    });

    const response = await POST(request({ step: "weekly-evidence" }, false));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runWeeklyEvidenceIngestion).not.toHaveBeenCalled();
  });

  it("rejects unknown or malformed steps", async () => {
    const response = await POST(request({ step: "copy-all-transcripts" }));
    expect(response.status).toBe(400);
    expect(runWeeklyEvidenceIngestion).not.toHaveBeenCalled();
  });

  it("keeps unlicensed transcript ingestion disabled", async () => {
    const response = await POST(request({ step: "chunk-podcasts" }));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("licensed or user-provided"),
    });
  });

  it("runs the provenance-safe weekly pipeline", async () => {
    runWeeklyEvidenceIngestion.mockResolvedValue({
      ok: true,
      status: "succeeded",
      startedAt: "2026-08-18T10:00:00.000Z",
      completedAt: "2026-08-18T10:00:01.000Z",
      sources: [],
    });
    const response = await POST(request({ step: "weekly-evidence" }));

    expect(response.status).toBe(200);
    expect(runWeeklyEvidenceIngestion).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "manual" })
    );
  });
});
