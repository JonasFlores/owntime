import { describe, it, expect } from "vitest";
import { normTime, isValidHM, isCoherentWindow } from "@/lib/time";

describe("normTime — the bug that broke weekly hours", () => {
  it("keeps HH:MM untouched", () => {
    expect(normTime("09:00")).toBe("09:00");
    expect(normTime("18:30")).toBe("18:30");
  });

  it("strips seconds from Postgres TIME strings (HH:MM:SS → HH:MM)", () => {
    expect(normTime("09:00:00")).toBe("09:00");
    expect(normTime("13:45:00")).toBe("13:45");
  });

  it("passes through anything else untouched", () => {
    expect(normTime("")).toBe("");
    expect(normTime("9")).toBe("9");
  });
});

describe("isValidHM", () => {
  it("accepts HH:MM only", () => {
    expect(isValidHM("08:15")).toBe(true);
    expect(isValidHM("09:00:00")).toBe(false); // seconds not accepted
    expect(isValidHM("")).toBe(false);
    expect(isValidHM("ab:cd")).toBe(false);
  });
});

describe("isCoherentWindow", () => {
  it("accepts a valid open window", () => {
    expect(isCoherentWindow("09:00", "18:00")).toBe(true);
    expect(isCoherentWindow("13:00", "13:01")).toBe(true);
  });

  it("rejects end-equal/start and inversions", () => {
    expect(isCoherentWindow("18:00", "18:00")).toBe(false);
    expect(isCoherentWindow("18:00", "09:00")).toBe(false);
  });

  it("rejects empty or malformed values", () => {
    expect(isCoherentWindow("", "18:00")).toBe(false);
    expect(isCoherentWindow("09:00", "18:00:00")).toBe(false);
  });
});
