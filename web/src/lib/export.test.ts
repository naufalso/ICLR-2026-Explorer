import { describe, expect, it } from "vitest";

import { buildCsv, buildIcs, buildWorkshopIcs } from "./export";
import { fixturePayload, workshopFixturePayload } from "../test/fixtures";

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

describe("buildWorkshopIcs", () => {
  it("exports scheduled workshops as calendar events", () => {
    const result = buildWorkshopIcs(workshopFixturePayload.workshops);
    expect(result.content).toContain("BEGIN:VEVENT");
    expect(result.content).toContain("SUMMARY:1st ICLR Workshop on Time Series in the Age of Large Models");
    expect(result.content).toContain("Workshop URL: https://example.test/workshop/w1");
    expect(result.skippedCount).toBe(0);
  });
});
