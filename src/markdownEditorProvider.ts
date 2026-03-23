import * as vscode from "vscode";
import { execSync } from "child_process";
import * as path from "path";

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mdExplorer.markdownEditor";

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "out"),
      ],
    };

    const scriptUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "webview.js")
    );

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      scriptUri
    );

    let isWebviewEdit = false;
    let isUpdatingFromExtension = false;

    // Send initial content to webview
    const updateWebview = () => {
      isUpdatingFromExtension = true;
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText(),
      });
    };

    // Listen for changes from the webview
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.type === "ready") {
          updateWebview();
        } else if (msg.type === "requestSavedVersion") {
          this.getSavedVersion(document).then((savedText) => {
            webviewPanel.webview.postMessage({
              type: "savedVersion",
              text: savedText,
            });
          });
        } else if (msg.type === "edit") {
          isWebviewEdit = true;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            msg.text
          );
          vscode.workspace.applyEdit(edit).then(undefined, (err) => {
            console.error("Failed to apply edit:", err);
          });
        }
      }
    );

    // Listen for document changes (e.g. from other editors or undo/redo)
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        if (isWebviewEdit) {
          // This change originated from the webview — don't send it back
          isWebviewEdit = false;
        } else if (!isUpdatingFromExtension) {
          // External change (other editor, undo from VS Code, etc.)
          updateWebview();
        }
        isUpdatingFromExtension = false;
      }
    });

    webviewPanel.onDidDispose(() => {
      messageDisposable.dispose();
      changeDisposable.dispose();
    });
  }

  /**
   * Get the last saved version of a document.
   * Tries git HEAD first, falls back to the on-disk version.
   */
  private async getSavedVersion(
    document: vscode.TextDocument
  ): Promise<string> {
    const filePath = document.uri.fsPath;

    // Try to get the git HEAD version
    try {
      const cwd = path.dirname(filePath);
      const relativePath = path.relative(cwd, filePath);
      const gitContent = execSync(
        `git show HEAD:${JSON.stringify(relativePath)}`,
        { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
      return gitContent;
    } catch {
      // Not in a git repo or file not tracked — fall back to disk
    }

    // Fall back to what's on disk (the last saved version)
    try {
      const diskContent = await vscode.workspace.fs.readFile(document.uri);
      return Buffer.from(diskContent).toString("utf-8");
    } catch {
      return "";
    }
  }

  private getHtmlForWebview(
    webview: vscode.Webview,
    scriptUri: vscode.Uri
  ): string {
    const nonce = getNonce();

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "webview.css")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: http: data:; font-src ${webview.cspSource} data:;">
  <title>Markdown Editor</title>
  <link rel="stylesheet" href="${cssUri}">
  <style>
    /* Minimal inline styles — bulk theming is in vscode-theme-overrides.css */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 14px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    #app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
    }
    .editor-shell {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
    }
    .ContentEditable__root {
      min-height: calc(100vh - 120px);
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
