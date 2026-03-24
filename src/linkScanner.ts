import * as path from "path";
import * as fs from "fs";

/** Directories to skip when scanning for backlinks */
const PRUNE_DIRS = new Set([
  "node_modules", ".venv", "venv", "__pycache__", ".oh-my-zsh",
  ".terraform", ".git", "dbt_packages", "site-packages", ".nvm",
  ".npm", ".cache", "target", "vendor", "bower_components", ".tox",
  ".mypy_cache", ".pytest_cache", ".vscode-server", ".claudio",
  ".claudio-shared", ".claude-shared-plugins", "dist", "out",
]);

/** A single backlink reference */
export interface Backlink {
  sourceFile: string;
  lineNumber: number;
  lineText: string;
  linkTarget: string;
}

// Regex for [[wiki-style links]] — captures the target (before | alias)
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

// Regex for [text](path) markdown links — only match relative .md paths
const MD_LINK_RE = /\[(?:[^\]\\]|\\.)*\]\(([^)]+\.md(?:#[^)]*)?)\)/g;

/**
 * Scan a single line for links and return raw link targets.
 */
export function extractLinksFromLine(line: string): string[] {
  const targets: string[] = [];

  let m: RegExpExecArray | null;
  WIKI_LINK_RE.lastIndex = 0;
  while ((m = WIKI_LINK_RE.exec(line)) !== null) {
    targets.push(m[1].trim());
  }

  MD_LINK_RE.lastIndex = 0;
  while ((m = MD_LINK_RE.exec(line)) !== null) {
    const href = m[1].trim();
    if (!href.startsWith("http:") && !href.startsWith("https:") && !href.startsWith("mailto:")) {
      targets.push(href.replace(/#.*$/, ""));
    }
  }

  return targets;
}

/**
 * Resolve a link target to an absolute file path.
 */
function resolveLink(
  linkTarget: string,
  sourceFile: string,
  mdFilesByBasename: Map<string, string[]>,
): string | undefined {
  if (linkTarget.includes("/") || linkTarget.endsWith(".md")) {
    const sourceDir = path.dirname(sourceFile);
    const resolved = path.resolve(sourceDir, linkTarget);
    const withExt = resolved.endsWith(".md") ? resolved : resolved + ".md";
    if (fs.existsSync(withExt)) return withExt;
    if (!resolved.endsWith(".md") && fs.existsSync(resolved)) return resolved;
    return undefined;
  }

  const searchName = linkTarget.toLowerCase();
  const candidates = mdFilesByBasename.get(searchName);
  if (candidates && candidates.length > 0) {
    return candidates.sort((a, b) => a.length - b.length)[0];
  }
  return undefined;
}

/**
 * Recursively collect all .md file paths under a directory.
 */
export function collectMdFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (PRUNE_DIRS.has(entry.name)) continue;
        walk(path.join(d, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(path.join(d, entry.name));
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Build a map of basename (without .md, lowercase) → absolute paths.
 */
function buildBasenameIndex(files: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    const base = path.basename(f, ".md").toLowerCase();
    const list = map.get(base) ?? [];
    list.push(f);
    map.set(base, list);
  }
  return map;
}

/**
 * Scan all .md files and find backlinks to a specific target file.
 */
export function findBacklinks(targetFile: string, mdFiles: string[]): Backlink[] {
  const basenameIndex = buildBasenameIndex(mdFiles);
  const targetNorm = path.resolve(targetFile);
  const backlinks: Backlink[] = [];

  for (const sourceFile of mdFiles) {
    if (path.resolve(sourceFile) === targetNorm) continue;

    let content: string;
    try {
      content = fs.readFileSync(sourceFile, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const linkTargets = extractLinksFromLine(line);
      for (const lt of linkTargets) {
        const resolved = resolveLink(lt, sourceFile, basenameIndex);
        if (resolved && path.resolve(resolved) === targetNorm) {
          backlinks.push({
            sourceFile,
            lineNumber: i + 1,
            lineText: line.trim(),
            linkTarget: lt,
          });
        }
      }
    }
  }

  return backlinks;
}
