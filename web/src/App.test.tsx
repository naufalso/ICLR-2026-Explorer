import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App, ExplorerApp } from "./App";
import { bookmarkStorageKey, workshopBookmarkStorageKey } from "./lib/storage";
import { emptyWorkshopsPayload, fixturePayload, workshopFixturePayload } from "./test/fixtures";

vi.mock("react-window", () => ({
  List: ({
    className,
    rowComponent: Row,
    rowCount,
    rowProps,
    style,
  }: {
    className?: string;
    rowComponent: (props: {
      ariaAttributes: Record<string, unknown>;
      index: number;
      style: Record<string, unknown>;
    }) => ReactNode;
    rowCount: number;
    rowProps: Record<string, unknown>;
    style?: Record<string, unknown>;
  }) => (
    <div className={className} style={style}>
      {Array.from({ length: rowCount }).map((_, index) => (
        <div key={index}>
          {Row({
            ...rowProps,
            ariaAttributes: {
              "aria-posinset": index + 1,
              "aria-setsize": rowCount,
              role: "listitem",
            },
            index,
            style: { height: 238, top: index * 238 },
          })}
        </div>
      ))}
    </div>
  ),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ExplorerApp", () => {
  it("does not auto-open a selected paper panel by default and formats the generated timestamp", () => {
    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);

    expect(
      screen.queryByRole("heading", {
        name: "Trustworthy Agents for Long-Horizon Planning",
        level: 2,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Updated Apr 15, 2026, 11:56 AM UTC")).toBeInTheDocument();
  });


  it("does not reopen paper detail when search/filter interactions change results", async () => {
    const user = userEvent.setup();
    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);

    await user.click(screen.getByText("Trustworthy Agents for Long-Horizon Planning"));
    expect(
      screen.getByRole("heading", {
        name: "Trustworthy Agents for Long-Horizon Planning",
        level: 2,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("heading", {
        name: "Trustworthy Agents for Long-Horizon Planning",
        level: 2,
      }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search papers" }), "zzzz");
    await user.clear(screen.getByRole("searchbox", { name: "Search papers" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Session Type" }), "Poster");

    expect(
      screen.queryByRole("heading", {
        name: "Trustworthy Agents for Long-Horizon Planning",
        level: 2,
      }),
    ).not.toBeInTheDocument();
  });

  it("waits to apply search text until typing stops or Enter is pressed", async () => {
    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);

    const input = screen.getByRole("searchbox", { name: "Search papers" });
    fireEvent.change(input, { target: { value: "zzzz" } });

    expect(screen.queryByText("Try a broader filter combination.")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "trustworthy" } });
    expect(screen.queryByText("Trustworthy Agents for Long-Horizon Planning")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.queryByText("Try a broader filter combination.")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(screen.getByText("Try a broader filter combination.")).toBeInTheDocument();
  });

  it("restores URL-driven filters and selected paper from the query string", () => {
    window.history.replaceState(
      {},
      "",
      "/?q=multimodal&date=2026-04-24&sessionType=Oral&topics=Computer%20Vision-%3EVision%20Models%20%26%20Multimodal&scheduled=1&paper=p2",
    );

    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);

    expect(screen.getByDisplayValue("multimodal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fri, Apr 24")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Oral")).toBeInTheDocument();
    expect(screen.getByLabelText("Scheduled sessions only")).toBeChecked();
    expect(
      screen.getByRole("heading", {
        name: "Multimodal Memory for Conference Navigation",
        level: 2,
      }),
    ).toBeInTheDocument();
  });

  it("supports keyboard selection on paper cards", async () => {
    const user = userEvent.setup();
    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);

    const secondCardButton = screen
      .getByText("Multimodal Memory for Conference Navigation")
      .closest("button");

    expect(secondCardButton).not.toBeNull();
    secondCardButton?.focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("heading", {
        name: "Multimodal Memory for Conference Navigation",
        level: 2,
      }),
    ).toBeInTheDocument();
  });

  it("syncs the URL after agenda navigation and filter changes", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(bookmarkStorageKey(), JSON.stringify(["p1"]));

    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);

    await user.click(screen.getByRole("tab", { name: "Agenda" }));
    expect(window.location.search).toContain("view=agenda");

    await user.click(screen.getByRole("tab", { name: "Explore" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Session Type" }), "Poster");

    expect(window.location.search).toContain("sessionType=Poster");
    expect(window.location.search).not.toContain("view=agenda");
  });

  it("restores bookmarked papers in the agenda from local storage", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(bookmarkStorageKey(), JSON.stringify(["p1"]));

    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);
    await user.click(screen.getByRole("tab", { name: "Agenda" }));

    expect(screen.getByText("1 saved papers in your local plan.")).toBeInTheDocument();
    expect(screen.getByText("Trustworthy Agents for Long-Horizon Planning")).toBeInTheDocument();
  });

  it("opens agenda paper details in a modal without switching back to explore", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(bookmarkStorageKey(), JSON.stringify(["p1"]));

    render(<ExplorerApp data={fixturePayload} workshopsData={emptyWorkshopsPayload} />);
    await user.click(screen.getByRole("tab", { name: "Agenda" }));
    await user.click(screen.getByRole("button", { name: "View details" }));

    expect(window.location.search).toContain("view=agenda");
    expect(screen.getByRole("heading", { name: "Trustworthy Agents for Long-Horizon Planning", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agenda" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps workshops in a separate explorer lane with their own filters and details", async () => {
    const user = userEvent.setup();
    render(<ExplorerApp data={fixturePayload} workshopsData={workshopFixturePayload} />);

    await user.click(screen.getByRole("tab", { name: "Workshops" }));

    expect(screen.getByRole("searchbox", { name: "Search workshops" })).toBeInTheDocument();
    expect(screen.getByText("2 workshops in view.")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Room" }), "205");
    expect(screen.getByText("1 workshops in view.")).toBeInTheDocument();

    await user.click(screen.getByText("1st ICLR Workshop on Time Series in the Age of Large Models"));

    expect(
      screen.getByRole("heading", {
        name: "1st ICLR Workshop on Time Series in the Age of Large Models",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(window.location.search).toContain("content=workshops");
    expect(window.location.search).toContain("wroom=205");

    await user.click(screen.getByRole("button", { name: /save workshop 1st iclr workshop on time series/i }));
    expect(screen.getByRole("button", { name: "Export ICS" })).toBeEnabled();
    expect(window.localStorage.getItem(workshopBookmarkStorageKey())).toContain("w1");

    await user.click(screen.getByLabelText("Saved workshops only"));
    expect(window.location.search).toContain("wsaved=1");
  });
});

describe("App", () => {
  it("loads papers when workshops fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixturePayload,
      })
      .mockRejectedValueOnce(new Error("workshops request failed"));

    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByRole("tab", { name: "Explore" })).toBeInTheDocument();
    expect(screen.queryByText("Data Load Failed")).not.toBeInTheDocument();
  });
});
