import { describe, expect, it } from "vitest";

import { formatPaperTitle } from "./title";

describe("formatPaperTitle", () => {
  it("converts common inline LaTeX math into readable text", () => {
    expect(
      formatPaperTitle(
        "$\\mathbf{Li_2}$: A Framework on Dynamics of Feature Emergence and Delayed Generalization",
      ),
    ).toBe("Li₂: A Framework on Dynamics of Feature Emergence and Delayed Generalization");

    expect(formatPaperTitle("$\\pi^3$: Permutation-Equivariant Visual Geometry Learning")).toBe(
      "π³: Permutation-Equivariant Visual Geometry Learning",
    );
  });

  it("leaves plain titles unchanged", () => {
    expect(formatPaperTitle("Trustworthy Agents for Long-Horizon Planning")).toBe(
      "Trustworthy Agents for Long-Horizon Planning",
    );
  });
});
