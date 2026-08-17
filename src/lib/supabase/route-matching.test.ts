import { describe, it, expect } from "vitest";
import { isPublicRoute } from "./route-matching";

describe("isPublicRoute", () => {
  it("allows the home page", () => {
    expect(isPublicRoute("/")).toBe(true);
  });

  it("allows /auth and sub-routes", () => {
    expect(isPublicRoute("/auth")).toBe(true);
    expect(isPublicRoute("/auth/callback")).toBe(true);
    expect(isPublicRoute("/auth/confirm")).toBe(true);
  });

  it("allows /protocols and sub-routes", () => {
    expect(isPublicRoute("/protocols")).toBe(true);
    expect(isPublicRoute("/protocols/sleep-optimization")).toBe(true);
  });

  it("allows public marketing and offline routes", () => {
    expect(isPublicRoute("/pricing")).toBe(true);
    expect(isPublicRoute("/privacy")).toBe(true);
    expect(isPublicRoute("/terms")).toBe(true);
    expect(isPublicRoute("/offline")).toBe(true);
    expect(isPublicRoute("/sw.js")).toBe(true);
  });

  it("allows anonymous and provider-authenticated API endpoints", () => {
    expect(isPublicRoute("/api/health")).toBe(true);
    expect(isPublicRoute("/api/waitlist")).toBe(true);
    expect(isPublicRoute("/api/stripe/webhook")).toBe(true);
    expect(isPublicRoute("/api/revenuecat/webhook")).toBe(true);
  });

  it("blocks authenticated-only routes", () => {
    expect(isPublicRoute("/dashboard")).toBe(false);
    expect(isPublicRoute("/profile")).toBe(false);
    expect(isPublicRoute("/onboarding")).toBe(false);
    expect(isPublicRoute("/chat")).toBe(false);
  });

  it("blocks API routes", () => {
    expect(isPublicRoute("/api/chat")).toBe(false);
    expect(isPublicRoute("/api/search")).toBe(false);
    expect(isPublicRoute("/api/stripe/checkout")).toBe(false);
    expect(isPublicRoute("/api/stripe/portal")).toBe(false);
    expect(isPublicRoute("/api/waitlist/admin")).toBe(false);
  });

  it("allows static files (robots.txt, sitemap.xml, manifest.json)", () => {
    expect(isPublicRoute("/robots.txt")).toBe(true);
    expect(isPublicRoute("/sitemap.xml")).toBe(true);
    expect(isPublicRoute("/manifest.json")).toBe(true);
    expect(isPublicRoute("/favicon.ico")).toBe(true);
  });
});
