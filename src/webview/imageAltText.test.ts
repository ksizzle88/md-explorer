import { describe, it, expect } from "vitest";
import { escapeImageAltText, unescapeImageAltText } from "./imageUtils";

/**
 * Tests for image alt text containing special markdown characters.
 *
 * Bug: The IMAGE_TRANSFORMER exports alt text verbatim, so characters
 * like `]` break the markdown syntax.  For example, an image with
 * alt text "array[0]" exports as `![array[0]](url)` which fails
 * to re-import because the regex `[^\]]*` stops at the first `]`.
 *
 * The fix: escape `[` and `]` in alt text on export, and handle
 * the backslash escapes on import.
 */

// Aliases for readability
const escapeAltText = escapeImageAltText;
const unescapeAltText = unescapeImageAltText;

// Current (buggy) behavior: no escaping
function escapeAltTextBuggy(alt: string): string {
  return alt;
}

// Current (buggy) regex from editor.tsx — cannot handle escaped brackets
const BUGGY_IMPORT_RE = /!(?:\[([^\]]*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))/;

// Fixed regex — allows backslash-escaped characters inside alt text
const FIXED_IMPORT_RE = /!(?:\[((?:[^\]\\]|\\.)*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))/;

function roundTrip(
  alt: string,
  src: string,
  escape: (s: string) => string,
  regex: RegExp,
  unescape: (s: string) => string,
): { altText: string; src: string } | null {
  const exported = `![${escape(alt)}](${src})`;
  const m = exported.match(regex);
  if (!m) return null;
  return { altText: unescape(m[1]), src: m[2] };
}

// ─── RED: demonstrate the bug ──────────────────────────────────

describe("BUG: alt text with ] breaks round-trip (current behavior)", () => {
  it("fails to re-import alt text containing ]", () => {
    const md = "![array[0]](https://example.com/img.png)";
    const m = md.match(BUGGY_IMPORT_RE);
    // The buggy regex stops at the first ] — it captures "array[0" and
    // then can't match the rest properly.  This means the round-trip is broken.
    // If the match succeeds at all, the captured alt text is wrong.
    if (m) {
      // It matches but captures the wrong alt text
      expect(m[1]).not.toBe("array[0]");
    }
    // Either way, a proper round-trip fails:
    const result = roundTrip(
      "array[0]",
      "https://example.com/img.png",
      escapeAltTextBuggy,
      BUGGY_IMPORT_RE,
      (s) => s,
    );
    // Result is null (no match) or has wrong alt text
    expect(
      result === null || result.altText !== "array[0]",
    ).toBe(true);
  });
});

// ─── GREEN: verify the fix ─────────────────────────────────────

describe("FIX: escape/unescape alt text for round-trip fidelity", () => {
  it("escapeAltText escapes ] in alt text", () => {
    expect(escapeAltText("array[0]")).toBe("array\\[0\\]");
  });

  it("unescapeAltText restores escaped brackets", () => {
    expect(unescapeAltText("array\\[0\\]")).toBe("array[0]");
  });

  it("round-trips alt text containing ]", () => {
    const result = roundTrip(
      "array[0]",
      "https://example.com/img.png",
      escapeAltText,
      FIXED_IMPORT_RE,
      unescapeAltText,
    );
    expect(result).not.toBeNull();
    expect(result!.altText).toBe("array[0]");
    expect(result!.src).toBe("https://example.com/img.png");
  });

  it("round-trips alt text containing [ only", () => {
    const result = roundTrip(
      "see [docs",
      "https://example.com/img.png",
      escapeAltText,
      FIXED_IMPORT_RE,
      unescapeAltText,
    );
    expect(result).not.toBeNull();
    expect(result!.altText).toBe("see [docs");
  });

  it("round-trips alt text containing backslash", () => {
    const result = roundTrip(
      "path\\file",
      "https://example.com/img.png",
      escapeAltText,
      FIXED_IMPORT_RE,
      unescapeAltText,
    );
    expect(result).not.toBeNull();
    expect(result!.altText).toBe("path\\file");
  });

  it("round-trips plain alt text (no special chars)", () => {
    const result = roundTrip(
      "a nice photo",
      "https://example.com/img.png",
      escapeAltText,
      FIXED_IMPORT_RE,
      unescapeAltText,
    );
    expect(result).not.toBeNull();
    expect(result!.altText).toBe("a nice photo");
    expect(result!.src).toBe("https://example.com/img.png");
  });

  it("round-trips empty alt text", () => {
    const result = roundTrip(
      "",
      "https://example.com/img.png",
      escapeAltText,
      FIXED_IMPORT_RE,
      unescapeAltText,
    );
    expect(result).not.toBeNull();
    expect(result!.altText).toBe("");
  });

  it("fixed regex still works with Wikipedia-style URLs", () => {
    const result = roundTrip(
      "Markdown",
      "https://en.wikipedia.org/wiki/Markdown_(syntax)",
      escapeAltText,
      FIXED_IMPORT_RE,
      unescapeAltText,
    );
    expect(result).not.toBeNull();
    expect(result!.altText).toBe("Markdown");
    expect(result!.src).toBe("https://en.wikipedia.org/wiki/Markdown_(syntax)");
  });

  it("fixed regex still matches inline at end-of-line", () => {
    const FIXED_INLINE_RE = /!(?:\[((?:[^\]\\]|\\.)*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))$/;
    const md = "text ![array\\[0\\]](https://example.com/img.png)";
    const m = md.match(FIXED_INLINE_RE);
    expect(m).not.toBeNull();
    expect(unescapeAltText(m![1])).toBe("array[0]");
  });
});
