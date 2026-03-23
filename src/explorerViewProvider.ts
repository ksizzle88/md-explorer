import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/** Directories to skip when scanning */
const PRUNE_DIRS = new Set([
  "node_modules", ".venv", "venv", "__pycache__", ".oh-my-zsh",
  ".terraform", ".git", "dbt_packages", "site-packages", ".nvm",
  ".npm", ".cache", "target", "vendor", "bower_components", ".tox",
  ".mypy_cache", ".pytest_cache", ".vscode-server", ".claudio",
  ".claudio-shared", ".claude-shared-plugins", "dist", "out",
]);

const PRUNE_FRAGMENTS = [
  "dist-info", "egg-info", ".local/share", ".local/lib", ".local/state",
];

export class FileItem {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly type: vscode.FileType,
    public readonly name: string,
  ) {}
}

export class ExplorerTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _mdOnly = true;
  private _mdCountCache = new Map<string, number>();

  private readonly _roots: string[];

  constructor() {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders && wsFolders.length > 0) {
      this._roots = wsFolders.map(f => f.uri.fsPath);
    } else {
      this._roots = ["/workspace", "/home/dev"].filter(p => fs.existsSync(p));
    }
  }

  get mdOnly(): boolean {
    return this._mdOnly;
  }

  set mdOnly(val: boolean) {
    this._mdOnly = val;
    this._mdCountCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this._mdCountCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    if (element.type === vscode.FileType.Directory) {
      const item = new vscode.TreeItem(
        element.uri,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.label = element.name;
      item.contextValue = "folder";
      item.iconPath = vscode.ThemeIcon.Folder;
      const count = this.countMdFiles(element.uri.fsPath);
      if (count > 0) {
        item.description = `${count}`;
      }
      return item;
    }

    const item = new vscode.TreeItem(element.uri, vscode.TreeItemCollapsibleState.None);
    item.label = element.name;
    item.contextValue = element.name.endsWith(".md") ? "mdFile" : "file";
    item.iconPath = vscode.ThemeIcon.File;
    item.tooltip = vscode.workspace.asRelativePath(element.uri);

    // Open .md files in the rich editor, others in default text editor
    if (element.name.endsWith(".md")) {
      item.command = {
        command: "vscode.openWith",
        title: "Open in Markdown Editor",
        arguments: [element.uri, "mdExplorer.markdownEditor"],
      };
    } else {
      item.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [element.uri],
      };
    }

    return item;
  }

  getChildren(element?: FileItem): FileItem[] {
    if (!element) {
      // If single root, show its contents directly
      if (this._roots.length === 1) {
        return this.readDir(this._roots[0]);
      }
      // Multiple roots: show root nodes
      return this._roots
        .filter(r => fs.existsSync(r))
        .map(r => new FileItem(
          vscode.Uri.file(r),
          vscode.FileType.Directory,
          r === "/home/dev" ? "~" : path.basename(r),
        ));
    }
    return this.readDir(element.uri.fsPath);
  }

  getParent(element: FileItem): FileItem | undefined {
    const parentPath = path.dirname(element.uri.fsPath);
    // Don't go above roots
    if (this._roots.includes(element.uri.fsPath)) {
      return undefined;
    }
    const isDir = fs.existsSync(parentPath) && fs.statSync(parentPath).isDirectory();
    if (!isDir) return undefined;
    return new FileItem(
      vscode.Uri.file(parentPath),
      vscode.FileType.Directory,
      path.basename(parentPath),
    );
  }

  private readDir(dirPath: string): FileItem[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const folders: FileItem[] = [];
    const files: FileItem[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (PRUNE_DIRS.has(entry.name)) continue;
        if (PRUNE_FRAGMENTS.some(f => fullPath.includes(f))) continue;

        // In md-only mode, skip folders with no md files inside
        if (this._mdOnly) {
          const count = this.countMdFiles(fullPath);
          if (count === 0) continue;
        }

        folders.push(new FileItem(
          vscode.Uri.file(fullPath),
          vscode.FileType.Directory,
          entry.name,
        ));
      } else if (entry.isFile()) {
        if (this._mdOnly && !entry.name.endsWith(".md")) continue;
        if (PRUNE_FRAGMENTS.some(f => fullPath.includes(f))) continue;
        files.push(new FileItem(
          vscode.Uri.file(fullPath),
          vscode.FileType.File,
          entry.name,
        ));
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...folders, ...files];
  }

  /** Recursively count .md files under a directory (cached). */
  private countMdFiles(dirPath: string): number {
    const cached = this._mdCountCache.get(dirPath);
    if (cached !== undefined) return cached;

    let count = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (PRUNE_DIRS.has(entry.name)) continue;
          if (PRUNE_FRAGMENTS.some(f => fullPath.includes(f))) continue;
          count += this.countMdFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          if (PRUNE_FRAGMENTS.some(f => fullPath.includes(f))) continue;
          count++;
        }
      }
    } catch {
      // Permission denied or similar — treat as 0
    }

    this._mdCountCache.set(dirPath, count);
    return count;
  }
}
