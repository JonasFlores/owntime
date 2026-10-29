import { describe, it, expect } from "vitest";
import { shiftMonth, monthRange } from "@/lib/tz";

describe("shiftMonth — used by both calendars for month navigation", () => {
  it("moves within a year", () => {
    expect(shiftMonth("2026-03-01".slice(0, 7), 1)).toBe("2026-04");
    expect(shiftMonth("2026-03", -1)).toBe("2026-02");
  });

  it("crosses year boundaries both ways", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("returns garbage untouched", () => {
    expect(shiftMonth("abc", 1)).toBe("abc");
  });
});

describe("monthRange", () => {
  it("computes day counts and starting weekday (0=Sun)", () => {
    expect(monthRange("2026-02").days).toBe(28);
    expect(monthRange("2024-02").days).toBe(29); // leap
    // 2026-02-01 was a Sunday
    expect(monthRange("2026-02").startDow).toBe(0);
    // 2026-05-01 was a Friday
    expect(monthRange("2026-05").startDow).toBe(5);
  });
});
