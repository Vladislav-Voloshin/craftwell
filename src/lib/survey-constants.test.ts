import {
  HEALTH_GOALS,
  EXERCISE_OPTIONS,
  SUPPLEMENT_OPTIONS,
  FOCUS_AREAS,
} from "./survey-constants";

describe("survey constants", () => {
  describe("HEALTH_GOALS", () => {
    it("contains expected health goals", () => {
      expect(HEALTH_GOALS).toContain("Better Sleep");
      expect(HEALTH_GOALS).toContain("Longevity");
      expect(HEALTH_GOALS.length).toBe(8);
    });

    it("has no duplicates", () => {
      expect(new Set(HEALTH_GOALS).size).toBe(HEALTH_GOALS.length);
    });
  });

  describe("EXERCISE_OPTIONS", () => {
    it("has progressive frequency options", () => {
      expect(EXERCISE_OPTIONS[0]).toBe("Never");
      expect(EXERCISE_OPTIONS.length).toBe(4);
    });

    it("has no duplicates", () => {
      expect(new Set(EXERCISE_OPTIONS).size).toBe(EXERCISE_OPTIONS.length);
    });
  });

  describe("SUPPLEMENT_OPTIONS", () => {
    it("has progressive experience options", () => {
      expect(SUPPLEMENT_OPTIONS[0]).toBe("Never taken supplements");
      expect(SUPPLEMENT_OPTIONS[SUPPLEMENT_OPTIONS.length - 1]).toBe(
        "Advanced biohacker"
      );
      expect(SUPPLEMENT_OPTIONS.length).toBe(4);
    });
  });

  describe("FOCUS_AREAS", () => {
    it("contains key science-based focus areas", () => {
      expect(FOCUS_AREAS).toContain("Sleep");
      expect(FOCUS_AREAS).toContain("Cold/Heat Exposure");
      expect(FOCUS_AREAS).toContain("Light Optimization");
      expect(FOCUS_AREAS.length).toBe(10);
    });

    it("has no duplicates", () => {
      expect(new Set(FOCUS_AREAS).size).toBe(FOCUS_AREAS.length);
    });
  });
});
