import * as vscode from "vscode";
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

/** Path fragments to skip */
const PRUNE_FRAGMENTS = [
  "dist-info", "egg-info", ".local/share", ".local/lib", ".local/state",
];

export interface MdFileItem {
  filePath: string;
  stat: fs.Stats;
}

/**
 * Tree item representing either a directory or a markdown file.
 */
export class MdTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly fullPath: string,
    public readonly isDirectory: boolean,
    public readonly fileCount?: number,
    collapsibleState?: vscode.TreeItemCollapsibleState,
  ) {
    super(
      label,
      collapsibleState ??
        (isDirectory
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None),
    );

    if (isDirectory) {
      this.contextValue = "mdDirectory";
      this.iconPath = new vscode.ThemeIcon("folder");
      if (fileCount !== undefined) {
        this.description = `${fileCount}`;
      }
      this.tooltip = fullPath;
    } else {
      this.contextValue = "mdFile";
      this.iconPath = new vscode.ThemeIcon("markdown");
      this.resourceUri = vscode.Uri.file(fullPath);
      this.tooltip = fullPath;
      this.command = {
        command: "mdExplorer.openFile",
        title: "Open File",
        arguments: [fullPath],
      };

      // Show relative path as description
      const rel = this.getShortPath(fullPath);
      if (rel) {
        this.description = rel;
      }
    }
  }

  private getShortPath(filePath: string): string {
    if (filePath.startsWith("/workspace/")) {
      return filePath.slice("/workspace/".length, filePath.lastIndexOf("/"));
    }
    if (filePath.startsWith("/home/dev/")) {
      return "~/" + filePath.slice("/home/dev/".length, filePath.lastIndexOf("/"));
    }
    return path.dirname(filePath);
  }
}

/**
 * Provides the tree data for the Markdown Explorer sidebar.
 * Scans /workspace and /home/dev for .md files, groups by directory.
 */
export class MdTreeProvider implements vscode.TreeDataProvider<MdTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MdTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _filter: string = "";
  private _allFiles: MdFileItem[] | null = null;
  private _filteredFiles: MdFileItem[] | null = null;

  private readonly searchPaths = ["/workspace", "/home/dev"];

  get filter(): string {
    return this._filter;
  }

  setFilter(filter: string): void {
    this._filter = filter.toLowerCase();
    this._filteredFiles = null; // Invalidate filtered cache only
    this._onDidChangeTreeData.fire();
  }

  clearFilter(): void {
    this._filter = "";
    this._filteredFiles = null;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._allFiles = null;
    this._filteredFiles = null;
    this._onDidChangeTreeData.fire();
  }

  /** Returns current file counts for the filter status badge */
  getCounts(): { filtered: number; total: number } {
    return {
      filtered: this._filteredFiles?.length ?? this._allFiles?.length ?? 0,
      total: this._allFiles?.length ?? 0,
    };
  }

  getTreeItem(element: MdTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MdTreeItem): Promise<MdTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    if (element.isDirectory) {
      return this.getDirectoryFiles(element.fullPath);
    }
    return [];
  }

  /**
   * Build the top-level tree: directories that contain .md files.
   */
  private async getRootItems(): Promise<MdTreeItem[]> {
    const files = await this.getAllFiles();
    if (files.length === 0) {
      return [
        new MdTreeItem(
          this._filter ? "No files match filter" : "No markdown files found",
          "",
          false,
          undefined,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    // Group by directory
    const groups = new Map<string, MdFileItem[]>();
    for (const file of files) {
      const dir = path.dirname(file.filePath);
      let group = groups.get(dir);
      if (!group) {
        group = [];
        groups.set(dir, group);
      }
      group.push(file);
    }

    // Sort directories: /workspace first, then alphabetically
    const sortedDirs = [...groups.keys()].sort((a, b) => {
      const aWs = a.startsWith("/workspace") ? 0 : 1;
      const bWs = b.startsWith("/workspace") ? 0 : 1;
      if (aWs !== bWs) return aWs - bWs;
      return a.localeCompare(b);
    });

    return sortedDirs.map((dir) => {
      // Create a readable label
      let label: string;
      if (dir.startsWith("/workspace/")) {
        label = dir.slice("/workspace/".length);
      } else if (dir === "/workspace") {
        label = "/workspace";
      } else if (dir.startsWith("/home/dev/")) {
        label = "~/" + dir.slice("/home/dev/".length);
      } else {
        label = dir;
      }

      const count = groups.get(dir)!.length;
      return new MdTreeItem(
        label,
        dir,
        true,
        count,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
    });
  }

  /**
   * Get the .md files within a specific directory (non-recursive, just the files).
   */
  private async getDirectoryFiles(dirPath: string): Promise<MdTreeItem[]> {
    const allFiles = await this.getAllFiles();
    const dirFiles = allFiles
      .filter((f) => path.dirname(f.filePath) === dirPath)
      .sort((a, b) => path.basename(a.filePath).localeCompare(path.basename(b.filePath)));

    return dirFiles.map(
      (f) =>
        new MdTreeItem(
          path.basename(f.filePath),
          f.filePath,
          false,
        ),
    );
  }

  /**
   * Scan filesystem for all .md files, with two-layer caching.
   * _allFiles caches the full scan; _filteredFiles caches after filter.
   */
  private async getAllFiles(): Promise<MdFileItem[]> {
    if (this._filteredFiles !== null) {
      return this._filteredFiles;
    }

    // Full scan if needed
    if (this._allFiles === null) {
      const files: MdFileItem[] = [];
      for (const searchPath of this.searchPaths) {
        if (fs.existsSync(searchPath)) {
          await this.scanDirectory(searchPath, files);
        }
      }
      this._allFiles = files;
    }

    // Apply filter
    if (this._filter) {
      this._filteredFiles = this._allFiles.filter((f) =>
        f.filePath.toLowerCase().includes(this._filter),
      );
    } else {
      this._filteredFiles = this._allFiles;
    }

    return this._filteredFiles;
  }

  /**
   * Recursively scan a directory for .md files, skipping pruned directories.
   */
  private async scanDirectory(dir: string, results: MdFileItem[]): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or other error — skip
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (PRUNE_DIRS.has(entry.name)) continue;
        if (PRUNE_FRAGMENTS.some((frag) => fullPath.includes(frag))) continue;
        await this.scanDirectory(fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        if (PRUNE_FRAGMENTS.some((frag) => fullPath.includes(frag))) continue;
        try {
          const stat = fs.statSync(fullPath);
          results.push({ filePath: fullPath, stat });
        } catch {
          // Skip inaccessible files
        }
      }
    }
  }
}
