import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ExplorerTreeProvider, FileItem } from "./explorerViewProvider";
import { MarkdownEditorProvider } from "./markdownEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new ExplorerTreeProvider();

  // Register the custom markdown editor
  context.subscriptions.push(MarkdownEditorProvider.register(context));

  // Register native tree view
  const treeView = vscode.window.createTreeView("mdExplorerFiles", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Set initial context
  vscode.commands.executeCommand("setContext", "mdExplorer.mdOnly", true);

  // File system watcher with debounce
  let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  const debouncedRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => treeProvider.refresh(), 300);
  };

  const mdWatcher = vscode.workspace.createFileSystemWatcher("**/*.md");
  mdWatcher.onDidCreate(debouncedRefresh);
  mdWatcher.onDidDelete(debouncedRefresh);
  mdWatcher.onDidChange(debouncedRefresh);

  // Also watch for folder changes (any file create/delete triggers folder refresh)
  const allWatcher = vscode.workspace.createFileSystemWatcher("**/*");
  allWatcher.onDidCreate(debouncedRefresh);
  allWatcher.onDidDelete(debouncedRefresh);

  // Commands
  context.subscriptions.push(
    mdWatcher,
    allWatcher,

    vscode.commands.registerCommand("mdExplorer.refresh", () => {
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("mdExplorer.toggleMdOnly", () => {
      const newVal = !treeProvider.mdOnly;
      treeProvider.mdOnly = newVal;
      vscode.commands.executeCommand("setContext", "mdExplorer.mdOnly", newVal);
    }),

    vscode.commands.registerCommand("mdExplorer.newFile", async (item?: FileItem) => {
      const targetDir = resolveDir(item);
      if (!targetDir) return;

      const name = await vscode.window.showInputBox({
        prompt: "New Markdown File Name",
        placeHolder: "example.md",
        validateInput: (v) => {
          if (!v.trim()) return "Name is required";
          if (!v.endsWith(".md")) return "File must end with .md";
          if (fs.existsSync(path.join(targetDir, v))) return "File already exists";
          return undefined;
        },
      });
      if (!name) return;

      const filePath = path.join(targetDir, name);
      fs.writeFileSync(filePath, `# ${path.basename(name, ".md")}\n\n`);
      treeProvider.refresh();

      // Open the new file in the rich editor
      const uri = vscode.Uri.file(filePath);
      vscode.commands.executeCommand("vscode.openWith", uri, "mdExplorer.markdownEditor");
    }),

    vscode.commands.registerCommand("mdExplorer.newFolder", async (item?: FileItem) => {
      const targetDir = resolveDir(item);
      if (!targetDir) return;

      const name = await vscode.window.showInputBox({
        prompt: "New Folder Name",
        placeHolder: "my-folder",
        validateInput: (v) => {
          if (!v.trim()) return "Name is required";
          if (fs.existsSync(path.join(targetDir, v))) return "Folder already exists";
          return undefined;
        },
      });
      if (!name) return;

      fs.mkdirSync(path.join(targetDir, name), { recursive: true });
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("mdExplorer.rename", async (item?: FileItem) => {
      if (!item) return;
      const oldPath = item.uri.fsPath;
      const oldName = path.basename(oldPath);
      const dir = path.dirname(oldPath);

      const newName = await vscode.window.showInputBox({
        prompt: "Rename",
        value: oldName,
        valueSelection: [0, oldName.lastIndexOf(".")],
        validateInput: (v) => {
          if (!v.trim()) return "Name is required";
          if (v === oldName) return "Name unchanged";
          if (fs.existsSync(path.join(dir, v))) return "A file with that name already exists";
          return undefined;
        },
      });
      if (!newName) return;

      fs.renameSync(oldPath, path.join(dir, newName));
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("mdExplorer.delete", async (item?: FileItem) => {
      if (!item) return;
      const name = path.basename(item.uri.fsPath);
      const isDir = item.type === vscode.FileType.Directory;
      const label = isDir ? `folder "${name}" and all its contents` : `"${name}"`;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete ${label}?`,
        { modal: true },
        "Delete",
      );
      if (confirm !== "Delete") return;

      if (isDir) {
        fs.rmSync(item.uri.fsPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(item.uri.fsPath);
      }
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("mdExplorer.revealInExplorer", (item?: FileItem) => {
      if (!item) return;
      vscode.commands.executeCommand("revealFileInOS", item.uri);
    }),

    vscode.commands.registerCommand("mdExplorer.copyRelativePath", (item?: FileItem) => {
      if (!item) return;
      const relPath = vscode.workspace.asRelativePath(item.uri);
      vscode.env.clipboard.writeText(relPath);
      vscode.window.showInformationMessage(`Copied: ${relPath}`);
    }),

    vscode.commands.registerCommand("mdExplorer.openFile", (filePath: string) => {
      const uri = vscode.Uri.file(filePath);
      if (filePath.endsWith(".md")) {
        vscode.commands.executeCommand("vscode.openWith", uri, "mdExplorer.markdownEditor");
      } else {
        vscode.commands.executeCommand("vscode.open", uri);
      }
    }),
  );
}

function resolveDir(item?: FileItem): string | undefined {
  if (item) {
    if (item.type === vscode.FileType.Directory) {
      return item.uri.fsPath;
    }
    return path.dirname(item.uri.fsPath);
  }
  // Fallback: first workspace folder
  const ws = vscode.workspace.workspaceFolders;
  return ws?.[0]?.uri.fsPath;
}

export function deactivate() {}
