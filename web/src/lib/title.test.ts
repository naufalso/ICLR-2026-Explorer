import { describe, expect, it } from "vitest";

import { formatPaperAbstract, formatPaperTitle } from "./title";

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

  it("converts common abstract LaTeX into readable plain text", () => {
    expect(
      formatPaperAbstract(
        "We propose \\ours{}, with \\underline{\\textbf{L}}azy learning and an energy $\\mathcal{E}$ over $\\ell_1$ features with $\\partial^\\infty$ smoothness.",
      ),
    ).toBe("We propose ours, with Lazy learning and an energy E over ℓ₁ features with ∂∞ smoothness.");

    expect(
      formatPaperAbstract(
        "The method improves performance by $5 \\times$ and uses \\texttt{LlamaAttention} with \\emph{backpropagated gradient} signals.",
      ),
    ).toBe(
      "The method improves performance by 5 × and uses LlamaAttention with backpropagated gradient signals.",
    );
  });
});
