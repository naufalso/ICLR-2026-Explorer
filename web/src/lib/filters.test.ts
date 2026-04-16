import { describe, expect, it } from "vitest";

import { filterPapers, filterWorkshops, groupAgenda } from "./filters";
import { fixturePayload, workshopFixturePayload } from "../test/fixtures";

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

describe("filterWorkshops", () => {
  it("filters by search query, day, room, and saved state", () => {
    const results = filterWorkshops(
      workshopFixturePayload.workshops,
      {
        query: "time series",
        selectedDate: "2026-04-26",
        selectedRoom: "205",
        savedOnly: true,
        scheduledOnly: true,
      },
      new Set(["w1"]),
    );

    expect(results.map((workshop) => workshop.workshop_id)).toEqual(["w1"]);
  });
});
