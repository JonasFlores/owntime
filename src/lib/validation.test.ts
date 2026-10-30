import { describe, expect, it } from "vitest";
import { isIsoDate, isIsoMonth, normalizePhone } from "@/lib/validation";

describe("calendar input validation", () => {
  it.each(["2024-02-29", "2026-01-01", "2099-12-31"])("accepts real date %s", (date) => {
    expect(isIsoDate(date)).toBe(true);
  });

  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "26-01-01", ""])(
    "rejects invalid date %s",
    (date) => expect(isIsoDate(date)).toBe(false),
  );

  it("validates month boundaries", () => {
    expect(isIsoMonth("2026-01")).toBe(true);
    expect(isIsoMonth("2026-12")).toBe(true);
    expect(isIsoMonth("2026-00")).toBe(false);
    expect(isIsoMonth("2026-13")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("keeps an international prefix and strips presentation characters", () => {
    expect(normalizePhone(" +55 (11) 99999-0000 ")).toBe("+5511999990000");
  });

  it("normalizes equivalent local formats to the same key", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe(normalizePhone("11 99999 0000"));
  });
});
