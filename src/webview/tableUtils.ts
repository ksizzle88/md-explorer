/**
 * Utility functions for markdown table cell serialization.
 *
 * Pipe characters inside table cells must be escaped as `\|` so that
 * the markdown round-trip (export → import → export) is lossless.
 */

/** Escape backslashes and pipe characters in a cell value for markdown table output. */
export function escapeTableCell(text: string): string {
  // Escape backslashes first, then pipes, so existing `\` don't get
  // confused with the escape prefix for `|` on the next import.
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** Unescape `\\` → `\` and `\|` → `|` when reading a markdown table cell. */
export function unescapeTableCell(text: string): string {
  // Single-pass replacement: any `\` followed by `\` or `|` collapses
  // to just the second character.
  return text.replace(/\\([\\|])/g, "$1");
}

/**
 * Split a markdown table row's inner content (between the outer pipes)
 * into individual cell strings, respecting escaped pipes (`\|`).
 *
 * Example: `" a \\| b | c "` → `["a \\| b", "c"]`  (raw splits, trimmed)
 */
export function splitTableRow(inner: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && i + 1 < inner.length && (inner[i + 1] === "|" || inner[i + 1] === "\\")) {
      current += inner[i] + inner[i + 1];
      i++; // skip the escaped character
    } else if (inner[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += inner[i];
    }
  }
  cells.push(current.trim());
  return cells;
}
