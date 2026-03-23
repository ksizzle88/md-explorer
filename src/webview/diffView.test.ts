import { describe, it, expect } from "vitest";
import { diffLines } from "diff";

/**
 * Tests for the diff algorithm used in DiffViewPlugin.
 * We test the underlying diff library behavior to ensure our
 * rendering logic handles the Change objects correctly.
 */

describe("diffLines", () => {
  it("returns no changes for identical text", () => {
    const changes = diffLines("hello\nworld\n", "hello\nworld\n");
    expect(changes.every((c) => !c.added && !c.removed)).toBe(true);
  });

  it("detects added lines", () => {
    const changes = diffLines("line1\n", "line1\nline2\n");
    const added = changes.filter((c) => c.added);
    expect(added.length).toBe(1);
    expect(added[0].value).toContain("line2");
  });

  it("detects removed lines", () => {
    const changes = diffLines("line1\nline2\n", "line1\n");
    const removed = changes.filter((c) => c.removed);
    expect(removed.length).toBe(1);
    expect(removed[0].value).toContain("line2");
  });

  it("detects modifications as remove + add", () => {
    const changes = diffLines("hello world\n", "hello earth\n");
    const removed = changes.filter((c) => c.removed);
    const added = changes.filter((c) => c.added);
    expect(removed.length).toBe(1);
    expect(added.length).toBe(1);
    expect(removed[0].value).toContain("world");
    expect(added[0].value).toContain("earth");
  });

  it("handles empty old text (all additions)", () => {
    const changes = diffLines("", "new content\n");
    const added = changes.filter((c) => c.added);
    expect(added.length).toBe(1);
  });

  it("handles empty new text (all deletions)", () => {
    const changes = diffLines("old content\n", "");
    const removed = changes.filter((c) => c.removed);
    expect(removed.length).toBe(1);
  });

  it("handles multi-line changes correctly", () => {
    const old = "# Title\n\nParagraph one.\n\nParagraph two.\n";
    const current = "# Title\n\nParagraph one modified.\n\nParagraph three.\n\nNew paragraph.\n";
    const changes = diffLines(old, current);
    const hasAdded = changes.some((c) => c.added);
    const hasRemoved = changes.some((c) => c.removed);
    expect(hasAdded).toBe(true);
    expect(hasRemoved).toBe(true);
  });
});

describe("diff line building logic", () => {
  it("builds correct left/right line arrays", () => {
    const changes = diffLines("line1\nline2\n", "line1\nline3\n");

    const leftLines: { text: string; type: string }[] = [];
    const rightLines: { text: string; type: string }[] = [];

    for (const change of changes) {
      const lines = change.value.replace(/\n$/, "").split("\n");
      const lineList = change.value === "" ? [] : lines;

      if (change.added) {
        for (const line of lineList) {
          leftLines.push({ text: "", type: "spacer" });
          rightLines.push({ text: line, type: "added" });
        }
      } else if (change.removed) {
        for (const line of lineList) {
          leftLines.push({ text: line, type: "removed" });
          rightLines.push({ text: "", type: "spacer" });
        }
      } else {
        for (const line of lineList) {
          leftLines.push({ text: line, type: "unchanged" });
          rightLines.push({ text: line, type: "unchanged" });
        }
      }
    }

    // Both arrays should have the same length
    expect(leftLines.length).toBe(rightLines.length);

    // line1 should be unchanged on both sides
    expect(leftLines[0]).toEqual({ text: "line1", type: "unchanged" });
    expect(rightLines[0]).toEqual({ text: "line1", type: "unchanged" });

    // line2 should be removed on left, spacer on right
    const removedIdx = leftLines.findIndex((l) => l.type === "removed");
    expect(removedIdx).toBeGreaterThan(-1);
    expect(leftLines[removedIdx].text).toBe("line2");
    expect(rightLines[removedIdx].type).toBe("spacer");

    // line3 should be added on right, spacer on left
    const addedIdx = rightLines.findIndex((l) => l.type === "added");
    expect(addedIdx).toBeGreaterThan(-1);
    expect(rightLines[addedIdx].text).toBe("line3");
    expect(leftLines[addedIdx].type).toBe("spacer");
  });
});
