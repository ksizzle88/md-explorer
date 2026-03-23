import { describe, it, expect } from "vitest";

/**
 * Tests for the IMAGE_TRANSFORMER regex patterns used in editor.tsx.
 *
 * The transformer uses two regexes:
 *   importRegExp – matches image markdown anywhere in a line
 *   regExp       – matches image markdown at end of line (trigger-based)
 *
 * Bug: URLs containing balanced parentheses (common in Wikipedia links)
 * are truncated because [^)]+ stops at the first ")".
 */

// Fixed regexes — handles balanced parentheses in URLs (copied from editor.tsx)
const BUGGY_IMPORT = /!(?:\[([^\]]*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))/;
const BUGGY_INLINE = /!(?:\[([^\]]*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))$/;

describe("IMAGE_TRANSFORMER regex – parentheses in URLs", () => {
  const wikiUrl = "https://en.wikipedia.org/wiki/Markdown_(syntax)";

  it("importRegExp should capture a URL with balanced parentheses", () => {
    const md = `![Markdown](${wikiUrl})`;
    const m = md.match(BUGGY_IMPORT);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("Markdown");
    // This fails with the buggy regex — it captures up to the first ")"
    expect(m![2]).toBe(wikiUrl);
  });

  it("regExp (end-of-line) should capture a URL with balanced parentheses", () => {
    const md = `![Markdown](${wikiUrl})`;
    const m = md.match(BUGGY_INLINE);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("Markdown");
    expect(m![2]).toBe(wikiUrl);
  });

  it("should handle one level of balanced parentheses in URL", () => {
    const url = "https://example.com/path_(section)/page";
    const md = `![nested](${url})`;
    const m = md.match(BUGGY_IMPORT);
    expect(m).not.toBeNull();
    expect(m![2]).toBe(url);
  });

  it("should still work for simple URLs without parentheses", () => {
    const md = "![alt](https://example.com/image.png)";
    const m = md.match(BUGGY_IMPORT);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("alt");
    expect(m![2]).toBe("https://example.com/image.png");
  });

  it("should handle empty alt text", () => {
    const md = "![](https://example.com/image.png)";
    const m = md.match(BUGGY_IMPORT);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("");
    expect(m![2]).toBe("https://example.com/image.png");
  });

  it("should handle URL with spaces (non-standard but supported)", () => {
    const md = "![photo](my photo.png)";
    const m = md.match(BUGGY_IMPORT);
    expect(m).not.toBeNull();
    expect(m![2]).toBe("my photo.png");
  });
});

describe("IMAGE round-trip fidelity", () => {
  /** Simulate export → import cycle using the regex */
  function roundTrip(
    altText: string,
    src: string,
    importRegex: RegExp,
  ): { altText: string; src: string } | null {
    // Export (same logic as IMAGE_TRANSFORMER.export)
    const exported = `![${altText}](${src})`;
    const m = exported.match(importRegex);
    if (!m) return null;
    return { altText: m[1], src: m[2] };
  }

  it("round-trips a Wikipedia-style URL", () => {
    const result = roundTrip(
      "Markdown",
      "https://en.wikipedia.org/wiki/Markdown_(syntax)",
      BUGGY_IMPORT,
    );
    expect(result).not.toBeNull();
    expect(result!.src).toBe(
      "https://en.wikipedia.org/wiki/Markdown_(syntax)",
    );
  });

  it("round-trips a simple URL", () => {
    const result = roundTrip("img", "https://example.com/pic.png", BUGGY_IMPORT);
    expect(result).not.toBeNull();
    expect(result!.src).toBe("https://example.com/pic.png");
    expect(result!.altText).toBe("img");
  });
});
