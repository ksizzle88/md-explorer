import { describe, it, expect } from "vitest";
import { escapeTableCell, unescapeTableCell, splitTableRow } from "./tableUtils";

describe("escapeTableCell", () => {
  it("returns plain text unchanged", () => {
    expect(escapeTableCell("hello")).toBe("hello");
  });

  it("escapes a single pipe", () => {
    expect(escapeTableCell("a|b")).toBe("a\\|b");
  });

  it("escapes multiple pipes", () => {
    expect(escapeTableCell("a|b|c")).toBe("a\\|b\\|c");
  });

  it("handles empty string", () => {
    expect(escapeTableCell("")).toBe("");
  });
});

describe("unescapeTableCell", () => {
  it("returns plain text unchanged", () => {
    expect(unescapeTableCell("hello")).toBe("hello");
  });

  it("unescapes a single escaped pipe", () => {
    expect(unescapeTableCell("a\\|b")).toBe("a|b");
  });

  it("unescapes multiple escaped pipes", () => {
    expect(unescapeTableCell("a\\|b\\|c")).toBe("a|b|c");
  });

  it("does not touch unescaped backslashes", () => {
    expect(unescapeTableCell("a\\nb")).toBe("a\\nb");
  });
});

describe("splitTableRow", () => {
  it("splits simple cells", () => {
    expect(splitTableRow(" a | b | c ")).toEqual(["a", "b", "c"]);
  });

  it("keeps escaped pipes inside cells", () => {
    // "a \\| b | c" should produce two cells, not three
    expect(splitTableRow(" a \\| b | c ")).toEqual(["a \\| b", "c"]);
  });

  it("handles multiple escaped pipes in one cell", () => {
    expect(splitTableRow(" a \\| b \\| c | d ")).toEqual(["a \\| b \\| c", "d"]);
  });

  it("handles empty cells", () => {
    expect(splitTableRow(" | b | ")).toEqual(["", "b", ""]);
  });
});

describe("round-trip: escape then unescape", () => {
  it("round-trips a cell with a pipe character", () => {
    const original = "a|b";
    const escaped = escapeTableCell(original);
    const unescaped = unescapeTableCell(escaped);
    expect(unescaped).toBe(original);
  });
});

describe("round-trip: split respects escaped pipes", () => {
  it("a row with an escaped pipe produces the correct number of cells", () => {
    // Simulate what export would produce for cells ["a|b", "c"]
    const cells = ["a|b", "c"];
    const row = cells.map(escapeTableCell).join(" | ");
    const parsed = splitTableRow(row).map(unescapeTableCell);
    expect(parsed).toEqual(cells);
  });
});
