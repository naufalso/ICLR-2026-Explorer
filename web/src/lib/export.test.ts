import { describe, expect, it } from "vitest";

import { buildCsv, buildIcs } from "./export";
import { fixturePayload } from "../test/fixtures";

describe("buildCsv", () => {
  it("keeps the canonical column order in the export", () => {
    const csv = buildCsv(fixturePayload.columns, fixturePayload.papers.slice(0, 1));
    expect(csv.startsWith(fixturePayload.columns.join(","))).toBe(true);
    expect(csv).toContain("Trustworthy Agents for Long-Horizon Planning");
  });
});

describe("buildIcs", () => {
  it("includes only scheduled papers and reports skipped unscheduled items", () => {
    const result = buildIcs(fixturePayload.papers);
    expect(result.content).toContain("BEGIN:VEVENT");
    expect(result.content).toContain("SUMMARY:Trustworthy Agents for Long-Horizon Planning");
    expect(result.content).not.toContain("Schedule Missing Paper");
    expect(result.skippedCount).toBe(1);
  });
});
