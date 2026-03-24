import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Backlink, collectMdFiles, findBacklinks } from "./linkScanner";

// --- Tree items ---

type BacklinkTreeItem = BacklinkFileGroup | BacklinkLineItem;

class BacklinkFileGroup extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly backlinks: Backlink[],
  ) {
    super(
      path.basename(filePath),
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.description = vscode.workspace.asRelativePath(filePath);
    this.iconPath = vscode.ThemeIcon.File;
    this.resourceUri = vscode.Uri.file(filePath);
  }
}

class BacklinkLineItem extends vscode.TreeItem {
  constructor(public readonly backlink: Backlink) {
    super(backlink.lineText, vscode.TreeItemCollapsibleState.None);
    this.description = `Line ${backlink.lineNumber}`;
    this.iconPath = new vscode.ThemeIcon("link");
    this.tooltip = `${backlink.lineText}\n\nClick to open ${path.basename(backlink.sourceFile)} at line ${backlink.lineNumber}`;
    this.command = {
      command: "vscode.openWith",
      title: "Open Source File",
      arguments: [
        vscode.Uri.file(backlink.sourceFile),
        "mdExplorer.markdownEditor",
      ],
    };
  }
}

// --- Provider ---

export class BacklinksProvider implements vscode.TreeDataProvider<BacklinkTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BacklinkTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _currentFile: string | undefined;
  private _cachedBacklinks: Backlink[] = [];
  private _mdFiles: string[] = [];
  private _mdFilesStale = true;

  private readonly _roots: string[];

  constructor() {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders && wsFolders.length > 0) {
      this._roots = wsFolders.map(f => f.uri.fsPath);
    } else {
      this._roots = ["/workspace"].filter(p => fs.existsSync(p));
    }
  }

  /** Mark the md file list as stale (call on file create/delete) */
  invalidateFileList(): void {
    this._mdFilesStale = true;
  }

  /** Refresh backlinks for the current file */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Set the current file and refresh */
  setCurrentFile(filePath: string | undefined): void {
    if (filePath === this._currentFile) return;
    this._currentFile = filePath;
    this._cachedBacklinks = [];
    this.refresh();
  }

  private ensureMdFiles(): string[] {
    if (this._mdFilesStale || this._mdFiles.length === 0) {
      this._mdFiles = [];
      for (const root of this._roots) {
        this._mdFiles.push(...collectMdFiles(root));
      }
      this._mdFilesStale = false;
    }
    return this._mdFiles;
  }

  getTreeItem(element: BacklinkTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BacklinkTreeItem): BacklinkTreeItem[] {
    if (!this._currentFile) return [];

    // Top level: grouped by source file
    if (!element) {
      const mdFiles = this.ensureMdFiles();
      this._cachedBacklinks = findBacklinks(this._currentFile, mdFiles);

      if (this._cachedBacklinks.length === 0) return [];

      // Group by source file
      const grouped = new Map<string, Backlink[]>();
      for (const bl of this._cachedBacklinks) {
        const list = grouped.get(bl.sourceFile) ?? [];
        list.push(bl);
        grouped.set(bl.sourceFile, list);
      }

      return Array.from(grouped.entries())
        .sort(([a], [b]) => path.basename(a).localeCompare(path.basename(b)))
        .map(([filePath, bls]) => new BacklinkFileGroup(filePath, bls));
    }

    // Second level: individual line references
    if (element instanceof BacklinkFileGroup) {
      return element.backlinks
        .sort((a, b) => a.lineNumber - b.lineNumber)
        .map(bl => new BacklinkLineItem(bl));
    }

    return [];
  }
}
