import * as vscode from "vscode";

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

  private getHtmlForWebview(
    webview: vscode.Webview,
    scriptUri: vscode.Uri
  ): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: http: data:;">
  <title>Markdown Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
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
    .toolbar {
      display: flex;
      gap: 2px;
      padding: 4px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      background: var(--vscode-editor-background);
      position: sticky;
      top: 0;
      z-index: 10;
      flex-wrap: wrap;
      flex-shrink: 0;
      align-items: center;
      min-height: 36px;
    }
    .toolbar button {
      background: transparent;
      border: 1px solid transparent;
      color: var(--vscode-foreground, var(--vscode-editor-foreground));
      padding: 3px 7px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      min-width: 28px;
      line-height: 1.4;
    }
    .toolbar button:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
    }
    .toolbar button.active {
      background: var(--vscode-button-background, #0078d4);
      color: var(--vscode-button-foreground, #fff);
      border-color: transparent;
    }
    .toolbar .separator {
      width: 1px;
      align-self: stretch;
      background: var(--vscode-panel-border, #444);
      margin: 4px 6px;
    }
    .editor-shell {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .editor-content-area {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 48px;
      position: relative;
    }
    [contenteditable] {
      outline: none;
      min-height: calc(100vh - 100px);
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family, sans-serif));
      font-size: var(--vscode-editor-font-size, var(--vscode-font-size, 14px));
      line-height: 1.65;
    }
    [contenteditable] p {
      margin: 0 0 10px 0;
      line-height: 1.65;
    }
    [contenteditable] h1 {
      font-size: 2em;
      margin: 32px 0 16px;
      font-weight: 600;
      line-height: 1.25;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
    }
    [contenteditable] h2 {
      font-size: 1.5em;
      margin: 28px 0 12px;
      font-weight: 600;
      line-height: 1.3;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
    }
    [contenteditable] h3 { font-size: 1.25em; margin: 24px 0 10px; font-weight: 600; line-height: 1.35; }
    [contenteditable] h4 { font-size: 1.1em; margin: 20px 0 8px; font-weight: 600; line-height: 1.4; }
    [contenteditable] h5 { font-size: 1em; margin: 16px 0 6px; font-weight: 600; line-height: 1.4; }
    [contenteditable] h6 { font-size: 0.9em; margin: 14px 0 4px; font-weight: 600; line-height: 1.4; color: var(--vscode-descriptionForeground, #999); }
    [contenteditable] strong { font-weight: bold; }
    [contenteditable] em { font-style: italic; }
    [contenteditable] code {
      font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
      font-size: 0.875em;
      background: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.15));
      padding: 2px 6px;
      border-radius: 3px;
    }
    [contenteditable] pre {
      background: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.15));
      padding: 16px 20px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 16px 0;
      border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
    }
    [contenteditable] pre code {
      background: none;
      padding: 0;
      font-size: 0.9em;
      line-height: 1.5;
    }
    [contenteditable] blockquote {
      border-left: 4px solid var(--vscode-textBlockQuote-border, #007acc);
      padding: 4px 16px;
      margin: 14px 0;
      color: var(--vscode-textBlockQuote-foreground, #9e9e9e);
      background: var(--vscode-textBlockQuote-background, transparent);
    }
    [contenteditable] ul, [contenteditable] ol {
      padding-left: 28px;
      margin: 10px 0;
    }
    [contenteditable] li {
      margin: 4px 0;
      line-height: 1.65;
    }
    [contenteditable] li > ul, [contenteditable] li > ol {
      margin: 2px 0;
    }
    [contenteditable] a {
      color: var(--vscode-textLink-foreground, #3794ff);
      text-decoration: none;
    }
    [contenteditable] a:hover {
      text-decoration: underline;
      color: var(--vscode-textLink-activeForeground, #3794ff);
    }
    [contenteditable] hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border, #444);
      margin: 20px 0;
    }
    [contenteditable] img {
      max-width: 100%;
      border-radius: 4px;
    }
    [contenteditable] table {
      border-collapse: collapse;
      width: 100%;
      margin: 14px 0;
    }
    [contenteditable] th, [contenteditable] td {
      border: 1px solid var(--vscode-panel-border, #444);
      padding: 8px 12px;
      text-align: left;
    }
    [contenteditable] th {
      background: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.1));
      font-weight: 600;
    }
    .editor-placeholder {
      color: var(--vscode-input-placeholderForeground, #666);
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      user-select: none;
    }
    .editor-strikethrough {
      text-decoration: line-through;
    }
    /* Table selection and focus styles */
    [contenteditable] table td.editor-table-cell,
    [contenteditable] table th.editor-table-cell-header {
      position: relative;
    }
    [contenteditable] td:focus-within,
    [contenteditable] th:focus-within {
      outline: 2px solid var(--vscode-focusBorder, #007acc);
      outline-offset: -2px;
    }
    /* Table context menu */
    .table-context-menu {
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 4px;
      padding: 4px 0;
      min-width: 180px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .table-context-menu button {
      display: block;
      width: 100%;
      background: transparent;
      border: none;
      color: var(--vscode-menu-foreground, #ccc);
      padding: 6px 16px;
      text-align: left;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      line-height: 1.4;
    }
    .table-context-menu button:hover {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }
    .context-menu-separator {
      height: 1px;
      background: var(--vscode-menu-separatorBackground, #454545);
      margin: 4px 0;
    }
    /* Image node styles */
    .editor-image-wrapper {
      display: block;
      margin: 16px 0;
    }
    .editor-image {
      display: inline-block;
      position: relative;
      max-width: 100%;
      cursor: pointer;
      border: 2px solid transparent;
      border-radius: 4px;
      transition: border-color 0.15s;
    }
    .editor-image.selected {
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .editor-image img {
      display: block;
      max-width: 100%;
      border-radius: 4px;
    }
    .editor-image .image-alt-text {
      display: block;
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground, #999);
      margin-top: 4px;
      text-align: center;
      font-style: italic;
    }
    .editor-image .image-error {
      padding: 16px;
      background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
      border-radius: 4px;
      color: var(--vscode-errorForeground, #f48771);
      font-size: 0.9em;
    }
    .image-edit-form {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
      padding: 12px 16px;
      margin: 16px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .image-edit-form label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--vscode-foreground, #ccc);
    }
    .image-edit-form input {
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    .image-edit-form input:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .image-edit-buttons {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .image-edit-buttons button {
      background: var(--vscode-button-background, #0078d4);
      color: var(--vscode-button-foreground, #fff);
      border: none;
      padding: 4px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    .image-edit-buttons button:last-child {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #fff);
    }
    .image-edit-buttons button:hover {
      opacity: 0.9;
    }
    /* Slash command menu */
    .slash-command-menu {
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 6px;
      padding: 4px 0;
      min-width: 220px;
      max-height: 300px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    .slash-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      background: transparent;
      border: none;
      color: var(--vscode-menu-foreground, #ccc);
      padding: 6px 12px;
      text-align: left;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      line-height: 1.4;
    }
    .slash-menu-item:hover,
    .slash-menu-item.selected {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }
    .slash-menu-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2));
      color: var(--vscode-badge-foreground, #ccc);
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .slash-menu-item.selected .slash-menu-icon,
    .slash-menu-item:hover .slash-menu-icon {
      background: rgba(255, 255, 255, 0.15);
    }
    .slash-menu-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .slash-menu-label {
      font-weight: 500;
    }
    .slash-menu-description {
      font-size: 11px;
      opacity: 0.7;
    }
    /* Focus mode: dim all top-level blocks except the active one */
    .focus-mode > p,
    .focus-mode > h1,
    .focus-mode > h2,
    .focus-mode > h3,
    .focus-mode > h4,
    .focus-mode > h5,
    .focus-mode > h6,
    .focus-mode > ul,
    .focus-mode > ol,
    .focus-mode > blockquote,
    .focus-mode > pre,
    .focus-mode > table,
    .focus-mode > hr,
    .focus-mode > span {
      opacity: 0.25;
      transition: opacity 0.2s ease;
    }
    .focus-mode > .focus-active {
      opacity: 1;
      transition: opacity 0.2s ease;
    }
    /* Status bar */
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 2px 12px;
      border-top: 1px solid var(--vscode-panel-border, #444);
      background: var(--vscode-statusBar-background, var(--vscode-editor-background));
      color: var(--vscode-statusBar-foreground, var(--vscode-descriptionForeground, #999));
      font-size: 11px;
      flex-shrink: 0;
      min-height: 24px;
      user-select: none;
    }
    .status-bar-items {
      display: flex;
      gap: 0;
      align-items: center;
    }
    .status-bar-item {
      padding: 0 8px;
      border-right: 1px solid var(--vscode-panel-border, #444);
      line-height: 1;
    }
    .status-bar-item:last-child {
      border-right: none;
      padding-right: 0;
    }
    .status-bar-paragraph {
      opacity: 0.8;
      font-style: italic;
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
