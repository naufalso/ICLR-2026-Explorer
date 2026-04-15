import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ExplorerApp } from "./App";
import { fixturePayload } from "./test/fixtures";

describe("ExplorerApp", () => {
  it("restores a selected paper from the URL query param", () => {
    window.history.replaceState({}, "", "/?paper=p2");
    render(<ExplorerApp data={fixturePayload} />);
    expect(
      screen.getByRole("heading", {
        name: "Multimodal Memory for Conference Navigation",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("A paper about multimodal session memory.")).toBeInTheDocument();
  });

  it("persists bookmarks and shows them in the agenda", async () => {
    const user = userEvent.setup();
    render(<ExplorerApp data={fixturePayload} />);

    await user.click(screen.getAllByLabelText("Bookmark Trustworthy Agents for Long-Horizon Planning")[0]);
    await user.click(screen.getByRole("tab", { name: "Agenda" }));

    expect(screen.getByText("1 bookmarked papers in your local plan.")).toBeInTheDocument();
    expect(screen.getByText("Trustworthy Agents for Long-Horizon Planning")).toBeInTheDocument();
  });
});
