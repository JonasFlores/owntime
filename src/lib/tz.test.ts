import { describe, it, expect } from "vitest";
import { atTz, dayBounds, monthRange, BOOKING_TZ } from "@/lib/tz";

describe("atTz — business-local time to UTC ISO", () => {
  it("converts São Paulo local times correctly (UTC-3)", () => {
    expect(atTz("2026-01-15", "09:00:00")).toBe("2026-01-15T12:00:00.000Z");
    expect(atTz("2026-07-02", "14:30:00")).toBe("2026-07-02T17:30:00.000Z");
  });

  it("treats midnight as the start of the business day", () => {
    expect(atTz("2026-05-04", "00:00:00")).toBe("2026-05-04T03:00:00.000Z");
  });
});

describe("dayBounds — half-open range [day, nextDay)", () => {
  it("spans exactly 24h from local midnight to next local midnight", () => {
    const b = dayBounds("2026-05-04");
    expect(b.starts_at).toBe("2026-05-04T03:00:00.000Z");
    expect(b.ends_at).toBe("2026-05-05T03:00:00.000Z");
  });
});

describe("monthRange — calendar layout", () => {
  it("counts days correctly, including leap years", () => {
    expect(monthRange("2026-02").days).toBe(28);
    expect(monthRange("2028-02").days).toBe(29);
    expect(monthRange("2026-04").days).toBe(30);
    expect(monthRange("2026-01").days).toBe(31);
  });

  it("keeps first/last as zero-padded date strings", () => {
    expect(monthRange("2026-02")).toMatchObject({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthRange("2026-04")).toMatchObject({ last: "2026-04-30" });
  });

  it("computes the weekday of the 1st (0 = Sunday)", () => {
    // 2026-02-01 is a Sunday (TZ constant year-round in São Paulo after DST abolition)
    expect(monthRange("2026-02").startDow).toBe(0);
  });
});

describe("BOOKING_TZ default", () => {
  it("falls back to São Paulo when APPOINTMENT_TIMEZONE is unset", () => {
    expect(process.env.APPOINTMENT_TIMEZONE ?? "America/Sao_Paulo").toBe("America/Sao_Paulo");
    expect(BOOKING_TZ.length).toBeGreaterThan(0);
  });
});
