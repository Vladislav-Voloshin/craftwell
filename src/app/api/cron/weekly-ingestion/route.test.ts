import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runWeeklyEvidenceIngestion } = vi.hoisted(() => ({
  runWeeklyEvidenceIngestion: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  cronEnv: () => ({ CRON_SECRET: "0123456789abcdef" }),
}));

vi.mock("@/lib/ingestion/evidence/weekly", () => ({
  runWeeklyEvidenceIngestion,
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

import { GET } from "./route";

describe("weekly ingestion cron route", () => {
  beforeEach(() => {
    runWeeklyEvidenceIngestion.mockReset();
  });

  it("rejects requests without the Vercel cron secret", async () => {
    const response = await GET(
      new NextRequest("https://craftwell.vercel.app/api/cron/weekly-ingestion")
    );
    expect(response.status).toBe(401);
    expect(runWeeklyEvidenceIngestion).not.toHaveBeenCalled();
  });

  it("runs the weekly pipeline for an authenticated cron request", async () => {
    runWeeklyEvidenceIngestion.mockResolvedValue({
      ok: true,
      status: "succeeded",
      startedAt: "2026-08-18T10:00:00.000Z",
      completedAt: "2026-08-18T10:00:01.000Z",
      sources: [],
    });
    const response = await GET(
      new NextRequest("https://craftwell.vercel.app/api/cron/weekly-ingestion", {
        headers: {
          authorization: "Bearer 0123456789abcdef",
          "x-request-id": "cron-test",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(runWeeklyEvidenceIngestion).toHaveBeenCalledWith({
      trigger: "cron",
      requestId: "cron-test",
    });
  });
});
