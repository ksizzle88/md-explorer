/**
 * Utility functions for image alt text serialization.
 *
 * Brackets (`[` and `]`) inside alt text must be escaped so that
 * the markdown round-trip (export → import → export) is lossless.
 */

/** Escape backslashes and brackets in alt text for markdown image output. */
export function escapeImageAltText(alt: string): string {
  return alt.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Unescape `\\` → `\`, `\[` → `[`, `\]` → `]` when reading image alt text. */
export function unescapeImageAltText(alt: string): string {
  return alt.replace(/\\([\[\]\\])/g, "$1");
}
