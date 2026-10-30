import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schema = fs.readFileSync(path.resolve(process.cwd(), "supabase/schema.sql"), "utf8");

describe("database security contract", () => {
  it("does not restore anonymous direct appointment inserts", () => {
    expect(schema).not.toMatch(/create policy "appointments_guest_insert"/i);
  });

  it("limits the booking RPC to the service role", () => {
    expect(schema).toMatch(/revoke all on function public\.create_appointment[\s\S]+from public, anon, authenticated/i);
    expect(schema).toMatch(/grant execute on function public\.create_appointment[\s\S]+to service_role/i);
  });

  it("revalidates hours, grid and rate limits inside the transaction", () => {
    expect(schema).toContain("extract(epoch from (p_time::time - v_open_start))::int % 1800");
    expect(schema).toContain("booking_rate_limits");
    expect(schema).toContain("pg_advisory_xact_lock");
  });

  it("claims calendar jobs with a skip-locked lease", () => {
    expect(schema).toContain("for update skip locked");
    expect(schema).toContain("processing_started_at");
  });
});
