import * as vscode from "vscode";
import { ExplorerViewProvider } from "./explorerViewProvider";
import { MarkdownEditorProvider } from "./markdownEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new ExplorerViewProvider(context.extensionUri);

  // Register the custom markdown editor
  context.subscriptions.push(MarkdownEditorProvider.register(context));

  // Set initial context for menu when clauses
  vscode.commands.executeCommand("setContext", "mdExplorer.filterVisible", false);
  vscode.commands.executeCommand("setContext", "mdExplorer.viewMode", "tree");

  // Register the webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ExplorerViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Watch for .md file changes
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.md");
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());

  // Commands
  context.subscriptions.push(
    watcher,

    vscode.commands.registerCommand("mdExplorer.refresh", () => {
      provider.refresh();
    }),

    vscode.commands.registerCommand("mdExplorer.showFilter", () => {
      vscode.commands.executeCommand("setContext", "mdExplorer.filterVisible", true);
      provider.toggleFilter(true);
    }),

    vscode.commands.registerCommand("mdExplorer.hideFilter", () => {
      vscode.commands.executeCommand("setContext", "mdExplorer.filterVisible", false);
      provider.toggleFilter(false);
    }),

    vscode.commands.registerCommand("mdExplorer.showTree", () => {
      vscode.commands.executeCommand("setContext", "mdExplorer.viewMode", "tree");
      provider.setViewMode("tree");
    }),

    vscode.commands.registerCommand("mdExplorer.showList", () => {
      vscode.commands.executeCommand("setContext", "mdExplorer.viewMode", "list");
      provider.setViewMode("list");
    }),

    vscode.commands.registerCommand("mdExplorer.collapseAll", () => {
      provider.collapseAll();
    }),

    vscode.commands.registerCommand("mdExplorer.openFile", (filePath: string) => {
      vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: true });
    }),
  );
}

export function deactivate() {}
