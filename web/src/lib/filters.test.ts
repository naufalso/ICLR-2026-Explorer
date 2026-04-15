import { describe, expect, it } from "vitest";

import { filterPapers, groupAgenda } from "./filters";
import { fixturePayload } from "../test/fixtures";

describe("filterPapers", () => {
  it("filters by search query, topic, date, and bookmark state", () => {
    const results = filterPapers(
      fixturePayload.papers,
      {
        query: "trustworthy planning",
        selectedTopics: ["Social Aspects->Trustworthy Machine Learning"],
        selectedDate: "2026-04-23",
        selectedSessionType: "Poster",
        bookmarkedOnly: true,
        scheduledOnly: true,
      },
      new Set(["p1"]),
    );

    expect(results.map((paper) => paper.paper_id)).toEqual(["p1"]);
  });
});

describe("groupAgenda", () => {
  it("groups scheduled papers by day and isolates unscheduled ones", () => {
    const agenda = groupAgenda(fixturePayload.papers);
    expect(agenda.scheduledGroups).toHaveLength(2);
    expect(agenda.scheduledGroups[0].papers[0].paper_id).toBe("p1");
    expect(agenda.unscheduled.map((paper) => paper.paper_id)).toEqual(["p3"]);
  });
});
