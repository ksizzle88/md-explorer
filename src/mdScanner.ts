import * as path from "path";
import * as fs from "fs";

/** Directories to skip when scanning for markdown files */
const PRUNE_DIRS = new Set([
  "node_modules", ".venv", "venv", "__pycache__", ".oh-my-zsh",
  ".terraform", ".git", "dbt_packages", "site-packages", ".nvm",
  ".npm", ".cache", "target", "vendor", "bower_components", ".tox",
  ".mypy_cache", ".pytest_cache", ".vscode-server", ".claudio",
  ".claudio-shared", ".claude-shared-plugins",
]);

const PRUNE_FRAGMENTS = [
  "dist-info", "egg-info", ".local/share", ".local/lib", ".local/state",
];

export interface MdFile {
  name: string;
  fullPath: string;
  relPath: string; // relative to search root, e.g. "tasks/foo/bar.md"
}

export interface MdDirectory {
  label: string;
  fullPath: string;
  files: MdFile[];
}

export interface TreeNode {
  name: string;        // display label (may be compacted: "superpowers/plans")
  fullPath: string;    // absolute path of the deepest directory in this node
  files: MdFile[];     // .md files directly in this directory
  children: TreeNode[];
}

const SEARCH_PATHS = ["/workspace", "/home/dev"];

/** Scan /workspace and /home/dev for .md files as nested trees with compaction. */
export function scanMarkdownTree(): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const searchRoot of SEARCH_PATHS) {
    if (!fs.existsSync(searchRoot)) continue;

    const filesByDir = new Map<string, MdFile[]>();
    scanDir(searchRoot, filesByDir, searchRoot);

    if (filesByDir.size === 0) continue;

    // Build tree from flat directory map
    const rootLabel = searchRoot === "/home/dev" ? "~" : searchRoot;
    const root: TreeNode = { name: rootLabel, fullPath: searchRoot, files: [], children: [] };
    const nodeMap = new Map<string, TreeNode>();
    nodeMap.set(searchRoot, root);

    // Sort directory paths so parents are created before children
    const sortedDirs = [...filesByDir.keys()].sort();

    for (const dirPath of sortedDirs) {
      const node = ensureNode(searchRoot, dirPath, nodeMap);
      node.files = filesByDir.get(dirPath)!.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Sort children alphabetically at every level
    sortChildren(root);

    // Compact: merge single-child-no-files nodes
    compactTree(root);

    // Only include root if it has content
    if (root.files.length > 0 || root.children.length > 0) {
      roots.push(root);
    }
  }

  return roots;
}

/** Ensure all intermediate tree nodes exist from searchRoot down to dirPath. */
function ensureNode(searchRoot: string, dirPath: string, nodeMap: Map<string, TreeNode>): TreeNode {
  const existing = nodeMap.get(dirPath);
  if (existing) return existing;

  const parentPath = path.dirname(dirPath);
  const parent = ensureNode(searchRoot, parentPath, nodeMap);

  const node: TreeNode = {
    name: path.basename(dirPath),
    fullPath: dirPath,
    files: [],
    children: [],
  };
  parent.children.push(node);
  nodeMap.set(dirPath, node);
  return node;
}

/** Recursively sort children alphabetically. */
function sortChildren(node: TreeNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of node.children) sortChildren(child);
}

/** Bottom-up compaction: merge a node with its only child if it has no files. */
function compactTree(node: TreeNode): void {
  // Compact children first (bottom-up)
  for (const child of node.children) compactTree(child);

  // Merge single-child-no-files nodes
  while (node.children.length === 1 && node.files.length === 0) {
    const only = node.children[0];
    node.name = node.name + "/" + only.name;
    node.fullPath = only.fullPath;
    node.files = only.files;
    node.children = only.children;
  }
}

/** Scan /workspace and /home/dev for .md files, grouped by directory. (legacy) */
export function scanMarkdownFiles(): MdDirectory[] {
  const filesByDir = new Map<string, MdFile[]>();

  for (const searchPath of SEARCH_PATHS) {
    if (fs.existsSync(searchPath)) {
      scanDir(searchPath, filesByDir, searchPath);
    }
  }

  const dirs = [...filesByDir.entries()]
    .map(([dirPath, files]) => ({
      label: makeLabel(dirPath),
      fullPath: dirPath,
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const aWs = a.fullPath.startsWith("/workspace") ? 0 : 1;
      const bWs = b.fullPath.startsWith("/workspace") ? 0 : 1;
      if (aWs !== bWs) return aWs - bWs;
      return a.fullPath.localeCompare(b.fullPath);
    });

  return dirs;
}

function makeLabel(dirPath: string): string {
  if (dirPath.startsWith("/workspace/")) return dirPath.slice("/workspace/".length);
  if (dirPath === "/workspace") return "/workspace";
  if (dirPath.startsWith("/home/dev/")) return "~/" + dirPath.slice("/home/dev/".length);
  return dirPath;
}

function scanDir(dir: string, results: Map<string, MdFile[]>, searchRoot: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) continue;
      if (PRUNE_FRAGMENTS.some((f) => fullPath.includes(f))) continue;
      scanDir(fullPath, results, searchRoot);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      if (PRUNE_FRAGMENTS.some((f) => fullPath.includes(f))) continue;
      let files = results.get(dir);
      if (!files) {
        files = [];
        results.set(dir, files);
      }
      const relPath = path.relative(searchRoot, fullPath);
      files.push({ name: entry.name, fullPath, relPath });
    }
  }
}