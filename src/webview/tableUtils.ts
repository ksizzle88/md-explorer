/**
 * Utility functions for markdown table cell serialization.
 *
 * Pipe characters inside table cells must be escaped as `\|` so that
 * the markdown round-trip (export → import → export) is lossless.
 */

/** Escape pipe characters in a cell value for markdown table output. */
export function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/** Unescape `\|` back to `|` when reading a markdown table cell. */
export function unescapeTableCell(text: string): string {
  return text.replace(/\\\|/g, "|");
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
    if (inner[i] === "\\" && i + 1 < inner.length && inner[i + 1] === "|") {
      current += "\\|";
      i++; // skip the pipe
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
