import { describe, it, expect } from "vitest";
import { normTime, isValidHM, isCoherentWindow, rangesOverlap, resolveAppointmentWindow, sameInstant } from "@/lib/time";

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
    expect(isValidHM("23:59")).toBe(true);
    expect(isValidHM("24:00")).toBe(false);
    expect(isValidHM("09:60")).toBe(false);
    expect(isValidHM("99:99")).toBe(false);
  });
});

describe("resolveAppointmentWindow", () => {
  it("keeps a coherent explicit end on the same date", () => {
    expect(resolveAppointmentWindow("2026-10-30", "09:00", "10:00")).toEqual({
      startDate: "2026-10-30",
      endDate: "2026-10-30",
      start: "09:00",
      end: "10:00",
    });
  });

  it("rolls only the end into the next day when duration crosses midnight", () => {
    expect(resolveAppointmentWindow("2026-10-30", "23:30", "", 60)).toEqual({
      startDate: "2026-10-30",
      endDate: "2026-10-31",
      start: "23:30",
      end: "00:30",
    });
  });

  it("rejects impossible or inverted explicit windows", () => {
    expect(resolveAppointmentWindow("2026-10-30", "25:00", "", 60)).toBeNull();
    expect(resolveAppointmentWindow("2026-10-30", "18:00", "09:00", 60)).toBeNull();
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

describe("timestamp ranges", () => {
  it("does not overlap ranges that only touch at a day boundary", () => {
    expect(
      rangesOverlap(
        "2026-10-29T03:00:00.000Z",
        "2026-10-30T03:00:00.000Z",
        "2026-10-30T03:00:00+00:00",
        "2026-10-31T03:00:00+00:00",
      ),
    ).toBe(false);
  });

  it("recognizes a real overlap and equivalent UTC formats", () => {
    expect(
      rangesOverlap(
        "2026-10-30T03:00:00.000Z",
        "2026-10-31T03:00:00.000Z",
        "2026-10-30T12:00:00+00:00",
        "2026-10-30T13:00:00+00:00",
      ),
    ).toBe(true);
    expect(sameInstant("2026-10-30T03:00:00.000Z", "2026-10-30T03:00:00+00:00")).toBe(true);
  });
});
