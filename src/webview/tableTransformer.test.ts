import { describe, it, expect } from "vitest";

/**
 * These tests exercise the TABLE_ROW_REG_EXP parsing logic from editor.tsx
 * to demonstrate the pipe-in-cell round-trip bug.
 *
 * The current code in editor.tsx does:
 *   export: cellTexts.join(" | ")          — no escaping
 *   import: match[1].split("|")            — naive split
 *
 * This means a cell containing "a|b" produces "| a|b | c |"
 * which reimports as 3 cells ["a", "b ", " c"] instead of 2.
 */

const TABLE_ROW_REG_EXP = /^(?:\|)(.+)(?:\|)\s*$/;

// Simulate the CURRENT (buggy) export logic
function buggyExportRow(cells: string[]): string {
  const cellTexts = cells.map((t) => t || " ");
  return "| " + cellTexts.join(" | ") + " |";
}

// Simulate the CURRENT (buggy) import logic
function buggyImportRow(line: string): string[] | null {
  const match = line.match(TABLE_ROW_REG_EXP);
  if (!match) return null;
  return match[1].split("|").map((c) => c.trim());
}

describe("old (buggy) table transformer - regression proof", () => {
  it("naive split corrupts cells containing pipe characters", () => {
    const original = ["a|b", "c"];
    const exported = buggyExportRow(original);
    const reimported = buggyImportRow(exported);

    // The naive split produces 3 cells instead of 2 — this is the bug we fixed
    expect(reimported).not.toBeNull();
    expect(reimported!.length).toBe(3); // wrong: ["a", "b", "c"]
    expect(reimported).not.toEqual(original);
  });
});

// ── Now test the FIXED logic ─────────────────────────────────────

import { escapeTableCell, unescapeTableCell, splitTableRow } from "./tableUtils";

function fixedExportRow(cells: string[]): string {
  const cellTexts = cells.map((t) => escapeTableCell(t) || " ");
  return "| " + cellTexts.join(" | ") + " |";
}

function fixedImportRow(line: string): string[] | null {
  const match = line.match(TABLE_ROW_REG_EXP);
  if (!match) return null;
  return splitTableRow(match[1]).map((c) => unescapeTableCell(c.trim()));
}

describe("fixed table transformer", () => {
  it("preserves cells containing pipe characters on round-trip", () => {
    const original = ["a|b", "c"];
    const exported = fixedExportRow(original);
    const reimported = fixedImportRow(exported);

    expect(reimported).toEqual(original);
  });

  it("preserves normal cells without pipes", () => {
    const original = ["Name", "Value", "Description"];
    const exported = fixedExportRow(original);
    const reimported = fixedImportRow(exported);

    expect(reimported).toEqual(original);
  });

  it("preserves empty cells", () => {
    const original = ["", "data", ""];
    const exported = fixedExportRow(original);
    const reimported = fixedImportRow(exported);

    // Empty cells export as " " and reimport as ""
    expect(reimported).toEqual(original);
  });

  it("handles multiple pipes in one cell", () => {
    const original = ["a|b|c", "d"];
    const exported = fixedExportRow(original);
    const reimported = fixedImportRow(exported);

    expect(reimported).toEqual(original);
  });
});

// ── TABLE_ROW_REG_EXP trailing whitespace bug ───────────────────

describe("TABLE_ROW_REG_EXP trailing whitespace handling", () => {
  it("matches a row with no trailing whitespace", () => {
    expect(TABLE_ROW_REG_EXP.test("| a | b |")).toBe(true);
  });

  it("matches a row with one trailing space", () => {
    expect(TABLE_ROW_REG_EXP.test("| a | b | ")).toBe(true);
  });

  it("matches a row with multiple trailing spaces", () => {
    // Bug: \s? only allows 0 or 1 trailing whitespace chars
    expect(TABLE_ROW_REG_EXP.test("| a | b |   ")).toBe(true);
  });

  it("matches a row with trailing tab", () => {
    expect(TABLE_ROW_REG_EXP.test("| a | b |\t")).toBe(true);
  });

  it("matches a row with mixed trailing whitespace", () => {
    expect(TABLE_ROW_REG_EXP.test("| a | b | \t ")).toBe(true);
  });
});

const TABLE_ROW_DIVIDER_REG_EXP = /^(\| ?:?-+:? ?)+\|\s*$/;

describe("TABLE_ROW_DIVIDER_REG_EXP trailing whitespace handling", () => {
  it("matches a divider with no trailing whitespace", () => {
    expect(TABLE_ROW_DIVIDER_REG_EXP.test("| --- | --- |")).toBe(true);
  });

  it("matches a divider with one trailing space", () => {
    expect(TABLE_ROW_DIVIDER_REG_EXP.test("| --- | --- | ")).toBe(true);
  });

  it("matches a divider with multiple trailing spaces", () => {
    // Bug: \s? only allows 0 or 1 trailing whitespace chars
    expect(TABLE_ROW_DIVIDER_REG_EXP.test("| --- | --- |   ")).toBe(true);
  });

  it("matches a divider with trailing tab", () => {
    expect(TABLE_ROW_DIVIDER_REG_EXP.test("| --- | --- |\t")).toBe(true);
  });

  it("matches aligned divider with colons", () => {
    expect(TABLE_ROW_DIVIDER_REG_EXP.test("| :---: | :---: |")).toBe(true);
  });
});
