import { describe, it, expect } from "vitest";
import { dict } from "@/lib/i18n";

const en = dict.en;
const pt = dict.pt;

describe("i18n dictionaries stay in sync", () => {
  it("pt covers every en key (and vice versa)", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it("holds no empty placeholders in either language", () => {
    for (const [k, v] of Object.entries(en)) expect(v.trim().length, `en.${k}`).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(pt)) expect(v.trim().length, `pt.${k}`).toBeGreaterThan(0);
  });

  it("exposes both languages through dict with the same shape", () => {
    expect(dict.en).toEqual(en);
    expect(dict.pt).toEqual(pt);
  });
});
