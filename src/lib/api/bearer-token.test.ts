import { describe, expect, it } from "vitest";
import { hasValidBearerToken } from "./bearer-token";

describe("hasValidBearerToken", () => {
  it("accepts only an exact bearer credential", () => {
    expect(hasValidBearerToken("Bearer a-secure-secret", "a-secure-secret")).toBe(true);
    expect(hasValidBearerToken("Bearer wrong", "a-secure-secret")).toBe(false);
    expect(hasValidBearerToken("Basic a-secure-secret", "a-secure-secret")).toBe(false);
    expect(hasValidBearerToken(null, "a-secure-secret")).toBe(false);
  });
});
