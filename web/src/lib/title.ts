const INLINE_MATH_PATTERN = /\$\$?([^$]+?)\$\$?/g;
const FORMAT_COMMAND_PATTERN =
  /\\(?:mathbf|mathrm|mathit|mathsf|mathcal|mathbb|mathfrak|boldsymbol|operatorname|text|textrm|textbf|textit|textnormal|textsc|emph|underline)\{([^{}]+)\}/g;

const GREEK_MAP: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

const COMMAND_SYMBOL_MAP: Record<string, string> = {
  approx: "≈",
  cdot: "·",
  delta: "δ",
  ell: "ℓ",
  epsilon: "ϵ",
  eta: "η",
  gamma: "γ",
  geq: "≥",
  in: "∈",
  infty: "∞",
  lambda: "λ",
  leq: "≤",
  log: "log",
  max: "max",
  min: "min",
  mu: "μ",
  nu: "ν",
  omega: "ω",
  partial: "∂",
  pi: "π",
  rightarrow: "→",
  sigma: "σ",
  sim: "∼",
  sqrt: "√",
  sum: "Σ",
  tau: "τ",
  theta: "θ",
  tilde: "~",
  times: "×",
  to: "→",
  varepsilon: "ε",
  widetilde: "~",
  zeta: "ζ",
  ...GREEK_MAP,
};

const SUPERSCRIPT_MAP: Record<string, string> = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  "∞": "∞",
  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  0: "₀",
  1: "₁",
  2: "₂",
  3: "₃",
  4: "₄",
  5: "₅",
  6: "₆",
  7: "₇",
  8: "₈",
  9: "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

export function formatPaperTitle(title: string): string {
  return title
    .replace(INLINE_MATH_PATTERN, (_match, inlineMath) => normalizeInlineMath(inlineMath))
    .replace(/\s+/g, " ")
    .trim();
}

export function formatPaperAbstract(abstract: string): string {
  let normalized = abstract
    .replace(INLINE_MATH_PATTERN, (_match, inlineMath) => normalizeInlineMath(inlineMath))
    .replace(/\\href\{[^{}]*\}\{([^{}]+)\}/g, "$1")
    .replace(/\\url\{([^{}]+)\}/g, "$1")
    .replace(/\\cite[a-zA-Z]*\{[^{}]*\}/g, "")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\([A-Za-z]+)\{\}/g, (_match, command) => COMMAND_SYMBOL_MAP[command] ?? command);

  while (FORMAT_COMMAND_PATTERN.test(normalized)) {
    FORMAT_COMMAND_PATTERN.lastIndex = 0;
    normalized = normalized.replace(FORMAT_COMMAND_PATTERN, "$1");
  }

  return normalized
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\\([A-Za-z]+)\{([^{}]+)\}/g, (_match, command, content) => {
      if (command === "tilde" || command === "widetilde") {
        return `${content}~`;
      }
      return content || (COMMAND_SYMBOL_MAP[command] ?? command);
    })
    .replace(/\\([A-Za-z]+)\b/g, (_match, command) => COMMAND_SYMBOL_MAP[command] ?? command)
    .replace(/\*\*_([^*_]+)_\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s([,.;:)])/g, "$1")
    .replace(/[(]\s+/g, "(")
    .trim();
}

function normalizeInlineMath(value: string): string {
  let normalized = value.trim();

  while (FORMAT_COMMAND_PATTERN.test(normalized)) {
    FORMAT_COMMAND_PATTERN.lastIndex = 0;
    normalized = normalized.replace(FORMAT_COMMAND_PATTERN, "$1");
  }

  normalized = normalized
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\\([A-Za-z]+)\b/g, (_match, command) => COMMAND_SYMBOL_MAP[command] ?? command)
    .replace(/\^\{([^{}]+)\}|\^([A-Za-z0-9+\-=()∞])/g, (_match, braced, bare) =>
      translateScript(braced ?? bare, SUPERSCRIPT_MAP),
    )
    .replace(/_\{([^{}]+)\}|_([A-Za-z0-9+\-=()])/g, (_match, braced, bare) =>
      translateScript(braced ?? bare, SUBSCRIPT_MAP),
    )
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function translateScript(value: string, charMap: Record<string, string>): string {
  return Array.from(value)
    .map((char) => charMap[char] ?? char)
    .join("");
}
